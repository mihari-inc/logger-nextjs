import type { LogEntry, TransportConfig, IngestResponse } from "./types";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;

/**
 * Compress data using gzip via pako.
 * Falls back to uncompressed if pako is unavailable (e.g., edge runtime).
 */
async function compressGzip(data: string): Promise<{ body: Uint8Array | string; compressed: boolean }> {
  try {
    const pako = await import("pako");
    const compressed = pako.gzip(new TextEncoder().encode(data));
    return { body: compressed, compressed: true };
  } catch {
    return { body: data, compressed: false };
  }
}

/**
 * HTTP transport with batching, retry, and gzip compression.
 *
 * Collects log entries in an internal buffer and flushes them
 * in batches to the Mihari ingest API.
 */
export class Transport {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly useGzip: boolean;

  private buffer: readonly LogEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  constructor(config: TransportConfig) {
    this.endpoint = config.endpoint;
    this.token = config.token;
    this.batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE;
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.useGzip = config.gzip ?? true;

    this.startFlushTimer();
  }

  /** Enqueue a log entry. Triggers a flush when batch size is reached. */
  enqueue(entry: LogEntry): void {
    this.buffer = [...this.buffer, entry];

    if (this.buffer.length >= this.batchSize) {
      void this.flush();
    }
  }

  /** Flush all buffered entries to the API. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) {
      return;
    }

    this.flushing = true;
    const entries = this.buffer;
    this.buffer = [];

    try {
      await this.send(entries);
    } catch (err) {
      // Re-add failed entries to the front of the buffer for retry
      this.buffer = [...entries, ...this.buffer];
      if (typeof console !== "undefined") {
        console.error("[mihari] Failed to flush logs:", err);
      }
    } finally {
      this.flushing = false;
    }
  }

  /** Stop the flush timer and flush remaining entries. */
  async shutdown(): Promise<void> {
    this.stopFlushTimer();
    await this.flush();
  }

  /** Returns the current number of buffered entries. */
  get pendingCount(): number {
    return this.buffer.length;
  }

  private startFlushTimer(): void {
    if (typeof setInterval !== "undefined" && this.timer === null) {
      this.timer = setInterval(() => {
        void this.flush();
      }, this.flushIntervalMs);

      // Allow Node.js to exit even if the timer is running
      if (typeof this.timer === "object" && "unref" in this.timer) {
        this.timer.unref();
      }
    }
  }

  private stopFlushTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async send(entries: readonly LogEntry[]): Promise<IngestResponse> {
    const payload = JSON.stringify(entries);

    let body: Uint8Array | string = payload;
    let compressed = false;

    if (this.useGzip) {
      const result = await compressGzip(payload);
      body = result.body;
      compressed = result.compressed;
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };

    if (compressed) {
      headers["Content-Encoding"] = "gzip";
    }

    return this.sendWithRetry(body, headers, 0);
  }

  private async sendWithRetry(
    body: Uint8Array | string,
    headers: Record<string, string>,
    attempt: number
  ): Promise<IngestResponse> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        body,
      });

      if (response.status === 202) {
        return (await response.json()) as IngestResponse;
      }

      // Retry on 5xx server errors and 429 rate limiting
      if ((response.status >= 500 || response.status === 429) && attempt < this.maxRetries) {
        await this.delay(attempt);
        return this.sendWithRetry(body, headers, attempt + 1);
      }

      throw new Error(`Mihari API responded with status ${response.status}`);
    } catch (err) {
      if (attempt < this.maxRetries && this.isRetryableError(err)) {
        await this.delay(attempt);
        return this.sendWithRetry(body, headers, attempt + 1);
      }
      throw err;
    }
  }

  private isRetryableError(err: unknown): boolean {
    if (err instanceof TypeError) {
      // Network errors from fetch (e.g., DNS failure, connection refused)
      return true;
    }
    return false;
  }

  private delay(attempt: number): Promise<void> {
    const ms = this.retryBaseDelayMs * Math.pow(2, attempt);
    const jitter = ms * 0.1 * Math.random();
    return new Promise((resolve) => setTimeout(resolve, ms + jitter));
  }
}

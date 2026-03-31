import { Transport } from "./transport";
import type { LogEntry, LogLevel, Logger, MihariConfig } from "./types";

/**
 * Core Mihari client. Provides a structured logging interface
 * backed by the batching HTTP transport.
 *
 * Used internally by server.ts and client-logger.ts.
 */
export class MihariClient implements Logger {
  private readonly transport: Transport;
  private readonly defaultMeta: Readonly<Record<string, unknown>>;

  constructor(config: MihariConfig) {
    this.defaultMeta = config.defaultMeta ?? {};

    this.transport = new Transport({
      endpoint: config.endpoint,
      token: config.token,
      batchSize: config.transport?.batchSize,
      flushIntervalMs: config.transport?.flushIntervalMs,
      maxRetries: config.transport?.maxRetries,
      retryBaseDelayMs: config.transport?.retryBaseDelayMs,
      gzip: config.transport?.gzip,
    });
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log("error", message, meta);
  }

  fatal(message: string, meta?: Record<string, unknown>): void {
    this.log("fatal", message, meta);
  }

  /** Flush all pending log entries. */
  async flush(): Promise<void> {
    await this.transport.flush();
  }

  /** Gracefully shutdown the client, flushing remaining logs. */
  async shutdown(): Promise<void> {
    await this.transport.shutdown();
  }

  /** Create a log entry and enqueue it for delivery. */
  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const entry: LogEntry = {
      dt: new Date().toISOString(),
      level,
      message,
      ...this.defaultMeta,
      ...meta,
    };

    this.transport.enqueue(entry);
  }

  /** Returns the number of entries waiting to be flushed. */
  get pendingCount(): number {
    return this.transport.pendingCount;
  }
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Transport } from "../src/transport";

const BASE_CONFIG = {
  endpoint: "https://api.test.com/ingest",
  token: "test-token",
  batchSize: 10,
  flushIntervalMs: 0,
  maxRetries: 1,
  retryBaseDelayMs: 10,
  gzip: false,
};

function makeEntry(overrides = {}) {
  return {
    dt: "2026-01-01T00:00:00.000Z",
    level: "info" as const,
    message: "test",
    ...overrides,
  };
}

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    json: vi.fn().mockResolvedValue({ status: "accepted", count: 1 }),
  });
}

describe("Transport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should enqueue entries", () => {
    const transport = new Transport(BASE_CONFIG);
    transport.enqueue(makeEntry());
    expect(transport.pendingCount).toBe(1);
    transport.enqueue(makeEntry());
    expect(transport.pendingCount).toBe(2);
    void transport.shutdown();
  });

  it("should flush entries via POST with auth header", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new Transport(BASE_CONFIG);
    transport.enqueue(makeEntry({ message: "hello" }));
    await transport.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test.com/ingest");
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer test-token");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(transport.pendingCount).toBe(0);
    void transport.shutdown();
  });

  it("should not flush when buffer is empty", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new Transport(BASE_CONFIG);
    await transport.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    void transport.shutdown();
  });

  it("should auto-flush when batchSize is reached", async () => {
    vi.useRealTimers();
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new Transport({ ...BASE_CONFIG, batchSize: 2 });
    transport.enqueue(makeEntry());
    transport.enqueue(makeEntry());

    // Wait for async flush to complete
    await new Promise((r) => setTimeout(r, 100));
    expect(fetchMock).toHaveBeenCalled();
    expect(transport.pendingCount).toBe(0);
    void transport.shutdown();
  });

  it("should re-add entries on failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: vi.fn().mockResolvedValue({ status: "accepted", count: 1 }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new Transport({ ...BASE_CONFIG, maxRetries: 0, gzip: false });
    transport.enqueue(makeEntry());
    await transport.flush();

    expect(consoleSpy).toHaveBeenCalled();
    expect(transport.pendingCount).toBe(1);

    // Second flush should succeed
    await transport.flush();
    expect(transport.pendingCount).toBe(0);
    void transport.shutdown();
  });

  it("should shutdown and flush remaining", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new Transport(BASE_CONFIG);
    transport.enqueue(makeEntry());
    await transport.shutdown();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(transport.pendingCount).toBe(0);
  });

  it("should flush on interval", async () => {
    const fetchMock = mockFetchOk();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new Transport({ ...BASE_CONFIG, flushIntervalMs: 1000 });
    transport.enqueue(makeEntry());

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    void transport.shutdown();
  });
});

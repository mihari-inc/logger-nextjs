import { describe, it, expect, vi, beforeEach } from "vitest";

const mockTransportInstance = {
  enqueue: vi.fn(),
  flush: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
  pendingCount: 0,
};

vi.mock("../src/transport", () => ({
  Transport: class MockTransport {
    enqueue = mockTransportInstance.enqueue;
    flush = mockTransportInstance.flush;
    shutdown = mockTransportInstance.shutdown;
    pendingCount = mockTransportInstance.pendingCount;
    constructor() {}
  },
}));

import { MihariClient } from "../src/client";

const BASE_CONFIG = {
  endpoint: "https://api.test.com/ingest",
  token: "test-token",
};

describe("MihariClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should have all log level methods", () => {
    const client = new MihariClient(BASE_CONFIG);
    expect(typeof client.debug).toBe("function");
    expect(typeof client.info).toBe("function");
    expect(typeof client.warn).toBe("function");
    expect(typeof client.error).toBe("function");
    expect(typeof client.fatal).toBe("function");
  });

  it("should enqueue log entries with correct level", () => {
    const client = new MihariClient(BASE_CONFIG);
    client.info("test message");

    expect(mockTransportInstance.enqueue).toHaveBeenCalledTimes(1);
    const entry = mockTransportInstance.enqueue.mock.calls[0][0];
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("test message");
    expect(entry.dt).toBeDefined();
  });

  it("should include per-call metadata", () => {
    const client = new MihariClient(BASE_CONFIG);
    client.error("oops", { userId: 42, path: "/api" });

    const entry = mockTransportInstance.enqueue.mock.calls[0][0];
    expect(entry.userId).toBe(42);
    expect(entry.path).toBe("/api");
  });

  it("should include default metadata", () => {
    const client = new MihariClient({
      ...BASE_CONFIG,
      defaultMeta: { service: "web", env: "test" },
    });
    client.info("hello");

    const entry = mockTransportInstance.enqueue.mock.calls[0][0];
    expect(entry.service).toBe("web");
    expect(entry.env).toBe("test");
  });

  it("should override default metadata with per-call metadata", () => {
    const client = new MihariClient({
      ...BASE_CONFIG,
      defaultMeta: { env: "prod" },
    });
    client.info("hello", { env: "staging" });

    const entry = mockTransportInstance.enqueue.mock.calls[0][0];
    expect(entry.env).toBe("staging");
  });

  it("should log all five levels", () => {
    const client = new MihariClient(BASE_CONFIG);
    client.debug("d");
    client.info("i");
    client.warn("w");
    client.error("e");
    client.fatal("f");

    expect(mockTransportInstance.enqueue).toHaveBeenCalledTimes(5);
    const levels = mockTransportInstance.enqueue.mock.calls.map((c: any) => c[0].level);
    expect(levels).toEqual(["debug", "info", "warn", "error", "fatal"]);
  });

  it("should flush via transport", async () => {
    const client = new MihariClient(BASE_CONFIG);
    await client.flush();
    expect(mockTransportInstance.flush).toHaveBeenCalledTimes(1);
  });

  it("should shutdown via transport", async () => {
    const client = new MihariClient(BASE_CONFIG);
    await client.shutdown();
    expect(mockTransportInstance.shutdown).toHaveBeenCalledTimes(1);
  });

  it("should generate ISO 8601 timestamps", () => {
    const client = new MihariClient(BASE_CONFIG);
    client.info("ts test");
    const entry = mockTransportInstance.enqueue.mock.calls[0][0];
    expect(entry.dt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

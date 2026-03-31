import { MihariClient } from "./client";
import type { ServerLoggerConfig, Logger } from "./types";

interface ServerMeta {
  readonly hostname: string;
  readonly pid: number;
  readonly nodeVersion: string;
  readonly service: string;
  readonly runtime: "server";
}

function getServerMeta(service: string): ServerMeta {
  return {
    hostname: typeof process !== "undefined" ? process.env.HOSTNAME ?? "unknown" : "unknown",
    pid: typeof process !== "undefined" ? process.pid : 0,
    nodeVersion: typeof process !== "undefined" ? process.version : "unknown",
    service,
    runtime: "server",
  };
}

/**
 * Create a server-side logger for use in API routes,
 * getServerSideProps, and server components.
 *
 * Automatically attaches server metadata (hostname, pid, node version).
 *
 * @example
 * ```ts
 * import { createServerLogger } from "@mihari/logger-nextjs/server";
 *
 * const logger = createServerLogger({
 *   endpoint: "https://api.mihari.io/ingest",
 *   token: process.env.MIHARI_TOKEN!,
 * });
 *
 * export async function GET(request: Request) {
 *   logger.info("Handling GET request", { path: "/api/data" });
 *   return Response.json({ ok: true });
 * }
 * ```
 */
export function createServerLogger(config: ServerLoggerConfig): Logger & { shutdown(): Promise<void> } {
  const service = config.service ?? "nextjs";
  const serverMeta = getServerMeta(service);

  const client = new MihariClient({
    ...config,
    defaultMeta: {
      ...serverMeta,
      ...config.defaultMeta,
    },
  });

  return client;
}

/**
 * Create a logger scoped to a specific request.
 * Attaches request metadata (method, url, headers) to every log entry.
 *
 * @example
 * ```ts
 * import { withRequestLogger } from "@mihari/logger-nextjs/server";
 *
 * export async function GET(request: Request) {
 *   const logger = withRequestLogger(request, {
 *     endpoint: "https://api.mihari.io/ingest",
 *     token: process.env.MIHARI_TOKEN!,
 *   });
 *   logger.info("Processing request");
 *   return Response.json({ ok: true });
 * }
 * ```
 */
export function withRequestLogger(
  request: Request,
  config: ServerLoggerConfig
): Logger & { shutdown(): Promise<void> } {
  const url = new URL(request.url);
  const requestMeta = {
    method: request.method,
    path: url.pathname,
    query: url.search,
    userAgent: request.headers.get("user-agent") ?? undefined,
    requestId: request.headers.get("x-request-id") ?? undefined,
  };

  return createServerLogger({
    ...config,
    defaultMeta: {
      ...requestMeta,
      ...config.defaultMeta,
    },
  });
}

export type { ServerLoggerConfig, Logger };

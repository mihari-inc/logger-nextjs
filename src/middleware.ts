import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Transport } from "./transport";
import type { LogEntry, MiddlewareConfig } from "./types";

/**
 * Create a Next.js middleware that logs request/response information.
 *
 * Compatible with Edge Runtime (Vercel Edge Functions).
 *
 * @example
 * ```ts
 * // middleware.ts (project root)
 * import { createMihariMiddleware } from "@mihari/nextjs/middleware";
 *
 * export const middleware = createMihariMiddleware({
 *   endpoint: "https://api.mihari.io/ingest",
 *   token: process.env.MIHARI_TOKEN!,
 *   excludePaths: ["/_next", "/favicon.ico"],
 * });
 *
 * export const config = {
 *   matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
 * };
 * ```
 */
export function createMihariMiddleware(config: MiddlewareConfig) {
  const excludePaths = config.excludePaths ?? [];
  const defaultMeta = config.defaultMeta ?? {};

  const transport = new Transport({
    endpoint: config.endpoint,
    token: config.token,
    // Use smaller batch size for middleware since requests are short-lived
    batchSize: 5,
    flushIntervalMs: 2000,
    // Disable gzip in edge runtime by default (pako may not be available)
    gzip: false,
  });

  return async function mihariMiddleware(request: NextRequest): Promise<NextResponse> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Skip excluded paths
    if (excludePaths.some((excluded) => path.startsWith(excluded))) {
      return NextResponse.next();
    }

    const startTime = Date.now();

    // Continue to the next middleware / route handler
    const response = NextResponse.next();

    const duration = Date.now() - startTime;

    const entry: LogEntry = {
      dt: new Date().toISOString(),
      level: "info",
      message: `${request.method} ${path}`,
      method: request.method,
      path,
      query: url.search || undefined,
      statusCode: response.status,
      duration,
      userAgent: request.headers.get("user-agent") ?? undefined,
      ip:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("x-real-ip") ??
        undefined,
      requestId: request.headers.get("x-request-id") ?? undefined,
      runtime: "edge",
      ...defaultMeta,
    };

    transport.enqueue(entry);

    // Use waitUntil if available (Vercel Edge Functions)
    try {
      const ctx = (globalThis as Record<string, unknown>).__nextMiddlewareContext as
        | { waitUntil?: (promise: Promise<void>) => void }
        | undefined;
      if (ctx?.waitUntil) {
        ctx.waitUntil(transport.flush());
      }
    } catch {
      // Silently ignore if waitUntil is not available
    }

    return response;
  };
}

export type { MiddlewareConfig };

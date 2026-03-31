import { MihariClient } from "./client";
import type { ClientLoggerConfig, Logger } from "./types";

interface ClientMeta {
  readonly runtime: "browser";
  readonly userAgent: string;
  readonly url: string;
}

function getClientMeta(): ClientMeta {
  return {
    runtime: "browser",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    url: typeof window !== "undefined" ? window.location.href : "unknown",
  };
}

/**
 * Create a client-side logger for use in the browser.
 *
 * Automatically captures unhandled errors and promise rejections
 * unless disabled via configuration.
 *
 * @example
 * ```ts
 * import { createClientLogger } from "@mihari/logger-nextjs/client";
 *
 * const logger = createClientLogger({
 *   endpoint: "https://api.mihari.io/ingest",
 *   token: "your-token",
 * });
 *
 * logger.info("Page loaded", { page: "/dashboard" });
 * ```
 */
export function createClientLogger(config: ClientLoggerConfig): Logger & {
  shutdown(): Promise<void>;
  destroy(): void;
} {
  const captureErrors = config.captureErrors ?? true;
  const captureRejections = config.captureRejections ?? true;

  const client = new MihariClient({
    endpoint: config.endpoint,
    token: config.token,
    defaultMeta: {
      ...getClientMeta(),
      ...config.defaultMeta,
    },
    transport: config.transport,
  });

  const cleanupFns: Array<() => void> = [];

  if (typeof window !== "undefined") {
    if (captureErrors) {
      const errorHandler = (event: ErrorEvent) => {
        client.error(event.message || "Unhandled error", {
          error: event.error?.toString(),
          stack: event.error?.stack,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          source: "window.onerror",
        });
      };

      window.addEventListener("error", errorHandler);
      cleanupFns.push(() => window.removeEventListener("error", errorHandler));
    }

    if (captureRejections) {
      const rejectionHandler = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        const message =
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : "Unhandled promise rejection";

        client.error(message, {
          error: reason?.toString(),
          stack: reason instanceof Error ? reason.stack : undefined,
          source: "unhandledrejection",
        });
      };

      window.addEventListener("unhandledrejection", rejectionHandler);
      cleanupFns.push(() => window.removeEventListener("unhandledrejection", rejectionHandler));
    }

    // Flush on page unload
    const unloadHandler = () => {
      void client.flush();
    };

    // Use both events for maximum coverage
    window.addEventListener("beforeunload", unloadHandler);
    window.addEventListener("pagehide", unloadHandler);
    cleanupFns.push(() => {
      window.removeEventListener("beforeunload", unloadHandler);
      window.removeEventListener("pagehide", unloadHandler);
    });
  }

  return {
    debug: (message, meta) => client.debug(message, meta),
    info: (message, meta) => client.info(message, meta),
    warn: (message, meta) => client.warn(message, meta),
    error: (message, meta) => client.error(message, meta),
    fatal: (message, meta) => client.fatal(message, meta),
    flush: () => client.flush(),
    shutdown: () => client.shutdown(),
    destroy: () => {
      for (const cleanup of cleanupFns) {
        cleanup();
      }
      void client.shutdown();
    },
  };
}

export type { ClientLoggerConfig };

/** Log severity levels */
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

/** A single log entry sent to the Mihari API */
export interface LogEntry {
  /** ISO 8601 timestamp */
  readonly dt: string;
  /** Log severity level */
  readonly level: LogLevel;
  /** Log message */
  readonly message: string;
  /** Additional metadata fields */
  readonly [key: string]: unknown;
}

/** Response from the Mihari ingest API */
export interface IngestResponse {
  readonly status: "accepted";
  readonly count: number;
}

/** Transport configuration */
export interface TransportConfig {
  /** Mihari API endpoint URL */
  readonly endpoint: string;
  /** Bearer token for authentication */
  readonly token: string;
  /** Maximum entries per batch before auto-flush (default: 10) */
  readonly batchSize?: number;
  /** Flush interval in milliseconds (default: 5000) */
  readonly flushIntervalMs?: number;
  /** Maximum retry attempts for failed requests (default: 3) */
  readonly maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  readonly retryBaseDelayMs?: number;
  /** Enable gzip compression (default: true) */
  readonly gzip?: boolean;
}

/** Core Mihari client configuration */
export interface MihariConfig {
  /** Mihari API endpoint URL */
  readonly endpoint: string;
  /** Bearer token for authentication */
  readonly token: string;
  /** Default metadata added to every log entry */
  readonly defaultMeta?: Readonly<Record<string, unknown>>;
  /** Transport configuration overrides */
  readonly transport?: Partial<
    Pick<
      TransportConfig,
      "batchSize" | "flushIntervalMs" | "maxRetries" | "retryBaseDelayMs" | "gzip"
    >
  >;
}

/** Server logger configuration */
export interface ServerLoggerConfig extends MihariConfig {
  /** Service name to attach to all logs (default: "nextjs") */
  readonly service?: string;
}

/** Client logger configuration */
export interface ClientLoggerConfig {
  /** Mihari API endpoint URL */
  readonly endpoint: string;
  /** Bearer token for authentication */
  readonly token: string;
  /** Automatically capture unhandled errors (default: true) */
  readonly captureErrors?: boolean;
  /** Automatically capture unhandled promise rejections (default: true) */
  readonly captureRejections?: boolean;
  /** Default metadata added to every log entry */
  readonly defaultMeta?: Readonly<Record<string, unknown>>;
  /** Transport configuration overrides */
  readonly transport?: Partial<
    Pick<
      TransportConfig,
      "batchSize" | "flushIntervalMs" | "maxRetries" | "retryBaseDelayMs" | "gzip"
    >
  >;
}

/** Middleware configuration */
export interface MiddlewareConfig {
  /** Mihari API endpoint URL */
  readonly endpoint: string;
  /** Bearer token for authentication */
  readonly token: string;
  /** Paths to exclude from logging (e.g., ["/_next", "/favicon.ico"]) */
  readonly excludePaths?: readonly string[];
  /** Default metadata added to every log entry */
  readonly defaultMeta?: Readonly<Record<string, unknown>>;
}

/** Logger interface exposed via React hook */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  fatal(message: string, meta?: Record<string, unknown>): void;
  flush(): Promise<void>;
}

/** Props for the MihariProvider component */
export interface MihariProviderProps {
  readonly token: string;
  readonly endpoint: string;
  /** Automatically capture unhandled errors (default: true) */
  readonly captureErrors?: boolean;
  /** Automatically capture unhandled promise rejections (default: true) */
  readonly captureRejections?: boolean;
  /** Default metadata added to every log entry */
  readonly defaultMeta?: Readonly<Record<string, unknown>>;
  /** Transport configuration overrides */
  readonly transport?: Partial<
    Pick<
      TransportConfig,
      "batchSize" | "flushIntervalMs" | "maxRetries" | "retryBaseDelayMs" | "gzip"
    >
  >;
  readonly children: React.ReactNode;
}

/** Props for the MihariErrorBoundary component */
export interface MihariErrorBoundaryProps {
  /** Fallback UI to render when an error is caught */
  readonly fallback?: React.ReactNode | ((error: Error) => React.ReactNode);
  /** Additional metadata to attach to the error log */
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly children: React.ReactNode;
}

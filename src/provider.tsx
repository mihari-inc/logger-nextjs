"use client";

import React, { createContext, useEffect, useMemo, useRef, Component } from "react";
import { createClientLogger } from "./client-logger";
import { useLogger } from "./hooks";
import type { Logger, MihariProviderProps, MihariErrorBoundaryProps } from "./types";

export const MihariContext = createContext<Logger | null>(null);

/**
 * React context provider that initializes the Mihari client logger
 * and provides it to all child components via useLogger().
 *
 * @example
 * ```tsx
 * // app/layout.tsx (App Router)
 * import { MihariProvider } from "@mihari/logger-nextjs/provider";
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <MihariProvider
 *           token={process.env.NEXT_PUBLIC_MIHARI_TOKEN!}
 *           endpoint="https://api.mihari.io/ingest"
 *         >
 *           {children}
 *         </MihariProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function MihariProvider({
  token,
  endpoint,
  captureErrors,
  captureRejections,
  defaultMeta,
  transport,
  children,
}: MihariProviderProps) {
  const loggerRef = useRef<ReturnType<typeof createClientLogger> | null>(null);

  const logger = useMemo(() => {
    // Clean up previous logger if config changes
    if (loggerRef.current !== null) {
      loggerRef.current.destroy();
    }

    const newLogger = createClientLogger({
      endpoint,
      token,
      captureErrors,
      captureRejections,
      defaultMeta,
      transport,
    });

    loggerRef.current = newLogger;
    return newLogger;
  }, [token, endpoint, captureErrors, captureRejections, defaultMeta, transport]);

  useEffect(() => {
    return () => {
      if (loggerRef.current !== null) {
        loggerRef.current.destroy();
        loggerRef.current = null;
      }
    };
  }, []);

  return (
    <MihariContext.Provider value={logger}>
      {children}
    </MihariContext.Provider>
  );
}

/**
 * Error boundary that automatically logs errors to Mihari.
 *
 * Must be used within a MihariProvider.
 *
 * @example
 * ```tsx
 * import { MihariErrorBoundary } from "@mihari/logger-nextjs/provider";
 *
 * function App() {
 *   return (
 *     <MihariErrorBoundary fallback={<p>Something went wrong.</p>}>
 *       <MyComponent />
 *     </MihariErrorBoundary>
 *   );
 * }
 * ```
 */

interface ErrorBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class MihariErrorBoundary extends Component<
  MihariErrorBoundaryProps & { logger?: Logger },
  ErrorBoundaryState
> {
  static contextType = MihariContext;
  declare context: Logger | null;

  constructor(props: MihariErrorBoundaryProps & { logger?: Logger }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const logger = this.props.logger ?? this.context;
    if (logger) {
      logger.error(error.message, {
        stack: error.stack,
        componentStack: errorInfo.componentStack ?? undefined,
        source: "MihariErrorBoundary",
        ...this.props.meta,
      });
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      const { fallback } = this.props;

      if (typeof fallback === "function") {
        return fallback(this.state.error);
      }

      if (fallback !== undefined) {
        return fallback;
      }

      return null;
    }

    return this.props.children;
  }
}

// Re-export the hook from provider for convenience
export { useLogger };
export type { Logger, MihariProviderProps, MihariErrorBoundaryProps };

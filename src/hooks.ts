import { useContext } from "react";
import { MihariContext } from "./provider";
import type { Logger } from "./types";

/**
 * React hook to access the Mihari logger from any component
 * wrapped in a MihariProvider.
 *
 * @throws Error if used outside of a MihariProvider
 *
 * @example
 * ```tsx
 * import { useLogger } from "@mihari/nextjs/provider";
 *
 * function MyComponent() {
 *   const logger = useLogger();
 *
 *   const handleClick = () => {
 *     logger.info("Button clicked", { component: "MyComponent" });
 *   };
 *
 *   return <button onClick={handleClick}>Click me</button>;
 * }
 * ```
 */
export function useLogger(): Logger {
  const logger = useContext(MihariContext);

  if (logger === null) {
    throw new Error(
      "[mihari] useLogger must be used within a <MihariProvider>. " +
        "Wrap your component tree with <MihariProvider token=\"...\" endpoint=\"...\">."
    );
  }

  return logger;
}

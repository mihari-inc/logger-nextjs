# @mihari/nextjs

Open-source log collection integration for Next.js applications. Captures server-side and client-side logs and sends them to the Mihari ingest API with batching, retry, and gzip compression.

## Features

- **Server logger** -- for API routes, `getServerSideProps`, and server components with auto-captured server metadata (hostname, pid, Node version)
- **Client logger** -- for the browser with automatic capture of unhandled errors and promise rejections
- **Middleware** -- Next.js middleware for request/response logging (method, path, status, duration)
- **React Provider** -- `<MihariProvider>` wraps your app and provides a logger via React context
- **useLogger hook** -- `const logger = useLogger()` for logging from any component
- **Error boundary** -- optional `<MihariErrorBoundary>` component that logs React errors
- **Edge runtime compatible** -- works in Vercel Edge Functions
- **Batching & retry** -- buffers logs (batch size: 10, flush interval: 5s) with exponential backoff retry (3 attempts)
- **Gzip compression** -- compresses payloads via pako when available

## Installation

```bash
npm install @mihari/nextjs
# or
pnpm add @mihari/nextjs
# or
yarn add @mihari/nextjs
```

### Peer dependencies

- `next >= 13`
- `react >= 18`

## Quick Start

### 1. Set environment variables

```env
MIHARI_TOKEN=your-api-token
MIHARI_ENDPOINT=https://api.mihari.io/ingest
NEXT_PUBLIC_MIHARI_TOKEN=your-client-token
NEXT_PUBLIC_MIHARI_ENDPOINT=https://api.mihari.io/ingest
```

---

## App Router Setup

### Layout (client-side logging)

```tsx
// app/layout.tsx
import { MihariProvider } from "@mihari/nextjs/provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MihariProvider
          token={process.env.NEXT_PUBLIC_MIHARI_TOKEN!}
          endpoint={process.env.NEXT_PUBLIC_MIHARI_ENDPOINT!}
        >
          {children}
        </MihariProvider>
      </body>
    </html>
  );
}
```

### Client component with useLogger

```tsx
"use client";
import { useLogger } from "@mihari/nextjs/provider";

export function TrackableButton() {
  const logger = useLogger();

  const handleClick = () => {
    logger.info("Button clicked", { component: "TrackableButton" });
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

### Server component / API route

```ts
// app/api/data/route.ts
import { createServerLogger } from "@mihari/nextjs/server";

const logger = createServerLogger({
  endpoint: process.env.MIHARI_ENDPOINT!,
  token: process.env.MIHARI_TOKEN!,
});

export async function GET() {
  logger.info("Fetching data");

  try {
    const data = await fetchData();
    logger.info("Data fetched successfully", { count: data.length });
    return Response.json(data);
  } catch (err) {
    logger.error("Failed to fetch data", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
```

### Request-scoped logger

```ts
// app/api/users/route.ts
import { withRequestLogger } from "@mihari/nextjs/server";

export async function POST(request: Request) {
  const logger = withRequestLogger(request, {
    endpoint: process.env.MIHARI_ENDPOINT!,
    token: process.env.MIHARI_TOKEN!,
  });

  logger.info("Creating user");
  // ...request method, path, userAgent are automatically attached
  return Response.json({ ok: true });
}
```

### Middleware

```ts
// middleware.ts (project root)
import { createMihariMiddleware } from "@mihari/nextjs/middleware";

export const middleware = createMihariMiddleware({
  endpoint: process.env.MIHARI_ENDPOINT!,
  token: process.env.MIHARI_TOKEN!,
  excludePaths: ["/_next", "/favicon.ico", "/api/health"],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

### Error boundary

```tsx
"use client";
import { MihariErrorBoundary } from "@mihari/nextjs/provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <MihariErrorBoundary
      fallback={<div>Something went wrong. Please try again.</div>}
      meta={{ section: "dashboard" }}
    >
      {children}
    </MihariErrorBoundary>
  );
}
```

---

## Pages Router Setup

### _app.tsx (client-side logging)

```tsx
// pages/_app.tsx
import type { AppProps } from "next/app";
import { MihariProvider } from "@mihari/nextjs/provider";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MihariProvider
      token={process.env.NEXT_PUBLIC_MIHARI_TOKEN!}
      endpoint={process.env.NEXT_PUBLIC_MIHARI_ENDPOINT!}
    >
      <Component {...pageProps} />
    </MihariProvider>
  );
}
```

### getServerSideProps

```ts
// pages/dashboard.tsx
import { createServerLogger } from "@mihari/nextjs/server";
import type { GetServerSideProps } from "next";

const logger = createServerLogger({
  endpoint: process.env.MIHARI_ENDPOINT!,
  token: process.env.MIHARI_TOKEN!,
});

export const getServerSideProps: GetServerSideProps = async (context) => {
  logger.info("Loading dashboard", { path: context.resolvedUrl });

  const data = await fetchDashboardData();
  return { props: { data } };
};
```

### API routes

```ts
// pages/api/hello.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerLogger } from "@mihari/nextjs/server";

const logger = createServerLogger({
  endpoint: process.env.MIHARI_ENDPOINT!,
  token: process.env.MIHARI_TOKEN!,
  service: "api",
});

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  logger.info(`${req.method} /api/hello`, {
    query: req.query,
    userAgent: req.headers["user-agent"],
  });

  res.status(200).json({ message: "Hello" });
}
```

---

## API Reference

### Log levels

All loggers support five levels: `debug`, `info`, `warn`, `error`, `fatal`.

```ts
logger.debug("Verbose debug info");
logger.info("Normal operation");
logger.warn("Something unexpected");
logger.error("Something failed", { error: err.message });
logger.fatal("Critical failure, shutting down");
```

### Log entry format

Each log entry sent to the API follows this structure:

```json
{
  "dt": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "User logged in",
  "userId": "abc-123",
  "runtime": "server",
  "hostname": "web-1",
  "pid": 12345,
  "nodeVersion": "v20.10.0",
  "service": "nextjs"
}
```

### Transport configuration

All loggers accept transport overrides:

| Option | Default | Description |
|--------|---------|-------------|
| `batchSize` | 10 | Max entries per batch before auto-flush |
| `flushIntervalMs` | 5000 | Flush interval in milliseconds |
| `maxRetries` | 3 | Retry attempts for failed requests |
| `retryBaseDelayMs` | 1000 | Base delay for exponential backoff |
| `gzip` | true | Enable gzip compression |

```ts
const logger = createServerLogger({
  endpoint: "...",
  token: "...",
  transport: {
    batchSize: 20,
    flushIntervalMs: 10000,
    maxRetries: 5,
  },
});
```

### Manual flush

Call `flush()` to immediately send buffered logs (e.g., before a serverless function terminates):

```ts
await logger.flush();
```

### Shutdown

For long-running server processes, call `shutdown()` for graceful cleanup:

```ts
process.on("SIGTERM", async () => {
  await logger.shutdown();
  process.exit(0);
});
```

---

## Auto-captured metadata

### Server-side

| Field | Description |
|-------|-------------|
| `hostname` | Server hostname |
| `pid` | Process ID |
| `nodeVersion` | Node.js version |
| `service` | Service name (default: "nextjs") |
| `runtime` | Always "server" |

### Client-side

| Field | Description |
|-------|-------------|
| `userAgent` | Browser user agent string |
| `url` | Current page URL |
| `runtime` | Always "browser" |

### Middleware

| Field | Description |
|-------|-------------|
| `method` | HTTP method |
| `path` | Request path |
| `statusCode` | Response status code |
| `duration` | Request duration in ms |
| `userAgent` | Client user agent |
| `ip` | Client IP (from x-forwarded-for) |
| `runtime` | Always "edge" |

## License

MIT

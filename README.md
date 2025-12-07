# Nexus Framework

Modern async-first web framework with type-safety and security built-in.

## Features

✨ **Unified Context Pattern** - Single immutable context object replacing req/res  
🚀 **Async-First** - Native async/await with automatic error handling  
🔒 **Type-Safe** - Full TypeScript support with schema validation (Zod)  
⚡ **High Performance** - Object pooling, zero-copy buffers, JIT compilation  
🧩 **Extensible** - Adapter pattern for plugins and custom implementations  
🛠️ **Developer Experience** - Intuitive API with excellent type inference  

## Quick Start

### Installation

```bash
npm install
```

### Basic Usage

```typescript
import { createApp, z } from './src';

const app = createApp();

// Simple route
app.get('/hello', async (ctx) => {
  return { message: 'Hello World!' };
});

// Route with validation
app.post('/users', {
  schema: {
    body: z.object({
      name: z.string().min(2),
      email: z.string().email()
    })
  },
  handler: async (ctx) => {
    // ctx.body is typed and validated!
    return { user: ctx.body };
  }
});

app.listen(3000);
```

### Running the Example

```bash
npm run dev
```

Then visit:
- http://localhost:3000/hello
- http://localhost:3000/users/123
- http://localhost:3000/profile (requires auth header)

## Architecture

### Core Components

- **Context** - Unified request/response object with immutability
- **Router** - Radix tree-based routing with O(log n) lookup
- **Middleware** - Type-safe composable middleware chain
- **Application** - Main orchestrator with lifecycle management

### Performance Optimizations

- **Context Pooling** - Reuses context objects to reduce GC pressure
- **Buffer Pooling** - Zero-copy buffer handling for bodies
- **JIT Compilation** - Optimizes hot paths at runtime

### Adapter Pattern

All core components use adapter interfaces for extensibility:
- RouterAdapter
- ContextAdapter
- MiddlewareAdapter
- ValidationAdapter
- LoggerAdapter
- CacheAdapter
- SessionAdapter

## API Reference

### Application

```typescript
const app = createApp(config?: AppConfig);

app.use(middleware: Middleware);
app.get(path: string, handler: Handler | RouteConfig);
app.post(path: string, handler: Handler | RouteConfig);
app.put(path: string, handler: Handler | RouteConfig);
app.delete(path: string, handler: Handler | RouteConfig);
app.patch(path: string, handler: Handler | RouteConfig);
app.onError(handler: ErrorHandler);
app.listen(port: number, callback?: () => void);
```

### Context

```typescript
interface Context {
  method: HTTPMethod;
  path: string;
  url: URL;
  params: Record<string, string>;
  query: Record<string, any>;
  body: any;
  headers: Headers;
  cookies: Cookies;
  
  json<T>(data: T): Response;
  html(content: string): Response;
  text(content: string): Response;
  redirect(url: string, status?: number): Response;
  stream(readable: NodeJS.ReadableStream): Response;
}
```

### Middleware

```typescript
type Middleware<TIn = Context, TOut = Context> = (
  ctx: TIn,
  next: Next<TOut>
) => Promise<Response>;
```

### Route Configuration

```typescript
interface RouteConfig {
  method: HTTPMethod;
  path: string;
  handler: Handler;
  middlewares?: Middleware[];
  schema?: SchemaConfig;
  meta?: RouteMeta;
}
```

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## License

MIT

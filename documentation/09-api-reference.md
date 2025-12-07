# API Reference

## Application

### `createApp(config?)`

Create a new Nexus application.

**Parameters:**
- `config` (optional) - Application configuration

**Returns:** `Application` instance

**Example:**
```typescript
import { createApp } from './nexus';

const app = createApp({
  debug: true,
  contextPoolSize: 100,
  enableJIT: true,
  logRequests: true
});
```

---

### `app.use(middleware)`

Add global middleware.

**Parameters:**
- `middleware: Middleware` - Middleware function

**Returns:** `this` (for chaining)

**Example:**
```typescript
app.use(logger());
app.use(cors());
```

---

### `app.get(path, handler | config)`
### `app.post(path, handler | config)`
### `app.put(path, handler | config)`
### `app.delete(path, handler | config)`
### `app.patch(path, handler | config)`

Register route handlers.

**Parameters:**
- `path: string` - Route path
- `handler: Handler` - Handler function
- `config: RouteConfig` - Route configuration

**Returns:** `this` (for chaining)

**Examples:**
```typescript
// Simple handler
app.get('/users', async (ctx) => {
  return { users: [] };
});

// With configuration
app.post('/users', {
  schema: { body: userSchema },
  middlewares: [authenticate],
  handler: async (ctx) => {
    return await createUser(ctx.body);
  }
});
```

---

### `app.route(config)`

Register a route with full configuration.

**Parameters:**
- `config: RouteConfig` - Complete route configuration

**Returns:** `this` (for chaining)

**Example:**
```typescript
app.route({
  method: 'POST',
  path: '/api/users',
  schema: { body: z.object({ ... }) },
  middlewares: [auth],
  handler: async (ctx) => { ... },
  meta: { description: '...', tags: ['users'] }
});
```

---

### `app.onError(handler)`

Set global error handler.

**Parameters:**
- `handler: ErrorHandler` - Error handler function

**Returns:** `this` (for chaining)

**Example:**
```typescript
app.onError((error, ctx) => {
  console.error(error);
  return ctx.response.status(500).json({
    error: 'Internal Server Error'
  });
});
```

---

### `app.plugin(plugin)`

Install a plugin.

**Parameters:**
- `plugin: Plugin` - Plugin object

**Returns:** `this` (for chaining)

**Example:**
```typescript
app.plugin({
  name: 'my-plugin',
  version: '1.0.0',
  install: (app) => {
    app.use(customMiddleware);
  }
});
```

---

### `app.adapter(name, adapter)`

Register an adapter.

**Parameters:**
- `name: string` - Adapter name
- `adapter: T` - Adapter instance

**Returns:** `this` (for chaining)

**Example:**
```typescript
app.adapter('logger', new PinoLogger());
```

---

### `app.getAdapter<T>(name)`

Get a registered adapter.

**Parameters:**
- `name: string` - Adapter name

**Returns:** `T | undefined`

**Example:**
```typescript
const logger = app.getAdapter<LoggerAdapter>('logger');
logger?.info('Application started');
```

---

### `app.listen(port, callback?)`

Start the HTTP server.

**Parameters:**
- `port: number` - Port to listen on
- `callback?: () => void` - Callback function

**Returns:** `HTTPServer`

**Example:**
```typescript
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

---

### `app.getRoutes()`

Get all registered routes.

**Returns:** `Array<{ method: string; path: string }>`

**Example:**
```typescript
const routes = app.getRoutes();
console.log(routes);
// [
//   { method: 'GET', path: '/users' },
//   { method: 'POST', path: '/users' }
// ]
```

---

### `app.getPoolStats()`

Get context pool statistics.

**Returns:** Pool statistics object

**Example:**
```typescript
const stats = app.getPoolStats();
// {
//   poolSize: 50,
//   maxSize: 100,
//   created: 150,
//   reused: 100,
//   hitRate: 0.67
// }
```

---

## Context

### Properties

#### `ctx.method: HTTPMethod`
HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)

#### `ctx.path: string`
Request path without query string

#### `ctx.url: URL`
Full URL object

#### `ctx.params: Record<string, string>`
Route parameters

#### `ctx.query: Record<string, any>`
Query string parameters

#### `ctx.body: any`
Parsed request body

#### `ctx.headers: Headers`
Request headers

#### `ctx.cookies: Cookies`
Cookie manager

#### `ctx.raw: { req: IncomingMessage; res: ServerResponse }`
Raw Node.js objects

### Methods

#### `ctx.json<T>(data: T): Response`
Return JSON response

#### `ctx.html(content: string): Response`
Return HTML response

#### `ctx.text(content: string): Response`
Return text response

#### `ctx.redirect(url: string, status?: number): Response`
Redirect to URL

#### `ctx.stream(readable: NodeJS.ReadableStream): Response`
Stream response

---

## Cookies

### `cookies.get(name: string): string | undefined`
Get cookie value

### `cookies.set(name: string, value: string, options?: CookieOptions): void`
Set cookie

**Cookie Options:**
```typescript
{
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
}
```

### `cookies.delete(name: string): void`
Delete cookie

---

## Response Builder

### `response.status(code: number): ResponseBuilder`
Set status code

### `response.header(name: string, value: string): ResponseBuilder`
Set header

### `response.json<T>(data: T): Response`
Return JSON response

### `response.html(content: string): Response`
Return HTML response

### `response.text(content: string): Response`
Return text response

### `response.redirect(url: string, status?: number): Response`
Redirect response

### `response.stream(readable: NodeJS.ReadableStream): Response`
Stream response

**Example:**
```typescript
return ctx.response
  .status(201)
  .header('Location', '/users/123')
  .json({ created: true });
```

---

## Types

### `Handler<TContext = Context>`
```typescript
type Handler<TContext = Context> = (
  ctx: TContext
) => Promise<Response | any>;
```

### `Middleware<TIn = Context, TOut = Context>`
```typescript
type Middleware<TIn = Context, TOut = Context> = (
  ctx: TIn,
  next: Next<TOut>
) => Promise<Response>;
```

### `RouteConfig<TContext = Context>`
```typescript
interface RouteConfig<TContext = Context> {
  method: HTTPMethod;
  path: string;
  handler: Handler<TContext>;
  middlewares?: Middleware<any, any>[];
  schema?: SchemaConfig;
  meta?: RouteMeta;
}
```

### `SchemaConfig`
```typescript
interface SchemaConfig {
  params?: ZodSchema;
  query?: ZodSchema;
  body?: ZodSchema;
  headers?: ZodSchema;
}
```

### `AppConfig`
```typescript
interface AppConfig {
  contextPoolSize?: number;
  enableJIT?: boolean;
  onError?: ErrorHandler;
  debug?: boolean;
  logRequests?: boolean;
}
```

### `ErrorHandler`
```typescript
type ErrorHandler = (
  error: Error,
  ctx: Context
) => Response | Promise<Response>;
```

### `Plugin`
```typescript
interface Plugin {
  name: string;
  version: string;
  install: (app: Application) => void | Promise<void>;
}
```

---

## Built-in Middleware

### `logger()`
Request/response logging middleware

**Example:**
```typescript
import { logger } from './nexus';
app.use(logger());
```

### `cors(options?)`
CORS middleware

**Options:**
```typescript
{
  origin?: string | string[];
  methods?: string[];
  credentials?: boolean;
  maxAge?: number;
}
```

**Example:**
```typescript
import { cors } from './nexus';
app.use(cors({
  origin: 'https://example.com',
  credentials: true
}));
```

### `errorHandler(handler)`
Error handling middleware wrapper

**Example:**
```typescript
import { errorHandler } from './nexus';
app.use(errorHandler((error, ctx) => {
  return ctx.response.status(500).json({ error: error.message });
}));
```

---

## Adapters

### `RouterAdapter`
```typescript
interface RouterAdapter {
  addRoute(method: string, path: string, handler: Handler): void;
  match(method: string, path: string): RouteMatch | null;
  getRoutes(): Array<{ method: string; path: string }>;
}
```

### `ContextAdapter`
```typescript
interface ContextAdapter {
  createContext(req: IncomingMessage): Promise<Context>;
  resetContext(ctx: Context, req: IncomingMessage): Promise<Context>;
  parseBody(req: IncomingMessage): Promise<any>;
}
```

### `LoggerAdapter`
```typescript
interface LoggerAdapter {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
  debug(message: string, meta?: any): void;
}
```

### `CacheAdapter`
```typescript
interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}
```

---

## Performance Classes

### `ContextPool`
```typescript
class ContextPool {
  constructor(maxSize?: number);
  acquire(req: IncomingMessage, res: ServerResponse): Promise<Context>;
  release(ctx: Context): void;
  getStats(): PoolStats;
  clear(): void;
}
```

### `BufferPool`
```typescript
class BufferPool {
  constructor(bufferSize?: number, maxPoolSize?: number);
  acquire(): Buffer;
  release(buffer: Buffer): void;
  getStats(): BufferPoolStats;
  clear(): void;
}
```

### `MiddlewareOptimizer`
```typescript
class MiddlewareOptimizer {
  cacheHandler(handler: Handler): Handler;
  cacheMiddleware(middlewares: Middleware[]): Middleware[];
  compose(middlewares: Middleware[]): Middleware;
  getStats(): OptimizationStats;
  clearCache(): void;
}
```

### `PerformanceMonitor`
```typescript
class PerformanceMonitor {
  measure<T>(name: string, fn: () => Promise<T>): Promise<T>;
  getMetrics(): Record<string, Metric>;
  clearMetrics(): void;
}
```

---

[← Adapters](./08-adapters.md) | [Examples →](./10-examples.md)

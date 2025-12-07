# Adapters & Extensibility

## Overview

Nexus uses the **Adapter Pattern** to enable extensibility. All core components can be swapped out or extended without modifying the framework itself.

## Why Adapters?

- ✅ **Pluggable Architecture** - Swap implementations easily
- ✅ **Future-Proof** - Add features without breaking changes
- ✅ **Framework Evolution** - Integrate new tools seamlessly
- ✅ **Custom Implementations** - Build your own adapters

## Built-in Adapters

### RouterAdapter

Interface for custom routing implementations:

```typescript
interface RouterAdapter {
  addRoute(method: string, path: string, handler: Handler): void;
  match(method: string, path: string): RouteMatch | null;
  getRoutes(): Array<{ method: string; path: string }>;
}
```

### ContextAdapter

Interface for context creation strategies:

```typescript
interface ContextAdapter {
  createContext(req: IncomingMessage): Promise<Context>;
  resetContext(ctx: Context, req: IncomingMessage): Promise<Context>;
  parseBody(req: IncomingMessage): Promise<any>;
}
```

### ValidationAdapter

Interface for schema validation libraries:

```typescript
interface ValidationAdapter {
  validate<T>(schema: any, data: unknown): Promise<T>;
  isEnabled(): boolean;
}
```

## Using Adapters

### Register an Adapter

```typescript
import { createApp } from './nexus';

const app = createApp();

// Register custom adapter
app.adapter('logger', customLoggerAdapter);
```

### Retrieve an Adapter

```typescript
const logger = app.getAdapter<LoggerAdapter>('logger');
logger.info('Application started');
```

## Creating Custom Adapters

### Logger Adapter

```typescript
import { LoggerAdapter } from './nexus';

class ConsoleLogger implements LoggerAdapter {
  info(message: string, meta?: any) {
    console.log(`[INFO] ${message}`, meta || '');
  }
  
  warn(message: string, meta?: any) {
    console.warn(`[WARN] ${message}`, meta || '');
  }
  
  error(message: string, error?: Error, meta?: any) {
    console.error(`[ERROR] ${message}`, error, meta || '');
  }
  
  debug(message: string, meta?: any) {
    if (process.env.DEBUG) {
      console.debug(`[DEBUG] ${message}`, meta || '');
    }
  }
}

// Register
app.adapter('logger', new ConsoleLogger());
```

### Pino Logger Adapter

```typescript
import pino from 'pino';
import { LoggerAdapter } from './nexus';

class PinoLogger implements LoggerAdapter {
  private logger = pino({
    level: process.env.LOG_LEVEL || 'info'
  });
  
  info(message: string, meta?: any) {
    this.logger.info(meta, message);
  }
  
  warn(message: string, meta?: any) {
    this.logger.warn(meta, message);
  }
  
  error(message: string, error?: Error, meta?: any) {
    this.logger.error({ err: error, ...meta }, message);
  }
  
  debug(message: string, meta?: any) {
    this.logger.debug(meta, message);
  }
}

app.adapter('logger', new PinoLogger());
```

### Cache Adapter (Redis)

```typescript
import { createClient } from 'redis';
import { CacheAdapter } from './nexus';

class RedisCache implements CacheAdapter {
  private client = createClient();
  
  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.client.setEx(key, ttl, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }
  
  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }
  
  async clear(): Promise<void> {
    await this.client.flushDb();
  }
}

// Usage
const cache = new RedisCache();
app.adapter('cache', cache);
```

### Session Adapter

```typescript
import { SessionAdapter } from './nexus';

interface SessionData {
  userId?: string;
  createdAt: number;
  expiresAt: number;
}

class MemorySessionAdapter implements SessionAdapter {
  private sessions = new Map<string, SessionData>();
  
  async get(sessionId: string): Promise<SessionData | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    
    // Check expiration
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    
    return session;
  }
  
  async set(sessionId: string, data: SessionData): Promise<void> {
    this.sessions.set(sessionId, data);
  }
  
  async destroy(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

app.adapter('session', new MemorySessionAdapter());
```

## Plugin System

### Create a Plugin

```typescript
import { Plugin, Application } from './nexus';

const analyticsPlugin: Plugin = {
  name: 'analytics',
  version: '1.0.0',
  
  install: (app: Application) => {
    // Add middleware
    app.use(async (ctx, next) => {
      const start = Date.now();
      const response = await next(ctx);
      const duration = Date.now() - start;
      
      // Track analytics
      track('request', {
        path: ctx.path,
        method: ctx.method,
        duration,
        status: response.statusCode
      });
      
      return response;
    });
    
    // Add custom routes
    app.get('/_analytics', async (ctx) => {
      return { stats: getAnalytics() };
    });
  }
};

// Use plugin
app.plugin(analyticsPlugin);
```

### Authentication Plugin

```typescript
const authPlugin: Plugin = {
  name: 'auth',
  version: '1.0.0',
  
  install: (app: Application) => {
    // Register JWT adapter
    app.adapter('jwt', new JWTAdapter({
      secret: process.env.JWT_SECRET!,
      expiresIn: '1h'
    }));
    
    // Add auth routes
    app.post('/auth/login', loginHandler);
    app.post('/auth/logout', logoutHandler);
    app.post('/auth/refresh', refreshHandler);
    
    // Add auth middleware factory
    (app as any).requireAuth = () => authMiddleware;
  }
};

app.plugin(authPlugin);

// Use the plugin
app.get('/protected', {
  middlewares: [(app as any).requireAuth()],
  handler: async (ctx) => {
    return { user: ctx.user };
  }
});
```

## Real-World Examples

### Database Adapter

```typescript
interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<T[]>;
}

class PostgreSQLAdapter implements DatabaseAdapter {
  private pool: Pool;
  
  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }
  
  async connect(): Promise<void> {
    await this.pool.connect();
  }
  
  async disconnect(): Promise<void> {
    await this.pool.end();
  }
  
  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }
}

// Register
const db = new PostgreSQLAdapter({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

app.adapter('database', db);

// Use in handlers
app.get('/users', async (ctx) => {
  const db = app.getAdapter<DatabaseAdapter>('database')!;
  const users = await db.query('SELECT * FROM users');
  return { users };
});
```

### Rate Limiter Adapter

```typescript
interface RateLimiterAdapter {
  check(key: string, limit: number, window: number): Promise<boolean>;
  reset(key: string): Promise<void>;
}

class RedisRateLimiter implements RateLimiterAdapter {
  private client: RedisClientType;
  
  async check(key: string, limit: number, window: number): Promise<boolean> {
    const count = await this.client.incr(key);
    
    if (count === 1) {
      await this.client.expire(key, window);
    }
    
    return count <= limit;
  }
  
  async reset(key: string): Promise<void> {
    await this.client.del(key);
  }
}

app.adapter('rateLimiter', new RedisRateLimiter());
```

## Adapter Registry

### Access the Registry

```typescript
import { AdapterRegistry } from './nexus';

const registry = new AdapterRegistry();

// Register adapters
registry.register('logger', loggerAdapter);
registry.register('cache', cacheAdapter);
registry.register('session', sessionAdapter);

// Retrieve adapters
const logger = registry.get<LoggerAdapter>('logger');
const cache = registry.get<CacheAdapter>('cache');

// Check if exists
if (registry.has('logger')) {
  logger?.info('Logger is registered');
}

// Remove adapter
registry.remove('cache');
```

## Best Practices

### ✅ DO: Define clear interfaces

```typescript
interface MetricsAdapter {
  increment(metric: string, tags?: Record<string, string>): void;
  gauge(metric: string, value: number, tags?: Record<string, string>): void;
  timing(metric: string, duration: number, tags?: Record<string, string>): void;
}
```

### ✅ DO: Use dependency injection

```typescript
class UserService {
  constructor(
    private db: DatabaseAdapter,
    private cache: CacheAdapter
  ) {}
  
  async getUser(id: string) {
    // Try cache first
    const cached = await this.cache.get(`user:${id}`);
    if (cached) return cached;
    
    // Query database
    const user = await this.db.query('SELECT * FROM users WHERE id = $1', [id]);
    await this.cache.set(`user:${id}`, user, 300);
    return user;
  }
}
```

### ✅ DO: Make adapters testable

```typescript
class MockCache implements CacheAdapter {
  private store = new Map();
  
  async get<T>(key: string): Promise<T | null> {
    return this.store.get(key) || null;
  }
  
  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
  
  async clear(): Promise<void> {
    this.store.clear();
  }
}

// Use in tests
const mockCache = new MockCache();
app.adapter('cache', mockCache);
```

## Future Adapters

The adapter pattern enables future phases:

- 🔐 **Auth Adapters** - JWT, OAuth, Sessions
- 🗄️ **Database Adapters** - PostgreSQL, MySQL, MongoDB
- 📨 **Queue Adapters** - Redis, RabbitMQ, SQS
- 📧 **Email Adapters** - SendGrid, Mailgun, SES
- 🔍 **Search Adapters** - Elasticsearch, Algolia
- 📊 **Analytics Adapters** - Google Analytics, Mixpanel

## Next Steps

- 📖 [API Reference](./09-api-reference.md) - Complete API documentation
- 💡 [Examples](./10-examples.md) - Real-world use cases

---

[← Performance](./07-performance.md) | [API Reference →](./09-api-reference.md)

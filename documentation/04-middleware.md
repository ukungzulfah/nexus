# Middleware System

## Overview

Middleware in Nexus are **composable, type-safe** functions that process requests before they reach the handler. Unlike Express.js, middleware can transform the context and maintain type safety.

## Basic Middleware

### Simple Middleware

```typescript
const logger = async (ctx, next) => {
  console.log(`${ctx.method} ${ctx.path}`);
  return next(ctx);
};

app.use(logger);
```

### Middleware with Logic

```typescript
const timer = async (ctx, next) => {
  const start = Date.now();
  const response = await next(ctx);
  const duration = Date.now() - start;
  
  console.log(`Request took ${duration}ms`);
  return response;
};

app.use(timer);
```

## Global Middleware

Applied to all routes:

```typescript
app.use(logger());
app.use(cors());
app.use(authenticate);
```

## Route-Specific Middleware

Applied to specific routes:

```typescript
app.get('/admin', {
  middlewares: [authenticate, requireAdmin],
  handler: async (ctx) => {
    return { admin: true };
  }
});
```

## Built-in Middleware

### Logger

Logs all requests with timing:

```typescript
import { logger } from './nexus';

app.use(logger());
// Output:
// --> GET /users
// <-- GET /users 200 45ms
```

### CORS

Handle Cross-Origin Resource Sharing. **PENTING: CORS middleware HARUS diletakkan PALING PERTAMA di middleware chain!**

**Opsi konfigurasi:**
- `origin`: String origin tunggal, array origins, atau function untuk validasi dinamis. **⚠️ JANGAN gunakan wildcard `*` jika `credentials: true` di production**
- `methods`: Array HTTP methods yang diizinkan
- `credentials`: Izinkan credentials (cookies, auth headers) - hanya bekerja dengan origin spesifik
- `maxAge`: Cache preflight request (detik)
- `allowedHeaders`: Custom headers yang diizinkan

**✅ Contoh - Wildcard (tanpa credentials):**
```typescript
import { cors } from './nexus';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: false
}));
```

**✅ Contoh - Dengan credentials (HARUS spesifik origins):**
```typescript
app.use(cors({
  origin: ['https://example.com', 'https://app.example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}));
```

**✅ Contoh - Dynamic origin validation:**
```typescript
app.use(cors({
  origin: (requestOrigin) => {
    const allowed = ['https://example.com', 'https://staging.example.com'];
    return allowed.includes(requestOrigin);
  },
  credentials: true
}));
```

**⚠️ Development Fallback - Auto-reflect origin (tidak recommended untuk production):**
```typescript
// Ini akan auto-reflect request origin jika keduanya set
// Berguna untuk development, tapi TIDAK aman untuk production
app.use(cors({
  origin: ['*'],        // atau origin: '*'
  credentials: true     // Middleware akan auto-reflect request origin
}));
```

Default options:
```typescript
{
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: false,
  maxAge: 86400,
  allowedHeaders: ['Content-Type', 'Authorization']
}
```

**📝 Catatan:**
- Kombinasi `origin: ['*']` + `credentials: true` akan trigger **auto-reflect mode** untuk development
- Middleware akan log warning di console
- Untuk production, **selalu gunakan spesifik origins** dengan `credentials: true`

## Custom Middleware

### Authentication Middleware

```typescript
const authenticate = async (ctx: any, next: any) => {
  const token = ctx.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return ctx.response.status(401).json({
      error: 'Unauthorized',
      message: 'Missing token'
    });
  }
  
  try {
    const user = await verifyToken(token);
    ctx.user = user; // Add user to context
    return next(ctx);
  } catch (error) {
    return ctx.response.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid token'
    });
  }
};

// Usage
app.get('/profile', {
  middlewares: [authenticate],
  handler: async (ctx: any) => {
    return { user: ctx.user };
  }
});
```

### Rate Limiting Middleware

```typescript
const rateLimit = (options: { max: number; window: number }) => {
  const requests = new Map<string, number[]>();
  
  return async (ctx: any, next: any) => {
    const key = ctx.headers['x-forwarded-for'] || ctx.raw.req.socket.remoteAddress;
    const now = Date.now();
    const windowMs = options.window * 1000;
    
    // Get request timestamps for this key
    let timestamps = requests.get(key) || [];
    
    // Remove old timestamps outside the window
    timestamps = timestamps.filter(t => now - t < windowMs);
    
    if (timestamps.length >= options.max) {
      return ctx.response.status(429).json({
        error: 'Too Many Requests',
        retryAfter: Math.ceil((timestamps[0] + windowMs - now) / 1000)
      });
    }
    
    // Add current timestamp
    timestamps.push(now);
    requests.set(key, timestamps);
    
    return next(ctx);
  };
};

// Usage
app.post('/api/login', {
  middlewares: [rateLimit({ max: 5, window: 60 })],
  handler: async (ctx) => {
    // Max 5 requests per 60 seconds
    return await handleLogin(ctx.body);
  }
});
```

### Request ID Middleware

```typescript
import { randomUUID } from 'crypto';

const requestId = async (ctx: any, next: any) => {
  ctx.requestId = randomUUID();
  const response = await next(ctx);
  response.headers['X-Request-ID'] = ctx.requestId;
  return response;
};

app.use(requestId);
```

## Type-Safe Middleware

For full type safety, define context types:

```typescript
import { Context, Middleware } from './nexus';

interface User {
  id: string;
  name: string;
  role: string;
}

interface AuthContext extends Context {
  user: User;
}

// Type-safe middleware
const authenticate: Middleware<Context, AuthContext> = async (ctx, next) => {
  const token = ctx.headers.authorization;
  const user = await verifyToken(token!);
  
  return next({ ...ctx, user });
};

// Type-safe handler
const profileHandler = async (ctx: AuthContext) => {
  // ctx.user is typed and guaranteed to exist
  return { userId: ctx.user.id, name: ctx.user.name };
};

app.get('/profile', {
  middlewares: [authenticate],
  handler: profileHandler
});
```

## Middleware Composition

Combine multiple middleware into one:

```typescript
const secureRoute = [
  authenticate,
  requireVerifiedEmail,
  rateLimit({ max: 100, window: 60 })
];

app.get('/api/sensitive', {
  middlewares: secureRoute,
  handler: async (ctx) => {
    return { data: 'sensitive' };
  }
});
```

## Error Handling in Middleware

### Try-Catch Pattern

```typescript
const errorHandler = async (ctx: any, next: any) => {
  try {
    return await next(ctx);
  } catch (error) {
    console.error('Middleware error:', error);
    return ctx.response.status(500).json({
      error: 'Internal Server Error'
    });
  }
};

app.use(errorHandler);
```

### Using errorHandler Utility

```typescript
import { errorHandler } from './nexus';

app.use(errorHandler((error, ctx) => {
  console.error(error);
  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: error.message })
  };
}));
```

## Middleware Order

The order matters! Middleware executes in the order it's registered:

```typescript
// Good - logger sees all requests
app.use(logger());
app.use(authenticate);
app.use(rateLimit());

// Bad - authenticated users bypass rate limit
app.use(authenticate);
app.use(rateLimit());
app.use(logger());
```

## Conditional Middleware

Execute middleware based on conditions:

```typescript
const conditionalAuth = async (ctx: any, next: any) => {
  // Skip auth for public routes
  if (ctx.path.startsWith('/public/')) {
    return next(ctx);
  }
  
  // Require auth for all other routes
  return authenticate(ctx, next);
};

app.use(conditionalAuth);
```

## Response Modification

Middleware can modify responses:

```typescript
const addHeaders = async (ctx: any, next: any) => {
  const response = await next(ctx);
  
  // Add custom headers to response
  response.headers['X-Powered-By'] = 'Nexus';
  response.headers['X-Response-Time'] = Date.now().toString();
  
  return response;
};

app.use(addHeaders);
```

## Real-World Examples

### Complete API Middleware Stack

```typescript
import { createApp, logger, cors } from './nexus';

const app = createApp();

// 1. CORS - must be first for preflight requests
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// 2. Request logging
app.use(logger());

// 3. Request ID for tracing
app.use(requestId);

// 4. Rate limiting
app.use(rateLimit({ max: 100, window: 60 }));

// 5. Error handling wrapper
app.use(errorHandler(customErrorHandler));

// Routes come after all global middleware
app.get('/api/users', {
  middlewares: [authenticate],
  handler: userHandler
});
```

### Session Middleware

```typescript
interface SessionData {
  userId?: string;
  createdAt: number;
}

const sessions = new Map<string, SessionData>();

const session = async (ctx: any, next: any) => {
  const sessionId = ctx.cookies.get('session');
  
  if (sessionId && sessions.has(sessionId)) {
    ctx.session = sessions.get(sessionId);
  } else {
    const newSessionId = randomUUID();
    ctx.session = { createdAt: Date.now() };
    sessions.set(newSessionId, ctx.session);
    
    ctx.cookies.set('session', newSessionId, {
      httpOnly: true,
      secure: true,
      maxAge: 86400
    });
  }
  
  const response = await next(ctx);
  
  // Save session changes
  if (ctx.cookies.get('session')) {
    sessions.set(ctx.cookies.get('session')!, ctx.session);
  }
  
  return response;
};
```

## Best Practices

### ✅ DO: Keep middleware focused

```typescript
// Good - single responsibility
const authenticate = async (ctx, next) => {
  ctx.user = await verifyToken(ctx.headers.authorization);
  return next(ctx);
};

const requireAdmin = async (ctx, next) => {
  if (ctx.user.role !== 'admin') {
    return ctx.response.status(403).json({ error: 'Forbidden' });
  }
  return next(ctx);
};
```

### ❌ DON'T: Create monolithic middleware

```typescript
// Bad - does too much
const megaMiddleware = async (ctx, next) => {
  // Authentication
  // Authorization
  // Rate limiting
  // Logging
  // etc...
};
```

### ✅ DO: Always call next()

```typescript
const middleware = async (ctx, next) => {
  // Do work
  const response = await next(ctx); // Important!
  // Do more work
  return response;
};
```

### ✅ DO: Handle errors properly

```typescript
const safeMiddleware = async (ctx, next) => {
  try {
    // Risky operation
    ctx.data = await riskyOperation();
    return next(ctx);
  } catch (error) {
    return ctx.response.status(500).json({ error: 'Failed' });
  }
};
```

## Performance

Middleware is optimized through:
- **JIT Compilation** - Hot middleware paths are compiled
- **Chain Inlining** - Reduces function call overhead
- **Context Pooling** - Reuses context objects

```typescript
const app = createApp({
  enableJIT: true  // Enable optimization (default)
});
```

## Next Steps

- ✅ [Validation](./05-validation.md) - Validate requests
- 🔒 [Error Handling](./06-error-handling.md) - Handle errors
- 📖 [API Reference](./09-api-reference.md) - Complete API docs

---

[← Routing](./03-routing.md) | [Validation →](./05-validation.md)

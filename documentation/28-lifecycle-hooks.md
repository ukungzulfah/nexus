# Lifecycle Hooks

Nexus Framework menyediakan sistem **Lifecycle Hooks** untuk intercept dan memodifikasi request/response di berbagai tahap request lifecycle.

## Quick Start

```typescript
import { createApp } from 'nexus';

const app = createApp();

app.hooks({
    onRequest: async (ctx) => {
        ctx.requestId = crypto.randomUUID();
        console.log(`[${ctx.requestId}] ${ctx.method} ${ctx.path}`);
    },
    
    afterHandler: async (ctx, result) => {
        return {
            ...result,
            meta: { requestId: ctx.requestId, timestamp: Date.now() }
        };
    },
    
    onError: async (ctx, error) => {
        console.error(`[${ctx.requestId}] Error:`, error.message);
        // Log to Sentry, etc.
    }
});
```

## Hook Lifecycle Order

```
Request masuk
     │
     ▼
┌─────────────────┐
│   onRequest     │  ← Request received, sebelum processing
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ beforeValidation│  ← Sebelum schema validation
└────────┬────────┘
         │
         ▼
    [Validation]     ← Schema validation (jika ada)
         │
         ▼
┌─────────────────┐
│ afterValidation │  ← Setelah validation sukses
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  beforeHandler  │  ← Sebelum handler dijalankan
└────────┬────────┘
         │
         ▼
    [Handler]        ← Route handler execution
         │
         ▼
┌─────────────────┐
│  afterHandler   │  ← Setelah handler, bisa transform result
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   onResponse    │  ← Sebelum response dikirim
└────────┬────────┘
         │
         ▼
   Response sent


     [Error?]
         │
         ▼
┌─────────────────┐
│    onError      │  ← Ketika error terjadi
└─────────────────┘
```

## API Reference

### `app.hooks(hooks)`

Register lifecycle hooks untuk request processing.

```typescript
interface LifecycleHooks {
    onRequest?: (ctx: Context) => Promise<void | Response>;
    beforeValidation?: (ctx: Context) => Promise<void | Response>;
    afterValidation?: (ctx: Context) => Promise<void | Response>;
    beforeHandler?: (ctx: Context) => Promise<void | Response>;
    afterHandler?: (ctx: Context, result: any) => Promise<any>;
    onError?: (ctx: Context, error: Error) => Promise<void | Response>;
    onResponse?: (ctx: Context, response: Response) => Promise<void | Response>;
}

app.hooks(hooks: LifecycleHooks): Application
```

**Returns:** `Application` (chainable)

## Hook Details

### 1. `onRequest`

Dipanggil pertama kali ketika request masuk, sebelum processing apapun.

**Use cases:**
- Generate request ID
- Start timing/profiling
- Early request logging
- Rate limiting check

```typescript
app.hooks({
    onRequest: async (ctx) => {
        ctx.requestId = crypto.randomUUID();
        ctx.startTime = Date.now();
        console.log(`🚀 [${ctx.requestId}] ${ctx.method} ${ctx.path}`);
        
        // Early return untuk block request
        if (isBlacklisted(ctx.headers['x-forwarded-for'])) {
            return ctx.response.status(403).json({ error: 'Forbidden' });
        }
    }
});
```

### 2. `beforeValidation`

Dipanggil sebelum schema validation. Berguna untuk transform body sebelum divalidasi.

**Use cases:**
- Unwrap nested body
- Normalize input data
- Add default values

```typescript
app.hooks({
    beforeValidation: async (ctx) => {
        // Unwrap jika body dibungkus dalam "data"
        if (ctx.body?.data) {
            ctx.body = ctx.body.data;
        }
        
        // Normalize email ke lowercase
        if (ctx.body?.email) {
            ctx.body.email = ctx.body.email.toLowerCase().trim();
        }
    }
});
```

### 3. `afterValidation`

Dipanggil setelah validation sukses. Body sudah tervalidasi dan aman digunakan.

**Use cases:**
- Authorization check
- Load related data
- Business rule validation

```typescript
app.hooks({
    afterValidation: async (ctx) => {
        // Check authorization untuk admin routes
        if (ctx.path.startsWith('/admin')) {
            const token = ctx.headers.authorization?.replace('Bearer ', '');
            if (!token || !isAdmin(token)) {
                return ctx.response.status(401).json({ error: 'Unauthorized' });
            }
        }
    }
});
```

### 4. `beforeHandler`

Dipanggil tepat sebelum route handler dijalankan.

**Use cases:**
- Load user dari token
- Set up request context
- Pre-load data

```typescript
app.hooks({
    beforeHandler: async (ctx) => {
        const token = ctx.headers.authorization?.replace('Bearer ', '');
        if (token) {
            ctx.user = await getUserFromToken(token);
        }
        
        // Load tenant untuk multi-tenant app
        const tenantId = ctx.headers['x-tenant-id'];
        if (tenantId) {
            ctx.tenant = await loadTenant(tenantId);
        }
    }
});
```

### 5. `afterHandler`

Dipanggil setelah handler sukses. **Bisa transform/modify result.**

**Use cases:**
- Add metadata ke response
- Transform response format
- Add pagination info
- Logging response

```typescript
app.hooks({
    afterHandler: async (ctx, result) => {
        const duration = Date.now() - ctx.startTime;
        
        // Add metadata ke semua response
        return {
            ...result,
            meta: {
                requestId: ctx.requestId,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString(),
                version: 'v1'
            }
        };
    }
});
```

### 6. `onError`

Dipanggil ketika error terjadi di manapun dalam request lifecycle.

**Use cases:**
- Error logging ke external service
- Custom error response
- Alert/notification

```typescript
app.hooks({
    onError: async (ctx, error) => {
        // Log ke Sentry
        await sentry.captureException(error, {
            extra: {
                requestId: ctx.requestId,
                path: ctx.path,
                method: ctx.method,
                body: ctx.body
            }
        });
        
        // Slack notification untuk critical errors
        if (error.message.includes('database')) {
            await slack.notify(`🚨 Database error: ${error.message}`);
        }
        
        // Return custom error response
        return ctx.response.status(500).json({
            error: 'Something went wrong',
            requestId: ctx.requestId,
            support: 'Please contact support with this requestId'
        });
    }
});
```

### 7. `onResponse`

Dipanggil sebelum response dikirim ke client. Bisa modify final response.

**Use cases:**
- Final logging
- Add security headers
- Response timing

```typescript
app.hooks({
    onResponse: async (ctx, response) => {
        const duration = Date.now() - ctx.startTime;
        
        console.log(
            `✨ [${ctx.requestId}] ${ctx.method} ${ctx.path} → ${response.statusCode} (${duration}ms)`
        );
        
        // Add security headers
        response.headers['X-Request-ID'] = ctx.requestId;
        response.headers['X-Response-Time'] = `${duration}ms`;
    }
});
```

## Complete Example

```typescript
import { createApp } from 'nexus';

const app = createApp({ debug: true });

// Generate unique request ID
const generateRequestId = () => Math.random().toString(36).substring(2, 10);

// Register all hooks
app.hooks({
    // 1. Request received
    onRequest: async (ctx) => {
        ctx.requestId = generateRequestId();
        ctx.startTime = Date.now();
        console.log(`\n🚀 [${ctx.requestId}] ${ctx.method} ${ctx.path}`);
    },

    // 2. Before validation
    beforeValidation: async (ctx) => {
        console.log(`   📋 [${ctx.requestId}] Before validation`);
        
        // Transform wrapped body
        if (ctx.body?.wrapped) {
            ctx.body = ctx.body.wrapped;
        }
    },

    // 3. After validation
    afterValidation: async (ctx) => {
        console.log(`   ✅ [${ctx.requestId}] Validation passed`);
        
        // Authorization check
        if (ctx.path.startsWith('/admin') && !ctx.headers.authorization) {
            return ctx.response.status(401).json({ error: 'Unauthorized' });
        }
    },

    // 4. Before handler
    beforeHandler: async (ctx) => {
        console.log(`   ⚡ [${ctx.requestId}] Before handler`);
        
        // Load user from token
        const token = ctx.headers.authorization?.replace('Bearer ', '');
        if (token) {
            ctx.user = { id: 1, name: 'John' }; // await getUserFromToken(token)
        }
    },

    // 5. After handler - transform result
    afterHandler: async (ctx, result) => {
        const duration = Date.now() - ctx.startTime;
        console.log(`   📦 [${ctx.requestId}] Handler completed (${duration}ms)`);
        
        // Add metadata to all responses
        return {
            ...result,
            meta: {
                requestId: ctx.requestId,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString()
            }
        };
    },

    // 6. Error handling
    onError: async (ctx, error) => {
        console.error(`   ❌ [${ctx.requestId}] Error:`, error.message);
        
        // Log to external service
        // await sentry.captureException(error);
    },

    // 7. Before response sent
    onResponse: async (ctx, response) => {
        const duration = Date.now() - ctx.startTime;
        console.log(`   ✨ [${ctx.requestId}] Response: ${response.statusCode} (${duration}ms)\n`);
    }
});

// Routes
app.get('/hello', async (ctx) => {
    return { message: 'Hello World!' };
});

app.get('/error', async (ctx) => {
    throw new Error('Something went wrong!');
});

app.listen(3000);
```

**Output di terminal:**
```
🚀 [abc123] GET /hello
   📋 [abc123] Before validation
   ✅ [abc123] Validation passed
   ⚡ [abc123] Before handler
   📦 [abc123] Handler completed (1ms)
   ✨ [abc123] Response: 200 (2ms)
```

**Response:**
```json
{
    "message": "Hello World!",
    "meta": {
        "requestId": "abc123",
        "duration": "1ms",
        "timestamp": "2025-12-04T10:30:00.000Z"
    }
}
```

## Early Return

Semua hooks (kecuali `afterHandler`) bisa return `Response` untuk short-circuit request:

```typescript
app.hooks({
    onRequest: async (ctx) => {
        // Rate limit check
        if (await isRateLimited(ctx.ip)) {
            return ctx.response.status(429).json({ 
                error: 'Too many requests' 
            });
        }
    },
    
    afterValidation: async (ctx) => {
        // Business rule check
        if (ctx.body.amount > 10000 && !ctx.user.verified) {
            return ctx.response.status(403).json({ 
                error: 'Verify your account for large transactions' 
            });
        }
    }
});
```

## Combining with Middleware

Hooks dan middleware bekerja bersama:

```
Request → onRequest → [Middleware Chain] → beforeValidation → ... → Handler
```

```typescript
import { logger, cors } from 'nexus';

const app = createApp();

// Global middleware (runs after onRequest)
app.use(logger());
app.use(cors());

// Hooks
app.hooks({
    onRequest: async (ctx) => {
        // Runs BEFORE middleware
        ctx.requestId = generateId();
    },
    beforeHandler: async (ctx) => {
        // Runs AFTER middleware, before handler
        ctx.user = await loadUser(ctx);
    }
});
```

## Use Cases

### Request Tracing
```typescript
app.hooks({
    onRequest: async (ctx) => {
        ctx.traceId = ctx.headers['x-trace-id'] || generateTraceId();
        ctx.spanId = generateSpanId();
    },
    onResponse: async (ctx, response) => {
        response.headers['X-Trace-ID'] = ctx.traceId;
        response.headers['X-Span-ID'] = ctx.spanId;
    }
});
```

### Performance Monitoring
```typescript
app.hooks({
    onRequest: async (ctx) => {
        ctx.metrics = { start: process.hrtime.bigint() };
    },
    onResponse: async (ctx, response) => {
        const duration = Number(process.hrtime.bigint() - ctx.metrics.start) / 1e6;
        await prometheus.histogram('http_request_duration_ms', duration, {
            method: ctx.method,
            path: ctx.path,
            status: response.statusCode
        });
    }
});
```

### Multi-tenant
```typescript
app.hooks({
    onRequest: async (ctx) => {
        const tenantId = ctx.headers['x-tenant-id'] || ctx.query.tenant;
        if (!tenantId) {
            return ctx.response.status(400).json({ error: 'Tenant ID required' });
        }
        ctx.tenant = await loadTenant(tenantId);
        ctx.db = getTenantDatabase(tenantId);
    }
});
```

## See Also

- [Dependency Injection](./27-dependency-injection.md) - Inject services ke handlers
- [Middleware](./04-middleware.md) - Middleware system
- [Error Handling](./06-error-handling.md) - Error handling patterns

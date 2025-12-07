# Sentry Plugin

Nexus Framework menyediakan integrasi Sentry sebagai plugin untuk error tracking, performance monitoring, dan session management.

## Installation

Sentry plugin sudah built-in di Nexus Framework, tidak perlu install package tambahan.

## Quick Start

```typescript
import { createApp } from './src';
import { sentry } from './src/advanced/sentry';

const app = createApp();

app.plugin(sentry({
  dsn: process.env.SENTRY_DSN,
  environment: 'production'
}));

app.listen(3000);
```

## Configuration

### Basic Options

```typescript
app.plugin(sentry({
  // Required: Sentry DSN
  dsn: 'https://xxx@xxx.ingest.sentry.io/xxx',
  
  // Environment name
  environment: 'production', // default: process.env.NODE_ENV
  
  // Release version
  release: '1.0.0', // default: process.env.npm_package_version
  
  // Server name for identification
  serverName: 'api-server-1',
  
  // Debug mode - logs Sentry operations
  debug: false
}));
```

### Sampling Options

```typescript
app.plugin(sentry({
  dsn: '...',
  
  // Sample rate for error events (0.0 to 1.0)
  sampleRate: 1.0, // 100% - capture all errors
  
  // Sample rate for performance/transaction events
  tracesSampleRate: 0.1, // 10% - for production
  
  // Enable/disable performance monitoring
  enableTracing: true
}));
```

### Integration Options

```typescript
app.plugin(sentry({
  dsn: '...',
  
  integrations: {
    // Capture HTTP request errors
    http: true,
    
    // Capture console.error calls
    console: false,
    
    // Capture unhandled Promise rejections
    unhandledRejection: true,
    
    // Capture uncaught exceptions
    uncaughtException: true
  }
}));
```

### Middleware Options

```typescript
app.plugin(sentry({
  dsn: '...',
  
  middleware: {
    // Include request body in error reports
    includeRequestBody: true,
    
    // Include request headers
    includeHeaders: true,
    
    // Headers to exclude (sensitive data)
    excludeHeaders: ['authorization', 'cookie', 'x-api-key'],
    
    // Paths to ignore (no tracking)
    ignorePaths: ['/health', '/metrics', '/__nexus'],
    
    // Extract user from context
    extractUser: (ctx) => {
      const token = ctx.headers['authorization'];
      if (token) {
        const user = decodeToken(token);
        return { id: user.id, email: user.email };
      }
      return null;
    },
    
    // Custom transaction naming
    getTransactionName: (ctx) => `${ctx.method} ${ctx.path}`
  }
}));
```

### Advanced Options

```typescript
app.plugin(sentry({
  dsn: '...',
  
  // Global tags for all events
  tags: {
    service: 'api-gateway',
    version: '1.0.0',
    region: 'us-east-1'
  },
  
  // Extra context for all events
  extra: {
    nodeVersion: process.version
  },
  
  // Error patterns to ignore
  ignoreErrors: [
    'NotFoundError',
    /^ValidationError/,
    'ECONNRESET'
  ],
  
  // Paths to ignore
  ignorePaths: ['/health', '/ping'],
  
  // Request timeout
  timeout: 5000,
  
  // Max breadcrumbs to store
  maxBreadcrumbs: 100,
  
  // Before send hook - modify or drop events
  beforeSend: (event, hint) => {
    // Filter out specific errors
    if (event.exception?.values?.[0]?.type === 'IgnoredError') {
      return null; // Drop event
    }
    
    // Modify event
    event.tags = { ...event.tags, processed: 'true' };
    return event;
  },
  
  // Before send transaction hook
  beforeSendTransaction: (transaction) => {
    // Filter out health check transactions
    if (transaction.name.includes('/health')) {
      return null;
    }
    return transaction;
  }
}));
```

## Full Example

```typescript
app.plugin(sentry({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  release: '1.0.0',
  debug: process.env.NODE_ENV === 'development',
  
  sampleRate: 0.9,
  tracesSampleRate: 0.5,
  
  integrations: {
    unhandledRejection: true,
    uncaughtException: true,
    http: true,
    console: false
  },
  
  tags: {
    service: 'nexus-api',
    version: '1.0.0'
  },
  
  middleware: {
    includeRequestBody: true,
    includeHeaders: true,
    excludeHeaders: ['authorization', 'cookie', 'x-api-key'],
    ignorePaths: ['/health', '/metrics'],
    extractUser: (ctx) => {
      const userId = ctx.headers['x-user-id'] as string;
      return userId ? { id: userId } : null;
    }
  }
}));
```

## Helper Functions

### Capture Exception

Manually capture an error:

```typescript
import { captureException } from './src/advanced/sentry';

app.post('/api/users', {
  handler: async (ctx) => {
    try {
      await createUser(ctx.body);
    } catch (error) {
      captureException(error, {
        level: 'error',
        tags: { action: 'create_user' },
        extra: { userId: ctx.body.email }
      });
      throw error;
    }
  }
});
```

### Capture Message

Send a message to Sentry:

```typescript
import { captureMessage } from './src/advanced/sentry';

// Warning message
captureMessage('User attempted invalid action', {
  level: 'warning',
  tags: { userId: '123' }
});

// Info message
captureMessage('Feature flag enabled', {
  level: 'info',
  extra: { flag: 'new_dashboard' }
});
```

### Add Breadcrumb

Add navigation/action trail:

```typescript
import { addBreadcrumb } from './src/advanced/sentry';

app.post('/api/checkout', {
  handler: async (ctx) => {
    addBreadcrumb({
      type: 'http',
      category: 'checkout',
      message: 'User initiated checkout',
      data: { cartId: ctx.body.cartId },
      level: 'info'
    });
    
    // Process checkout...
  }
});
```

### Set User Context

Associate errors with a user:

```typescript
import { setUser } from './src/advanced/sentry';

// After login
setUser({
  id: user.id,
  email: user.email,
  username: user.name,
  ip_address: ctx.headers['x-forwarded-for']
});

// On logout
setUser(null);
```

### Set Tags

Add global tags:

```typescript
import { setTag } from './src/advanced/sentry';

// Single tag
setTag('feature', 'checkout_v2');

// Multiple tags
setTags({
  region: 'us-east-1',
  tier: 'premium'
});
```

### Set Extra Context

Add extra debugging info:

```typescript
import { setExtra } from './src/advanced/sentry';

setExtra('lastAction', 'checkout');
setExtra('cartItems', cartItems.length);
```

## Performance Monitoring

### Using withSpan

Track performance of specific operations:

```typescript
import { withSpan } from './src/advanced/sentry';

app.get('/api/users/:id', {
  handler: async (ctx) => {
    // Track database query
    const user = await withSpan(ctx,
      { op: 'db.query', description: 'Fetch user by ID' },
      async () => {
        return await db.users.findById(ctx.params.id);
      }
    );
    
    // Track external API call
    const profile = await withSpan(ctx,
      { op: 'http.client', description: 'Fetch user profile from CRM' },
      async () => {
        return await fetch(`https://crm.api/users/${user.id}`);
      }
    );
    
    return { user, profile };
  }
});
```

### Manual Transaction Control

```typescript
import { getSentry } from './src/advanced/sentry';

const client = getSentry();

// Start a transaction
const transaction = client.startTransaction({
  name: 'process-batch-job',
  op: 'job',
  tags: { jobType: 'email' }
});

// Create child spans
const span1 = client.startSpan(transaction, {
  op: 'db.query',
  description: 'Fetch pending emails'
});
// ... do work
client.finishSpan(span1);

const span2 = client.startSpan(transaction, {
  op: 'email.send',
  description: 'Send batch emails'
});
// ... do work
client.finishSpan(span2);

// Finish transaction
client.finishTransaction(transaction, 'ok');
```

## Graceful Shutdown

Flush pending events before shutdown:

```typescript
import { getSentry } from './src/advanced/sentry';

process.on('SIGTERM', async () => {
  const client = getSentry();
  if (client) {
    await client.flush(5000); // Wait max 5 seconds
  }
  process.exit(0);
});
```

> **Note:** When using `app.gracefulShutdown()`, Sentry events are automatically flushed.

## Best Practices

### 1. Environment-Based Configuration

```typescript
const isDev = process.env.NODE_ENV === 'development';

app.plugin(sentry({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  debug: isDev,
  sampleRate: isDev ? 1.0 : 0.9,
  tracesSampleRate: isDev ? 1.0 : 0.1
}));
```

### 2. Sensitive Data Filtering

```typescript
app.plugin(sentry({
  dsn: '...',
  
  middleware: {
    excludeHeaders: ['authorization', 'cookie', 'x-api-key', 'x-auth-token'],
    includeRequestBody: false // Disable in production if contains sensitive data
  },
  
  beforeSend: (event) => {
    // Remove sensitive data from extras
    if (event.extra?.password) {
      delete event.extra.password;
    }
    return event;
  }
}));
```

### 3. Ignore Noise

```typescript
app.plugin(sentry({
  dsn: '...',
  
  ignoreErrors: [
    'NotFoundError',
    'ValidationError', 
    'AbortError',
    /^Network request failed/
  ],
  
  middleware: {
    ignorePaths: ['/health', '/metrics', '/favicon.ico']
  }
}));
```

### 4. Meaningful Context

```typescript
app.post('/api/orders', {
  handler: async (ctx) => {
    // Add context before potential errors
    addBreadcrumb({
      category: 'order',
      message: 'Processing order',
      data: { 
        orderId: ctx.body.orderId,
        items: ctx.body.items.length 
      }
    });
    
    setTag('order_type', ctx.body.type);
    
    // Process order...
  }
});
```

## API Reference

### sentry(options)

Creates a Sentry plugin.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dsn` | `string` | required | Sentry DSN |
| `environment` | `string` | `process.env.NODE_ENV` | Environment name |
| `release` | `string` | `package.version` | Release version |
| `serverName` | `string` | hostname | Server identifier |
| `sampleRate` | `number` | `1.0` | Error sample rate (0-1) |
| `tracesSampleRate` | `number` | `0.1` | Transaction sample rate (0-1) |
| `enableTracing` | `boolean` | `true` | Enable performance monitoring |
| `maxBreadcrumbs` | `number` | `100` | Max breadcrumbs to store |
| `debug` | `boolean` | `false` | Enable debug logging |
| `timeout` | `number` | `5000` | Request timeout (ms) |
| `tags` | `Record<string, string>` | `{}` | Global tags |
| `extra` | `Record<string, any>` | `{}` | Global extra context |
| `ignoreErrors` | `(string \| RegExp)[]` | `[]` | Errors to ignore |
| `ignorePaths` | `string[]` | `[]` | Paths to ignore |
| `integrations` | `object` | see below | Integration settings |
| `middleware` | `object` | see below | Middleware settings |
| `beforeSend` | `function` | - | Event filter hook |
| `beforeSendTransaction` | `function` | - | Transaction filter hook |

### Helper Functions

| Function | Description |
|----------|-------------|
| `captureException(error, options?)` | Capture an exception |
| `captureMessage(message, options?)` | Capture a message |
| `addBreadcrumb(breadcrumb)` | Add a breadcrumb |
| `setUser(user)` | Set user context |
| `setTag(key, value)` | Set a tag |
| `setTags(tags)` | Set multiple tags |
| `setExtra(key, value)` | Set extra context |
| `getSentry()` | Get the Sentry client instance |
| `withSpan(ctx, options, fn)` | Execute function with span tracking |

## Troubleshooting

### Events Not Appearing

1. Check DSN is correct
2. Enable `debug: true` to see logs
3. Check `sampleRate` is not 0
4. Verify network connectivity to Sentry

### Performance Impact

1. Reduce `tracesSampleRate` in production
2. Use `ignorePaths` for high-traffic endpoints
3. Disable `includeRequestBody` if not needed

### Missing Context

1. Ensure `extractUser` returns user data
2. Add breadcrumbs before potential errors
3. Use `setTag` and `setExtra` for debugging info

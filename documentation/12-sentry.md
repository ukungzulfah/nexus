# Sentry Integration Guide

Nexus Framework menyediakan integrasi Sentry built-in untuk error tracking dan performance monitoring.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Configuration](#configuration)
3. [Error Tracking](#error-tracking)
4. [Performance Monitoring](#performance-monitoring)
5. [Breadcrumbs](#breadcrumbs)
6. [User Context](#user-context)
7. [Manual Capture](#manual-capture)
8. [Advanced Usage](#advanced-usage)

---

## Quick Start

### Installation

Sentry sudah built-in di Nexus Framework, tidak perlu install package tambahan!

### Basic Setup

```typescript
import { createApp } from 'nexus';

const app = createApp();

// Enable Sentry with one line
app.sentry({
  dsn: 'https://your-key@your-org.ingest.sentry.io/project-id'
});

app.get('/', (ctx) => ({ message: 'Hello World' }));

app.listen(3000);
```

Itu saja! Semua unhandled errors akan otomatis dilaporkan ke Sentry.

---

## Configuration

### Full Options

```typescript
app.sentry({
  // Required: Sentry DSN
  dsn: process.env.SENTRY_DSN!,

  // Environment (auto-detected from NODE_ENV)
  environment: 'production',

  // Release version
  release: '1.0.0',

  // Server name for identification
  serverName: 'api-server-1',

  // Sample rate for errors (0.0 - 1.0)
  sampleRate: 1.0, // 100% of errors

  // Sample rate for performance traces (0.0 - 1.0)
  tracesSampleRate: 0.1, // 10% of requests

  // Enable performance monitoring
  enableTracing: true,

  // Maximum breadcrumbs to store
  maxBreadcrumbs: 100,

  // Debug mode (logs Sentry operations)
  debug: false,

  // Attach stack traces to all messages
  attachStacktrace: true,

  // Send PII (email, username, IP)
  sendDefaultPii: false,

  // Global tags for all events
  tags: {
    app: 'my-api',
    version: '1.0.0'
  },

  // Global extra data
  extra: {
    team: 'backend'
  },

  // Paths to ignore
  ignorePaths: ['/health', '/metrics'],

  // Error messages to ignore
  ignoreErrors: [
    'ValidationError',
    /timeout/i
  ],

  // Request timeout
  timeout: 5000,

  // Integrations
  integrations: {
    http: true,
    console: false,
    unhandledRejection: true,
    uncaughtException: true
  },

  // Filter events before sending
  beforeSend: (event, hint) => {
    // Drop events from development
    if (event.environment === 'development') {
      return null;
    }
    // Modify event
    event.tags = { ...event.tags, custom: 'value' };
    return event;
  },

  // Filter transactions before sending
  beforeSendTransaction: (transaction) => {
    // Drop health check transactions
    if (transaction.name.includes('/health')) {
      return null;
    }
    return transaction;
  }
}, {
  // Middleware options
  includeRequestBody: false,
  includeHeaders: true,
  excludeHeaders: ['authorization', 'cookie'],
  ignorePaths: ['/health', '/metrics'],
  
  // Extract user from context
  extractUser: (ctx) => {
    if (ctx.user) {
      return {
        id: ctx.user.id,
        email: ctx.user.email,
        username: ctx.user.name
      };
    }
    return null;
  },

  // Custom transaction name
  getTransactionName: (ctx) => `${ctx.method} ${ctx.path}`
});
```

### Environment Variables

```bash
# .env
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=1.0.0
```

```typescript
app.sentry({
  dsn: process.env.SENTRY_DSN!,
  environment: process.env.SENTRY_ENVIRONMENT,
  release: process.env.SENTRY_RELEASE
});
```

---

## Error Tracking

### Automatic Error Capture

Semua unhandled errors otomatis dilaporkan:

```typescript
app.get('/api/users/:id', async (ctx) => {
  // If this throws, it's automatically captured
  const user = await db.users.find(ctx.params.id);
  
  if (!user) {
    throw new Error('User not found'); // Captured!
  }
  
  return user;
});
```

### Manual Error Capture

```typescript
import { captureException } from 'nexus';

app.get('/api/risky', async (ctx) => {
  try {
    await riskyOperation();
  } catch (error) {
    // Capture but don't throw
    captureException(error, {
      level: 'warning',
      tags: { operation: 'risky' },
      extra: { userId: ctx.user?.id }
    });
    
    return { status: 'fallback' };
  }
});
```

### Using Sentry Client Directly

```typescript
const sentry = app.getSentryClient();

sentry?.captureException(new Error('Something went wrong'), {
  level: 'error',
  tags: { module: 'payments' },
  extra: { orderId: '12345' },
  user: {
    id: 'user-123',
    email: 'user@example.com'
  }
});
```

---

## Performance Monitoring

### Automatic Transaction Tracing

Setiap HTTP request otomatis di-trace:

```
Transaction: GET /api/users
├── Span: database.query (SELECT * FROM users)
├── Span: http.request (external API call)
└── Span: serialize.json
```

### Custom Spans

```typescript
import { withSpan } from 'nexus';

app.get('/api/data', async (ctx) => {
  // Database query span
  const users = await withSpan(ctx, {
    op: 'db.query',
    description: 'Fetch all users'
  }, async () => {
    return await db.users.findAll();
  });

  // Processing span
  const processed = await withSpan(ctx, {
    op: 'process',
    description: 'Transform user data'
  }, () => {
    return users.map(transformUser);
  });

  return processed;
});
```

### Manual Transactions

```typescript
const sentry = app.getSentryClient();

// Start transaction
const transaction = sentry?.startTransaction({
  name: 'Background Job',
  op: 'job.process'
});

if (transaction) {
  // Create child span
  const span = sentry?.startSpan(transaction, {
    op: 'db.query',
    description: 'Fetch pending jobs'
  });

  await fetchPendingJobs();

  sentry?.finishSpan(span!, 'ok');

  // Finish transaction
  sentry?.finishTransaction(transaction, 'ok');
}
```

---

## Breadcrumbs

Breadcrumbs adalah jejak aktivitas yang membantu debug:

### Automatic Breadcrumbs

HTTP requests otomatis menjadi breadcrumbs:

```
[http.request]  GET /api/users
[http.response] GET /api/users - 200
[http.request]  POST /api/orders
[error]         ValidationError: Invalid email
```

### Manual Breadcrumbs

```typescript
import { addBreadcrumb } from 'nexus';

app.post('/api/checkout', async (ctx) => {
  addBreadcrumb({
    type: 'info',
    category: 'checkout',
    message: 'Checkout started',
    data: { cartItems: ctx.body.items.length }
  });

  const order = await processOrder(ctx.body);

  addBreadcrumb({
    type: 'info',
    category: 'checkout',
    message: 'Order created',
    data: { orderId: order.id }
  });

  addBreadcrumb({
    type: 'query',
    category: 'payment',
    message: 'Payment initiated',
    data: { amount: order.total }
  });

  return order;
});
```

### Breadcrumb Types

```typescript
addBreadcrumb({
  type: 'default',    // General events
  // type: 'http',    // HTTP requests
  // type: 'navigation', // Route changes
  // type: 'error',   // Errors
  // type: 'debug',   // Debug info
  // type: 'query',   // Database queries
  // type: 'info',    // Informational
  
  category: 'custom.category',
  message: 'Description',
  level: 'info', // debug, info, warning, error
  data: { key: 'value' }
});
```

---

## User Context

### Set User from Auth Middleware

```typescript
// Auth middleware
const auth: Middleware = async (ctx, next) => {
  const user = await verifyToken(ctx.headers.authorization);
  ctx.user = user;
  return next(ctx);
};

// Sentry config
app.sentry({
  dsn: process.env.SENTRY_DSN!
}, {
  extractUser: (ctx) => {
    if (ctx.user) {
      return {
        id: ctx.user.id,
        email: ctx.user.email,
        username: ctx.user.name,
        subscription: ctx.user.plan // Custom data
      };
    }
    return null;
  }
});
```

### Manual User Context

```typescript
import { setUser } from 'nexus';

// Set user
setUser({
  id: 'user-123',
  email: 'john@example.com',
  username: 'john_doe',
  ip_address: '{{auto}}' // Auto-detect IP
});

// Clear user (on logout)
setUser(null);
```

---

## Manual Capture

### Capture Messages

```typescript
import { captureMessage } from 'nexus';

// Info level
captureMessage('User upgraded to premium', {
  level: 'info',
  tags: { plan: 'premium' },
  user: { id: 'user-123' }
});

// Warning level
captureMessage('Rate limit approaching', {
  level: 'warning',
  extra: { currentRate: 950, limit: 1000 }
});
```

### Tags and Extra Data

```typescript
import { setTag, setExtra } from 'nexus';

// Set global tags (added to all events)
setTag('app.version', '2.0.0');
setTag('deployment.region', 'us-east-1');

// Set extra context
setExtra('config', {
  featureFlags: { newUI: true },
  limits: { maxUpload: '10MB' }
});
```

---

## Advanced Usage

### Custom Error Handler

```typescript
import { createSentryErrorHandler } from 'nexus';

const app = createApp();
const sentry = new SentryClient({ dsn: '...' });

// Use Sentry error handler
app.onError(createSentryErrorHandler(sentry));
```

### With Graceful Shutdown

```typescript
app.gracefulShutdown({ timeout: 30000 });

app.sentry({
  dsn: process.env.SENTRY_DSN!
});

// Sentry flush is automatically added as shutdown hook!
```

### Filtering Events

```typescript
app.sentry({
  dsn: process.env.SENTRY_DSN!,
  
  beforeSend: (event, hint) => {
    const error = hint?.originalException;

    // Don't send validation errors
    if (error?.name === 'ValidationError') {
      return null;
    }

    // Don't send 404s
    if (event.tags?.['http.status_code'] === '404') {
      return null;
    }

    // Scrub sensitive data
    if (event.request?.data?.password) {
      event.request.data.password = '[REDACTED]';
    }

    // Add custom fingerprint for grouping
    if (error?.message.includes('database')) {
      event.fingerprint = ['database-error'];
    }

    return event;
  }
});
```

### Multiple Sentry Projects

```typescript
import { SentryClient } from 'nexus';

// Main app errors
const appSentry = new SentryClient({
  dsn: process.env.SENTRY_DSN_APP!,
  environment: 'production'
});

// Payment errors (separate project)
const paymentSentry = new SentryClient({
  dsn: process.env.SENTRY_DSN_PAYMENTS!,
  environment: 'production',
  tags: { module: 'payments' }
});

// Use different clients for different modules
app.post('/api/payments', async (ctx) => {
  try {
    return await processPayment(ctx.body);
  } catch (error) {
    paymentSentry.captureException(error);
    throw error;
  }
});
```

### Testing with Sentry

```typescript
import { SentryClient } from 'nexus';

// Mock client for testing
const mockSentry = new SentryClient({
  dsn: 'https://fake@fake.ingest.sentry.io/123',
  beforeSend: () => null // Drop all events in tests
});

// Or disable entirely
mockSentry.setEnabled(false);
```

---

## Best Practices

1. **Always set environment** - Helps filter production vs development errors
2. **Set release version** - Enables release tracking and source maps
3. **Use meaningful transaction names** - Makes performance data useful
4. **Add breadcrumbs at key points** - Helps debug complex flows
5. **Set user context early** - After authentication
6. **Use tags for filtering** - team, feature, version, etc.
7. **Filter sensitive data** - Use beforeSend to scrub PII
8. **Set appropriate sample rates** - 100% for errors, 10-20% for performance
9. **Add shutdown hook** - Ensure events are flushed before exit
10. **Use custom fingerprints** - Group related errors together

---

## Troubleshooting

### Events Not Appearing

```typescript
// Enable debug mode
app.sentry({
  dsn: process.env.SENTRY_DSN!,
  debug: true // Check console for logs
});
```

### Check DSN

```typescript
// Validate DSN format
// Should be: https://<key>@<org>.ingest.sentry.io/<project>
console.log('DSN:', process.env.SENTRY_DSN);
```

### Check Sample Rate

```typescript
app.sentry({
  dsn: process.env.SENTRY_DSN!,
  sampleRate: 1.0, // 100% for debugging
  tracesSampleRate: 1.0
});
```

### Force Send Test Event

```typescript
import { captureMessage } from 'nexus';

app.get('/sentry-test', (ctx) => {
  captureMessage('Test event from Nexus', { level: 'info' });
  return { status: 'sent' };
});
```

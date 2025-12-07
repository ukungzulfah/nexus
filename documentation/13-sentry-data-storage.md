# Sentry Data Storage & Scope Analysis

Dokumentasi lengkap tentang data apa saja yang dikirim ke Sentry dan bagaimana scope-nya dalam Nexus Framework.

## Table of Contents

1. [Event Structure](#event-structure)
2. [Data Categories](#data-categories)
3. [Scope Hierarchy](#scope-hierarchy)
4. [Security & Privacy](#security--privacy)
5. [Storage & Retention](#storage--retention)
6. [Data Flow Diagram](#data-flow-diagram)

---

## Event Structure

Setiap event yang dikirim ke Sentry memiliki struktur lengkap:

```json
{
  "event_id": "a1b2c3d4e5f6g7h8",
  "timestamp": 1701619200,
  "platform": "node",
  "level": "error",
  "logger": "nexus",
  "server_name": "api-server-1",
  "release": "1.0.0",
  "environment": "production",
  
  "message": "Database connection failed",
  
  "exception": {
    "values": [
      {
        "type": "DatabaseError",
        "value": "Connection timeout after 5000ms",
        "stacktrace": { /* stack frames */ },
        "mechanism": {
          "type": "generic",
          "handled": true
        }
      }
    ]
  },
  
  "user": { /* user data */ },
  "tags": { /* tags */ },
  "extra": { /* extra context */ },
  "contexts": { /* system context */ },
  "breadcrumbs": [ /* activity trail */ ],
  "request": { /* HTTP request info */ },
  "fingerprint": [ /* grouping */ ]
}
```

---

## Data Categories

### 1. Event Metadata

**Apa yang disimpan:**
```typescript
{
  event_id: string;           // Unique identifier
  timestamp: number;          // When error occurred (Unix timestamp)
  platform: 'node';           // Platform type
  level: 'error' | 'warning'; // Severity level
  logger: 'nexus';            // Which logger
  message?: string;           // Error message
  fingerprint?: string[];     // Grouping key
}
```

**Scope**: **GLOBAL** - Semua error akan punya metadata ini

**Contoh**:
```json
{
  "event_id": "a1b2c3d4e5f6g7h8",
  "timestamp": 1701619200,
  "platform": "node",
  "level": "error",
  "message": "User validation failed"
}
```

---

### 2. Error/Exception Data

**Apa yang disimpan:**
```typescript
{
  type: string;              // Error class name (e.g., "ValidationError")
  value: string;             // Error message
  stacktrace: {
    frames: [
      {
        filename: string;    // File path
        function: string;    // Function name
        lineno: number;      // Line number
        colno: number;       // Column number
        abs_path: string;    // Absolute path
        in_app: boolean;     // Is this our code?
        context_line?: string;    // Line of code
        pre_context?: string[];    // Lines before
        post_context?: string[];   // Lines after
      }
    ]
  };
  mechanism: {
    type: 'generic' | 'unhandledRejection' | 'uncaughtException';
    handled: boolean;
  };
}
```

**Scope**: **ERROR-SPECIFIC** - Hanya pada error events

**Contoh Stack Trace**:
```json
{
  "exception": {
    "values": [{
      "type": "TypeError",
      "value": "Cannot read property 'email' of undefined",
      "stacktrace": {
        "frames": [
          {
            "filename": "/app/src/handlers/user.ts",
            "function": "createUser",
            "lineno": 42,
            "colno": 15,
            "abs_path": "/app/src/handlers/user.ts",
            "in_app": true,
            "context_line": "const email = user.email.toLowerCase();",
            "pre_context": ["async function createUser(user) {", "  // Validate user"],
            "post_context": ["  return email;", "}"]
          },
          {
            "filename": "/app/node_modules/express/index.js",
            "function": "handler",
            "in_app": false
          }
        ]
      }
    }]
  }
}
```

---

### 3. Server Context

**Apa yang disimpan:**
```typescript
{
  server_name: string;   // Server hostname
  release: string;       // App version (e.g., "1.0.0")
  environment: string;   // 'production' | 'staging' | 'development'
  contexts: {
    runtime: {
      name: 'node';
      version: string; // Node.js version (e.g., "v20.10.0")
    };
    os: {
      name: string;    // Platform (e.g., 'linux', 'darwin')
      version: string; // Architecture (e.g., 'x64')
    };
  };
}
```

**Scope**: **GLOBAL** - Ada di setiap event

**Contoh**:
```json
{
  "server_name": "api-server-1",
  "release": "1.0.0",
  "environment": "production",
  "contexts": {
    "runtime": {
      "name": "node",
      "version": "v20.10.0"
    },
    "os": {
      "name": "linux",
      "version": "x64"
    }
  }
}
```

---

### 4. User Context

**Apa yang disimpan:**
```typescript
{
  id?: string;           // User ID (e.g., "user-123")
  email?: string;        // User email
  username?: string;     // Username
  ip_address?: string;   // User's IP address
  [key: string]: any;    // Custom user data
}
```

**Scope**: **CONDITIONAL** - Hanya jika middleware `extractUser` mengembalikan data

**Contoh**:
```json
{
  "user": {
    "id": "user-12345",
    "email": "john@example.com",
    "username": "john_doe",
    "ip_address": "192.168.1.1",
    "subscription": "premium",
    "country": "US"
  }
}
```

**Cara Data Dikumpulkan**:
```typescript
app.sentry({
  dsn: process.env.SENTRY_DSN!
}, {
  extractUser: (ctx) => {
    if (ctx.user) {
      return {
        id: ctx.user.id,
        email: ctx.user.email,
        username: ctx.user.name,
        subscription: ctx.user.plan,
        country: ctx.user.country
      };
    }
    return null;
  }
});
```

---

### 5. HTTP Request Context

**Apa yang disimpan:**
```typescript
{
  request: {
    url?: string;          // Full URL
    method?: string;       // HTTP method (GET, POST, etc.)
    headers?: {
      [key: string]: string;
    };
    query_string?: string; // Query params (from URL)
    data?: any;            // Request body (optional)
    cookies?: string;      // Cookie header
  };
}
```

**Scope**: **REQUEST-BASED** - Dikumpulkan dari middleware

**Contoh Lengkap**:
```json
{
  "request": {
    "url": "https://api.example.com/api/users/123?sort=name",
    "method": "POST",
    "query_string": "sort=name",
    "headers": {
      "user-agent": "Mozilla/5.0...",
      "content-type": "application/json",
      "accept": "application/json"
    },
    "data": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "cookies": "session=abc123; theme=dark"
  }
}
```

**Kontrol Data yang Dikirim**:
```typescript
app.sentry({
  dsn: process.env.SENTRY_DSN!
}, {
  // Include request body in error reports
  includeRequestBody: true,
  
  // Include request headers
  includeHeaders: true,
  
  // Headers to exclude (sensitive data)
  excludeHeaders: [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token'
  ]
});
```

---

### 6. Tags

**Apa yang disimpan:**
```typescript
{
  tags: {
    [key: string]: string; // Simple key-value for filtering
  }
}
```

**Scope**: **FLEXIBLE** - Global + per-event

**Contoh**:
```json
{
  "tags": {
    "http.method": "POST",
    "http.url": "/api/users",
    "http.status_code": "500",
    "environment": "production",
    "version": "1.0.0",
    "region": "us-east-1",
    "team": "backend",
    "module": "payments"
  }
}
```

**Penggunaan**:
```typescript
// Global tags (di semua event)
app.sentry({
  tags: {
    app: 'my-api',
    version: '1.0.0',
    team: 'backend'
  }
});

// Per-event tags
captureException(error, {
  tags: {
    module: 'payments',
    operation: 'charge'
  }
});

// Manually set tags
setTag('feature_flag.new_checkout', 'enabled');
```

---

### 7. Extra Context

**Apa yang disimpan:**
```typescript
{
  extra: {
    [key: string]: any; // Any data (objects, arrays, etc.)
  }
}
```

**Scope**: **FLEXIBLE** - Global + per-event

**Contoh**:
```json
{
  "extra": {
    "user_id": "user-123",
    "order_id": "order-456",
    "payment_method": "credit_card",
    "amount": 99.99,
    "cart_items": [
      { "sku": "PROD-001", "qty": 2 },
      { "sku": "PROD-002", "qty": 1 }
    ],
    "feature_flags": {
      "new_checkout": true,
      "ai_recommendations": false
    },
    "trace_id": "xyz-789",
    "db_query_time_ms": 245
  }
}
```

**Penggunaan**:
```typescript
// Global extra
app.sentry({
  extra: {
    api_version: 'v2',
    database: 'postgres'
  }
});

// Per-event extra
captureException(error, {
  extra: {
    user_id: ctx.user?.id,
    order_id: ctx.params.orderId,
    database_query: dbQuery
  }
});

// Set extra manually
setExtra('current_feature_flags', {
  ai_search: true,
  dark_mode: false
});
```

---

### 8. Breadcrumbs

**Apa yang disimpan:**
```typescript
[
  {
    type: 'http' | 'default' | 'navigation' | 'error' | 'debug' | 'query' | 'info';
    category?: string;
    message?: string;
    level?: 'debug' | 'info' | 'warning' | 'error';
    timestamp?: number;
    data?: Record<string, any>;
  }
]
```

**Scope**: **REQUEST-BASED** - Per transaction (max 100)

**Contoh Breadcrumb Trail**:
```json
{
  "breadcrumbs": [
    {
      "type": "info",
      "category": "auth",
      "message": "User login",
      "level": "info",
      "timestamp": 1701619100,
      "data": { "user_id": "user-123" }
    },
    {
      "type": "http",
      "category": "http.request",
      "message": "GET /api/cart",
      "level": "info",
      "timestamp": 1701619150,
      "data": {
        "method": "GET",
        "url": "/api/cart",
        "status_code": 200,
        "duration_ms": 45
      }
    },
    {
      "type": "query",
      "category": "database",
      "message": "SELECT * FROM orders WHERE user_id = ?",
      "level": "info",
      "timestamp": 1701619160,
      "data": {
        "duration_ms": 32,
        "rows_affected": 5
      }
    },
    {
      "type": "default",
      "category": "payment",
      "message": "Processing payment",
      "level": "info",
      "timestamp": 1701619170,
      "data": { "amount": 99.99, "method": "stripe" }
    },
    {
      "type": "error",
      "category": "payment",
      "message": "Payment declined",
      "level": "error",
      "timestamp": 1701619175,
      "data": { "code": "card_declined", "retry_count": 2 }
    }
  ]
}
```

**Penggunaan**:
```typescript
addBreadcrumb({
  type: 'http',
  category: 'api.call',
  message: 'Calling external API',
  level: 'info',
  data: {
    endpoint: 'https://api.stripe.com/charges',
    method: 'POST',
    timeout: 5000
  }
});
```

---

### 9. Performance Tracing

**Apa yang disimpan**:
```typescript
{
  trace_id: string;        // Unique trace ID
  span_id: string;         // This span's ID
  parent_span_id?: string; // Parent span (if nested)
  name: string;            // Span name
  op: string;              // Operation type
  status: string;          // 'ok' | 'error'
  start_timestamp: number; // Start time (Unix seconds)
  timestamp: number;       // End time
  tags?: Record<string, string>;
  data?: Record<string, any>;
  spans?: Span[];          // Child spans
}
```

**Scope**: **CONDITIONAL** - Hanya jika `enableTracing: true`

**Contoh Transaction dengan Spans**:
```json
{
  "trace_id": "a1b2c3d4e5f6g7h8i9j0",
  "span_id": "k1l2m3n4o5p6q7r8",
  "name": "POST /api/orders",
  "op": "http.server",
  "status": "ok",
  "start_timestamp": 1701619200.123,
  "timestamp": 1701619200.456,
  "tags": {
    "http.method": "POST",
    "http.status_code": "201"
  },
  "data": {
    "http.response_time_ms": 333
  },
  "spans": [
    {
      "span_id": "r8s9t0u1v2w3x4y5",
      "parent_span_id": "k1l2m3n4o5p6q7r8",
      "op": "db.query",
      "description": "SELECT * FROM users WHERE id = ?",
      "status": "ok",
      "start_timestamp": 1701619200.150,
      "timestamp": 1701619200.180,
      "data": {
        "duration_ms": 30,
        "rows": 1
      }
    },
    {
      "span_id": "z1a2b3c4d5e6f7g8",
      "parent_span_id": "k1l2m3n4o5p6q7r8",
      "op": "http.request",
      "description": "POST https://api.stripe.com/charges",
      "status": "ok",
      "start_timestamp": 1701619200.200,
      "timestamp": 1701619200.350,
      "data": {
        "duration_ms": 150,
        "status_code": 200
      }
    }
  ]
}
```

---

## Scope Hierarchy

Bagaimana data dikumpulkan pada berbagai tingkat:

```
┌─────────────────────────────────────────────────────────┐
│ Application Scope (Initialization)                      │
│ - environment                                            │
│ - release                                               │
│ - serverName                                            │
│ - sampleRate                                            │
│ - Global tags                                           │
│ - Global extra                                          │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────┴──────────────────────────────────────────┐
│ Request Scope (Each HTTP Request)                       │
│ - user (from extractUser middleware)                    │
│ - correlationId                                          │
│ - timestamp                                             │
│ - HTTP request context                                  │
│   - URL, method, headers, body                          │
│ - Breadcrumbs (per request, max 100)                    │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────┴──────────────────────────────────────────┐
│ Transaction Scope (Performance Tracing)                 │
│ - trace_id, span_id                                     │
│ - op (operation type)                                   │
│ - Child spans (db queries, API calls, etc.)             │
│ - tags (http.method, http.status_code, etc.)            │
│ - data (duration_ms, response_time, etc.)               │
└──────────────┬──────────────────────────────────────────┘
               │
┌──────────────┴──────────────────────────────────────────┐
│ Event Scope (Error/Message Capture)                     │
│ - event_id                                              │
│ - level (error, warning, info, etc.)                    │
│ - exception/message                                     │
│ - fingerprint (for grouping)                            │
│ - Per-event tags & extra                                │
└─────────────────────────────────────────────────────────┘
```

---

## Security & Privacy

### Data Yang TIDAK Dikirim (Secara Default):

1. **Passwords & Secrets**
   ```typescript
   // TIDAK dikirim:
   password, token, secret, apiKey, auth, authorization
   ```

2. **Personal Information (PII)**
   ```typescript
   // Kontrol dengan flag:
   app.sentry({
     sendDefaultPii: false // Default
   });
   ```

3. **Sensitive Headers**
   ```typescript
   app.sentry({}, {
     excludeHeaders: [
       'authorization',
       'cookie',
       'x-api-key',
       'x-auth-token',
       'x-csrf-token'
     ]
   });
   ```

### Data Filtering & Scrubbing:

```typescript
app.sentry({
  dsn: process.env.SENTRY_DSN!,
  
  beforeSend: (event, hint) => {
    // Redact credit card numbers
    if (event.request?.data?.card_number) {
      event.request.data.card_number = '[REDACTED]';
    }
    
    // Remove sensitive query params
    if (event.request?.query_string) {
      event.request.query_string = event.request.query_string
        .replace(/token=[^&]*/g, 'token=[REDACTED]');
    }
    
    // Scrub emails in some cases
    if (process.env.NODE_ENV === 'production') {
      if (event.user?.email) {
        const parts = event.user.email.split('@');
        event.user.email = parts[0].substring(0, 2) + '***@' + parts[1];
      }
    }
    
    return event;
  }
});
```

### Compliance:

- **GDPR**: Datas disimpan di Sentry server (pastikan punya DPA)
- **CCPA**: User punya hak untuk request/delete data
- **Data Retention**: Set retention policy di Sentry dashboard

---

## Storage & Retention

### Di Mana Data Disimpan:

1. **Sentry Cloud** (default)
   ```typescript
   app.sentry({
     dsn: 'https://key@org.ingest.sentry.io/project'
     // Data dikirim ke Sentry cloud servers
   });
   ```

2. **Self-Hosted Sentry**
   ```typescript
   app.sentry({
     dsn: 'https://key@sentry.example.com/project'
     // Data dikirim ke server Anda sendiri
   });
   ```

### Retention Policy (default):

- **Errors**: 30 hari
- **Transactions**: 30 hari (bisa dikurangi)
- **Attachments**: 7 hari

### Quota:

Default free tier:
- 5,000 errors/bulan
- 10,000 transactions/bulan
- Bisa ditingkatkan dengan paid plan

---

## Data Flow Diagram

```
┌────────────────────────────┐
│  Application Starts        │
│  - app.sentry({dsn:...})   │
└──────────────┬─────────────┘
               │
┌──────────────┴──────────────┐
│  HTTP Request Comes In      │
│  middleware: createSentry() │
└──────────────┬──────────────┘
               │
      ┌────────┴────────┐
      │                 │
   ┌──┴──┐         ┌────┴───┐
   │ OK  │         │ ERROR  │
   └──┬──┘         └────┬───┘
      │                 │
      │         ┌───────┴─────────┐
      │         │                 │
      │    captureException()  captureMessage()
      │    (automatic or manual)  (manual)
      │         │                 │
      │         └────────┬────────┘
      │                  │
      │         ┌────────┴────────────────┐
      │         │                         │
      │    beforeSend() filter?      beforeSend() filter?
      │    Drop?                     Drop?
      │         │                         │
      │         └────────┬────────────────┘
      │                  │
      │         Build Envelope:
      │         - Event metadata
      │         - Exception/message
      │         - User context
      │         - Request context
      │         - Tags & extra
      │         - Breadcrumbs
      │         - Tracing data
      │                  │
      │         ┌────────┴──────────┐
      │         │                   │
      │    HTTP POST to Sentry    (Optional)
      │    async (non-blocking)   Store locally
      │         │
      │         │
      │    Sentry receives event
      │    - Processes & deduplicates
      │    - Creates issue group
      │    - Stores in database
      │    - Updates dashboard
      │    - Triggers alerts (if configured)
      │
   ┌──┴──┐
   │Done │
   └─────┘
```

---

## Contoh Lengkap Data Sentry Event

```typescript
// Scenario: User tries to checkout dengan credit card yang declined

app.post('/api/checkout', async (ctx) => {
  // Data yang dikumpulkan oleh Sentry:
});
```

**Event Lengkap yang Dikirim ke Sentry**:

```json
{
  "event_id": "a1b2c3d4e5f6g7h8",
  "timestamp": 1701619200.123,
  "platform": "node",
  "level": "error",
  "logger": "nexus",
  "message": "Payment declined",
  
  "exception": {
    "values": [{
      "type": "PaymentError",
      "value": "Card declined: insufficient_funds",
      "stacktrace": {
        "frames": [
          {
            "filename": "/app/src/handlers/checkout.ts",
            "function": "processPayment",
            "lineno": 45,
            "in_app": true
          }
        ]
      }
    }]
  },
  
  "user": {
    "id": "user-123",
    "email": "john@example.com",
    "ip_address": "192.168.1.1",
    "subscription_tier": "free"
  },
  
  "request": {
    "url": "https://api.example.com/api/checkout",
    "method": "POST",
    "headers": {
      "user-agent": "Mozilla/5.0...",
      "content-type": "application/json"
    },
    "data": {
      "amount": 99.99,
      "currency": "USD",
      "card_last_four": "4242"
    }
  },
  
  "tags": {
    "http.method": "POST",
    "http.url": "/api/checkout",
    "http.status_code": "402",
    "feature": "checkout",
    "payment_method": "credit_card",
    "card_brand": "visa",
    "error_code": "insufficient_funds"
  },
  
  "extra": {
    "order_id": "order-456",
    "user_tier": "free",
    "cart_total": 99.99,
    "retry_count": 2,
    "payment_processor": "stripe",
    "processor_response_time_ms": 1200
  },
  
  "breadcrumbs": [
    {
      "type": "info",
      "category": "checkout",
      "message": "Checkout page loaded",
      "timestamp": 1701619100
    },
    {
      "type": "info",
      "category": "cart",
      "message": "Cart validated",
      "data": { "items": 3, "total": 99.99 },
      "timestamp": 1701619110
    },
    {
      "type": "http",
      "category": "http.request",
      "message": "POST /api/checkout",
      "timestamp": 1701619190
    },
    {
      "type": "query",
      "category": "database",
      "message": "SELECT user_payment_methods WHERE user_id = ?",
      "data": { "duration_ms": 15 },
      "timestamp": 1701619195
    },
    {
      "type": "http",
      "category": "payment",
      "message": "Calling Stripe API",
      "data": { "endpoint": "/v1/charges", "amount": 9999 },
      "timestamp": 1701619198
    }
  ],
  
  "contexts": {
    "runtime": {
      "name": "node",
      "version": "v20.10.0"
    },
    "os": {
      "name": "linux",
      "version": "x64"
    }
  },
  
  "server_name": "api-server-1",
  "release": "1.0.0",
  "environment": "production"
}
```

---

## Best Practices Pengumpulan Data

1. **Jangan kirim password/token**
   ```typescript
   beforeSend: (event) => {
     if (event.request?.data?.password) {
       delete event.request.data.password;
     }
     return event;
   }
   ```

2. **Exclude sensitive headers**
   ```typescript
   app.sentry({}, {
     excludeHeaders: ['authorization', 'cookie', 'x-api-key']
   });
   ```

3. **Gunakan tags untuk filtering**
   ```typescript
   captureException(error, {
     tags: {
       feature: 'payments',
       severity: 'high'
     }
   });
   ```

4. **Samping breadcrumbs saja yang penting**
   ```typescript
   addBreadcrumb({
     category: 'payment',
     message: 'Payment attempt',
     data: { amount: 99.99 } // Good
     // JANGAN: data: { all: bigData } // Bad
   });
   ```

5. **Set user context setelah auth**
   ```typescript
   app.sentry({}, {
     extractUser: (ctx) => {
       return ctx.user ? {
         id: ctx.user.id,
         email: ctx.user.email
       } : null;
     }
   });
   ```

6. **Fingerprint untuk grouping yang smart**
   ```typescript
   captureException(error, {
     fingerprint: ['payment-declined', error.code]
   });
   ```

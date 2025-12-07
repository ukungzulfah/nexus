# Sentry Data Storage - Ringkasan

## TLDR: Data Apa yang Dikirim ke Sentry?

### ✅ SELALU Dikirim (AMAN)
```
✓ Event ID, timestamp, platform
✓ Error/exception details (type, message, stacktrace)
✓ Server info (hostname, OS, Node version)
✓ HTTP method & status codes
✓ Tags (environment, feature, team, etc)
✓ Breadcrumb trail (activity log)
✓ Performance metrics (duration, latency)
```

### ⚠️ CONDITIONAL (Hanya jika dikonfigurasi)
```
? User data (ID, email, username, IP) - dari extractUser middleware
? Request headers (user-agent, content-type) - exclude sensitive
? Request body - DISABLED by default
? Performance traces - hanya jika enableTracing: true
? Custom tags & extra data - hanya apa yang di-set
```

### 🔴 TIDAK Dikirim (Protected)
```
✗ Passwords
✗ API keys & tokens
✗ Credit card numbers
✗ Authorization headers
✗ Database connection strings
```

---

## Data Categories at a Glance

| Category | Data | Sent By Default | Safety |
|----------|------|-----------------|--------|
| **Metadata** | Event ID, timestamp, platform, level | ✅ Always | ✅ Safe |
| **Exception** | Error type, message, stack trace | ✅ If error | ⚠️ Check message |
| **Server** | Hostname, OS, Node version | ✅ Always | ✅ Safe |
| **User** | ID, email, username, IP | ❌ Not by default | ⚠️ PII |
| **HTTP Request** | URL, method, headers, body | ⚠️ Partial | 🔴 Filtering needed |
| **Tags** | Custom labels for filtering | ✅ Always | ✅ Safe |
| **Extra** | Custom context data | ❌ Not by default | ⚠️ Depends on data |
| **Breadcrumbs** | Activity trail | ✅ Always | ✅ Mostly safe |
| **Performance** | Traces, spans, duration | ❌ Not by default | ✅ Safe |

---

## Scope Hierarchy

```
┌─ Global Scope ─────────────────────────┐
│  • environment (dev/prod/staging)      │
│  • release (app version)               │
│  • global tags & extra                 │
│  • sampleRate, DSN config              │
└────────────────────────────────────────┘
         ↓ Every Request ↓
┌─ Request Scope ────────────────────────┐
│  • user (if extractUser returns data)  │
│  • HTTP context (method, URL, headers) │
│  • breadcrumbs (per request, max 100)  │
│  • correlationId                       │
└────────────────────────────────────────┘
         ↓ If Error Occurs ↓
┌─ Error Scope ──────────────────────────┐
│  • exception details                   │
│  • stack trace                         │
│  • per-event tags & extra              │
│  • request context at time of error    │
└────────────────────────────────────────┘
         ↓ If Tracing Enabled ↓
┌─ Transaction Scope ────────────────────┐
│  • trace_id, span_id                   │
│  • operation type & status             │
│  • child spans (db, api calls)         │
│  • performance metrics                 │
└────────────────────────────────────────┘
```

---

## What Gets Captured in Each Scenario

### Scenario 1: Normal Request (No Error)
```
Dikirim ke Sentry:
✓ Breadcrumb: HTTP request start
✓ Breadcrumb: HTTP request completed (200 OK)
✓ User context (if extractUser returns data)
✓ Tags: http.method, http.status_code
✓ Performance trace (jika tracing enabled)

TIDAK dikirim:
✗ Exception details
✗ Error-specific data
✗ Stack traces
```

### Scenario 2: Request dengan Error
```
Dikirim ke Sentry:
✓ Full event dengan:
  - Exception details
  - Stack trace (source files, lines)
  - User context (if available)
  - Request context (URL, method, headers)
  - Breadcrumb trail
  - Tags & extra data
  - Performance metrics
  
Dengan filtering:
✗ Authorization headers (excluded)
✗ Passwords (redacted)
✗ API keys (redacted)
✗ Request body (disabled by default)
```

### Scenario 3: Background Job Error
```
Dikirim ke Sentry:
✓ Exception details
✓ Stack trace
✓ Tags: job_name, job_id
✓ Extra: job_params (jika safe)
✓ Breadcrumbs: job steps

TIDAK dikirim:
✗ HTTP context (bukan HTTP request)
✗ User context (tidak ada di background job)
```

---

## Configuration Checklist

### Minimal (Basic)
```typescript
app.sentry({
  dsn: process.env.SENTRY_DSN!
});
// ✓ All errors captured
// ✓ Safe defaults applied
```

### Recommended (Production)
```typescript
app.sentry({
  dsn: process.env.SENTRY_DSN!,
  environment: process.env.NODE_ENV,
  release: process.env.npm_package_version,
  tags: { app: 'my-api', region: 'us-east' },
  sampleRate: 1.0,
  tracesSampleRate: 0.1,
  sendDefaultPii: false
}, {
  excludeHeaders: ['authorization', 'cookie', 'x-api-key'],
  extractUser: (ctx) => ctx.user ? { id: ctx.user.id } : null
});
```

### Maximum Security (Financial/Healthcare)
```typescript
app.sentry({
  dsn: process.env.SENTRY_DSN!,
  environment: process.env.NODE_ENV,
  release: process.env.npm_package_version,
  sendDefaultPii: false,
  
  beforeSend: (event) => {
    // Remove all user data
    delete event.user;
    
    // Remove request body
    delete event.request?.data;
    
    // Scrub error messages
    event.exception?.values?.forEach(exc => {
      exc.value = exc.value.replace(/\d{4}-\d{4}-\d{4}-\d{4}/g, '[CARD]');
    });
    
    return event;
  }
}, {
  includeRequestBody: false,
  includeHeaders: false,
  extractUser: () => null
});
```

---

## Data Flow Summary

```
HTTP Request comes in
    ↓
Middleware captures HTTP context
    ↓
Add breadcrumb: HTTP request
    ↓
Extract user (if configured)
    ↓
Start performance trace (if enabled)
    ↓
Handler execution
    ├─ Success → Add success breadcrumb → Send trace only
    └─ Error → Capture exception → Build complete event
        ↓
    Apply beforeSend filter
        ↓
    Build envelope with:
    - Event metadata
    - Exception/message
    - User context
    - Request context
    - Tags & extra
    - Breadcrumbs
    - Traces
        ↓
    Send to Sentry (async, non-blocking)
        ↓
    Sentry receives
        ↓
    Process & deduplicate
        ↓
    Create issue group
        ↓
    Store in database
        ↓
    Update dashboard
        ↓
    Trigger alerts
```

---

## Size Estimates

### Typical Event Sizes

```
Metadata only:           ~500 bytes
Simple error:            ~2-5 KB
Complex error:           ~10-20 KB
With request body:       ~20-50 KB
With traces:             ~30-100 KB
With all breadcrumbs:    ~50-150 KB
```

### Quota Impact

```
Free Tier: 5,000 events/month
Pro Tier: 50,000+ events/month

Typical app:
- 10 errors/day = 300 events/month ✓
- 100 errors/day = 3,000 events/month ✓
- 1,000 errors/day = 30,000 events/month ⚠️
```

---

## Common Questions

### Q1: Apakah email user dikirim ke Sentry?
**A**: Tidak, kecuali Anda secara eksplisit menambahkannya via `extractUser`:
```typescript
extractUser: (ctx) => ({
  id: ctx.user.id,
  email: ctx.user.email // This gets sent
})
```

### Q2: Request body dikirim?
**A**: Tidak, disabled by default:
```typescript
app.sentry({}, {
  includeRequestBody: false // Default
});
```

### Q3: Authorization header dikirim?
**A**: Tidak, automatically excluded:
```typescript
app.sentry({}, {
  excludeHeaders: [
    'authorization', // ← Excluded automatically
    'cookie',
    'x-api-key'
  ]
});
```

### Q4: Password dalam error message dikirim?
**A**: Bisa, gunakan `beforeSend` untuk filter:
```typescript
beforeSend: (event) => {
  event.exception?.values?.forEach(exc => {
    exc.value = exc.value.replace(/password[^,\s]*/gi, '[REDACTED]');
  });
  return event;
}
```

### Q5: Database connection string dikirim?
**A**: Bisa jika ada di error message, gunakan `beforeSend`:
```typescript
beforeSend: (event) => {
  if (event.extra?.db_config) {
    delete event.extra.db_config;
  }
  return event;
}
```

---

## Best Practices Summary

1. ✅ **Always set environment** - Helps identify production vs dev
2. ✅ **Use tags for filtering** - Makes debugging easier
3. ✅ **Exclude sensitive headers** - Authorization, cookies, API keys
4. ✅ **Set user ID only** - Not email/username without consent
5. ✅ **Use beforeSend hook** - Filter sensitive error messages
6. ✅ **Monitor Sentry quota** - Implement sampling if needed
7. ✅ **Test with debug mode** - See what's being sent
8. ✅ **Check GDPR compliance** - User consent for PII
9. ✅ **Use meaningful tags** - Feature, module, team, etc
10. ✅ **Sample appropriately** - 100% for errors, 10% for traces

---

## Implementation Example

```typescript
import { createApp } from 'nexus';

const app = createApp();

// Enable Sentry with secure defaults
app.sentry({
  // Required
  dsn: process.env.SENTRY_DSN!,
  
  // Identification
  environment: process.env.NODE_ENV || 'development',
  release: process.env.npm_package_version || '0.0.0',
  serverName: `api-${process.env.REGION || 'unknown'}`,
  
  // Sampling
  sampleRate: 1.0,           // 100% of errors
  tracesSampleRate: 0.1,     // 10% of traces
  
  // Security
  sendDefaultPii: false,     // Don't send PII by default
  
  // Context
  tags: {
    app: 'my-api',
    team: 'backend',
    version: '1.0.0'
  },
  
  // Filtering
  beforeSend: (event) => {
    // Your filtering logic
    return event;
  }
}, {
  // Middleware options
  includeRequestBody: false,
  includeHeaders: true,
  excludeHeaders: [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token'
  ],
  ignorePaths: ['/health', '/metrics'],
  
  // Extract only safe user data
  extractUser: (ctx) => {
    return ctx.user ? {
      id: ctx.user.id
      // Don't send email/username without explicit consent
    } : null;
  }
});

// Now all errors are tracked securely!
app.listen(3000);
```

---

## Next Steps

1. Read full docs: `documentation/12-sentry.md`
2. Read data details: `documentation/13-sentry-data-storage.md`
3. Check quick reference: `documentation/14-sentry-data-reference.md`
4. Test with debug mode: `app.sentry({ debug: true })`
5. Monitor your Sentry dashboard
6. Adjust sampling as needed
7. Set up alerts for critical errors

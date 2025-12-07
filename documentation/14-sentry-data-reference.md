# Sentry Data Storage - Quick Reference

Referensi cepat tentang data yang dikirim ke Sentry dalam Nexus Framework.

## 1. Event Metadata (SELALU DIKIRIM)

| Data | Nilai Contoh | Scope | Sensitivitas |
|------|-------------|-------|-------------|
| `event_id` | `a1b2c3d4` | Unique per event | ❌ Non-sensitive |
| `timestamp` | `1701619200` | Time of error | ❌ Non-sensitive |
| `platform` | `node` | Always Node.js | ❌ Non-sensitive |
| `level` | `error`, `warning`, `info` | Set by dev | ❌ Non-sensitive |
| `environment` | `production`, `staging` | Configuration | ❌ Non-sensitive |
| `release` | `1.0.0` | App version | ❌ Non-sensitive |

**Kesimpulan**: ✅ Aman untuk dikirim

---

## 2. Exception/Error Data (JIKA ADA ERROR)

| Data | Nilai Contoh | Scope | Sensitivitas |
|------|-------------|-------|-------------|
| `exception.type` | `ValidationError` | Error class name | ❌ Non-sensitive |
| `exception.message` | `Email is invalid` | Error message | ⚠️ Bisa sensitive |
| `stacktrace.filename` | `/app/src/handlers/user.ts` | File path | ❌ Non-sensitive |
| `stacktrace.function` | `createUser` | Function name | ❌ Non-sensitive |
| `stacktrace.lineno` | `42` | Line number | ❌ Non-sensitive |
| `stacktrace.context_line` | `const user = await db.find(id);` | Actual code | ⚠️ Bisa reveal logic |

**Kesimpulan**: ⚠️ Perlu difilter jika ada data sensitif dalam error message

**Contoh Filtering**:
```typescript
beforeSend: (event) => {
  if (event.exception?.values?.[0]?.value?.includes('password')) {
    event.exception.values[0].value = '[REDACTED]';
  }
  return event;
}
```

---

## 3. Server Context (SELALU DIKIRIM)

| Data | Nilai Contoh | Scope | Sensitivitas |
|------|-------------|-------|-------------|
| `server_name` | `api-server-1` | Hostname | ⚠️ Bisa reveal infrastructure |
| `contexts.runtime.name` | `node` | Node.js | ❌ Non-sensitive |
| `contexts.runtime.version` | `v20.10.0` | Node version | ❌ Non-sensitive |
| `contexts.os.name` | `linux` | Operating system | ⚠️ Infrastructure info |
| `contexts.os.version` | `x64` | Architecture | ⚠️ Infrastructure info |

**Kesimpulan**: ⚠️ Reveal infrastructure, tapi biasanya aman untuk production

**Trik**: Gunakan generic name untuk `server_name`:
```typescript
app.sentry({
  serverName: `api-server-${process.env.REGION || 'unknown'}`
});
```

---

## 4. User Context (CONDITIONAL - Dari `extractUser`)

| Data | Nilai Contoh | Scope | Sensitivitas |
|------|-------------|-------|-------------|
| `user.id` | `user-12345` | User identifier | ✅ Safe for PII |
| `user.email` | `john@example.com` | Email address | ⚠️ PII (Personal Identifiable Info) |
| `user.username` | `john_doe` | Username | ⚠️ PII |
| `user.ip_address` | `192.168.1.1` | IP address | ⚠️ PII |
| `user.custom_field` | Any custom data | Custom context | ⚠️ Tergantung data |

**Kesimpulan**: ⚠️ SENSITIVE - Hanya kirim jika perlu & user setuju

**Kontrol Data**:
```typescript
app.sentry({
  sendDefaultPii: false // Default
}, {
  extractUser: (ctx) => {
    if (!ctx.user) return null;
    
    return {
      id: ctx.user.id,
      // email: ctx.user.email, // Jangan kirim tanpa persetujuan
      // username: ctx.user.name, // Jangan kirim tanpa persetujuan
      subscription_tier: ctx.user.plan // Non-PII, safe
    };
  }
});
```

**GDPR Compliance**:
- Email/username adalah PII
- Perlu user consent
- User bisa request deletion

---

## 5. HTTP Request Context (DARI MIDDLEWARE)

| Data | Nilai Contoh | Scope | Sensitivitas |
|------|-------------|-------|-------------|
| `request.url` | `https://api.example.com/api/users` | Full URL | ✅ Safe |
| `request.method` | `POST` | HTTP method | ✅ Safe |
| `request.query_string` | `sort=name&limit=10` | Query params | ⚠️ Bisa contain tokens |
| `request.headers.user-agent` | `Mozilla/5.0...` | Browser info | ✅ Safe |
| `request.headers.authorization` | `Bearer token123` | Auth token | 🔴 SENSITIVE |
| `request.data` | `{name: "John", email: "..."}` | Request body | ⚠️ Bisa contain sensitive |

**Kesimpulan**: 🔴 SENSITIVE - Perlu exclude headers & filter body

**Kontrol Data**:
```typescript
app.sentry({}, {
  // Include request body?
  includeRequestBody: false, // Default
  
  // Include headers?
  includeHeaders: true,
  
  // Exclude sensitive headers
  excludeHeaders: [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
    'password'
  ]
});
```

**Contoh Safe**:
```json
{
  "request": {
    "url": "https://api.example.com/api/checkout",
    "method": "POST",
    "headers": {
      "user-agent": "Mozilla/5.0...",
      "content-type": "application/json"
    }
    // authorization DIHAPUS
    // data DIHAPUS
  }
}
```

**Contoh NOT Safe**:
```json
{
  "request": {
    "headers": {
      "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." // 🔴
    },
    "data": {
      "credit_card": "4111-1111-1111-1111", // 🔴
      "password": "super_secret_123" // 🔴
    }
  }
}
```

---

## 6. Tags (GLOBAL + PER-EVENT)

| Data | Nilai Contoh | Scope | Sensitivitas |
|------|-------------|-------|-------------|
| `tags.http.method` | `POST` | Auto-added | ✅ Safe |
| `tags.http.status_code` | `500` | Auto-added | ✅ Safe |
| `tags.environment` | `production` | Configuration | ✅ Safe |
| `tags.team` | `backend` | Custom | ✅ Safe |
| `tags.feature` | `payments` | Custom | ✅ Safe |
| `tags.user_id` | `user-123` | Custom | ✅ Safe |

**Kesimpulan**: ✅ Tags safe untuk dikirim, berguna untuk filtering

**Penggunaan**:
```typescript
// Global tags
app.sentry({
  tags: {
    app: 'my-api',
    version: '1.0.0',
    team: 'backend',
    region: 'us-east-1'
  }
});

// Per-event tags
captureException(error, {
  tags: {
    module: 'payments',
    operation: 'charge',
    priority: 'high'
  }
});
```

---

## 7. Extra Context (GLOBAL + PER-EVENT)

| Data | Nilai Contoh | Scope | Sensitivitas |
|------|-------------|-------|-------------|
| `extra.order_id` | `order-456` | Custom ID | ✅ Safe |
| `extra.user_id` | `user-123` | Custom ID | ✅ Safe |
| `extra.amount` | `99.99` | Amount | ✅ Safe |
| `extra.payment_method` | `credit_card` | Type | ✅ Safe |
| `extra.db_query_time_ms` | `245` | Performance | ✅ Safe |
| `extra.raw_request_body` | Full body object | Custom | 🔴 SENSITIVE |

**Kesimpulan**: ⚠️ Extra useful tapi careful dengan sensitive data

**Safe Extra**:
```typescript
setExtra('checkout_context', {
  order_id: 'order-456',
  user_tier: 'premium',
  cart_items: 3,
  total: 99.99,
  payment_method: 'credit_card', // Type only, not details
  processing_time_ms: 245
});
```

**NOT Safe Extra**:
```typescript
setExtra('raw_request', {
  password: 'user_password', // 🔴
  credit_card: '4111-1111-1111-1111', // 🔴
  full_body: req.body // 🔴 Might contain sensitive data
});
```

---

## 8. Breadcrumbs (PER-REQUEST, MAX 100)

| Data | Nilai Contoh | Scope | Sensitivitas |
|------|-------------|-------|-------------|
| `type` | `http`, `database`, `error` | Event type | ✅ Safe |
| `category` | `http.request`, `db.query` | Category | ✅ Safe |
| `message` | `GET /api/users` | Short message | ✅ Safe |
| `level` | `info`, `warning`, `error` | Severity | ✅ Safe |
| `data.url` | `/api/users` | URL | ✅ Safe |
| `data.status_code` | `200` | HTTP status | ✅ Safe |
| `data.duration_ms` | `45` | Duration | ✅ Safe |
| `data.query` | Full SQL query | SQL statement | ⚠️ Bisa reveal schema |

**Kesimpulan**: ✅ Breadcrumbs mostly safe, tapi careful dengan SQL queries

**Safe Breadcrumbs**:
```typescript
addBreadcrumb({
  type: 'http',
  category: 'api.call',
  message: 'Fetching user',
  data: {
    method: 'GET',
    url: '/api/users/123',
    status_code: 200,
    duration_ms: 45
  }
});

addBreadcrumb({
  type: 'query',
  category: 'database',
  message: 'Find user by ID',
  data: {
    operation: 'SELECT',
    table: 'users',
    duration_ms: 15
    // Jangan: full_query: 'SELECT * FROM users WHERE...'
  }
});
```

---

## 9. Performance Tracing (CONDITIONAL)

| Data | Nilai Contoh | Scope | Sensitivitas |
|------|-------------|-------|-------------|
| `trace_id` | `a1b2c3d4e5f6` | Unique trace | ✅ Safe |
| `span_id` | `k1l2m3n4` | Unique span | ✅ Safe |
| `op` | `http.server`, `db.query` | Operation | ✅ Safe |
| `status` | `ok`, `error` | Status | ✅ Safe |
| `duration` | `245ms` | Duration | ✅ Safe |
| `tags` | Various | Custom tags | ✅ Safe if no PII |
| `data` | Various | Performance data | ✅ Safe if no sensitive |

**Kesimpulan**: ✅ Performance data safe, berguna untuk optimization

---

## Quick Checklist: Apa Boleh/Tidak Boleh

### ✅ AMAN untuk dikirim:
- [x] Error messages (non-sensitive)
- [x] Stack traces
- [x] HTTP method & status codes
- [x] URLs (tanpa sensitive query params)
- [x] Timestamps
- [x] Performance metrics (duration, latency)
- [x] Feature flags
- [x] User IDs (anonymous identifiers)
- [x] Error codes
- [x] Tags & breadcrumbs

### 🔴 JANGAN dikirim:
- [ ] Passwords
- [ ] API keys & tokens
- [ ] Credit card numbers
- [ ] Full request bodies (tanpa filtering)
- [ ] Authorization headers (kecuali di-sanitize)
- [ ] Database connection strings
- [ ] Private keys
- [ ] Full SQL queries (bisa reveal schema)
- [ ] PII tanpa consent (email, username, IP)

### ⚠️ CAREFUL (Filter dulu):
- [ ] Email addresses
- [ ] Phone numbers
- [ ] URLs dengan sensitive query params
- [ ] Custom user data
- [ ] Full error messages (bisa contain sensitive data)

---

## Contoh Implementasi Aman

```typescript
import { createApp } from 'nexus';

const app = createApp();

app.sentry({
  dsn: process.env.SENTRY_DSN!,
  environment: process.env.NODE_ENV,
  release: process.env.npm_package_version,
  
  // Global tags - safe data only
  tags: {
    app: 'my-api',
    team: 'backend',
    region: process.env.AWS_REGION
  },
  
  // Global extra - safe data only
  extra: {
    database: 'postgres',
    cache: 'redis',
    version: '1.0.0'
  },
  
  // Send default PII? No!
  sendDefaultPii: false,
  
  // Filter events before sending
  beforeSend: (event, hint) => {
    const error = hint?.originalException;
    
    // Remove sensitive from error message
    if (error?.message) {
      event.exception?.values?.forEach(exc => {
        exc.value = exc.value
          .replace(/token[:=]\s*\S+/gi, 'token=[REDACTED]')
          .replace(/password[:=]\s*\S+/gi, 'password=[REDACTED]')
          .replace(/apikey[:=]\s*\S+/gi, 'apikey=[REDACTED]');
      });
    }
    
    // Remove request body
    if (event.request?.data) {
      delete event.request.data;
    }
    
    return event;
  }
}, {
  // Middleware config
  includeRequestBody: false,
  includeHeaders: true,
  
  // Exclude sensitive headers
  excludeHeaders: [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
    'proxy-authorization'
  ],
  
  // Ignore health check paths
  ignorePaths: ['/health', '/metrics', '/__nexus/health'],
  
  // Extract only safe user data
  extractUser: (ctx) => {
    if (!ctx.user) return null;
    
    return {
      id: ctx.user.id, // Safe: user ID
      subscription_tier: ctx.user.plan, // Safe: subscription tier
      // email: ctx.user.email, // NOT included without consent
      // phone: ctx.user.phone // NOT included without consent
    };
  }
});

app.listen(3000);
```

---

## Troubleshooting

### "Terlalu banyak data dikirim"
```typescript
// Reduce trace sample rate
app.sentry({
  tracesSampleRate: 0.05 // 5% instead of 10%
});
```

### "Data sensitif terlihat di Sentry"
```typescript
// Use beforeSend to filter
beforeSend: (event) => {
  // Scrub sensitive data
  return event;
}
```

### "Quota Sentry penuh"
```typescript
// Reduce error sample rate
app.sentry({
  sampleRate: 0.5 // 50% instead of 100%
});

// Or ignore certain errors
app.sentry({
  ignoreErrors: [
    'NetworkError',
    '404',
    'timeout'
  ]
});
```

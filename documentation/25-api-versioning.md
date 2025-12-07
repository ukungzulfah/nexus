# API Versioning Guide

## Overview

API Versioning dalam Nexus Framework memungkinkan Anda untuk mengelola multiple versi endpoint API secara bersamaan tanpa breaking existing clients. Ini sangat penting untuk backward compatibility saat melakukan perubahan pada API.

## Kapan Butuh Versioning?

API versioning berguna ketika:

- **Breaking Changes**: Response atau request structure berubah
- **Deprecation**: Ingin menghapus fitur lama tapi masih ada client yang menggunakannya
- **Gradual Migration**: Ingin migrate client secara bertahap dari v1 ke v2
- **A/B Testing**: Test fitur baru di sebagian user

Contoh kasus nyata:
```
API v1: POST /login → { token: "abc123" }
API v2: POST /login → { token: "xyz", refreshToken: "abc", expiresIn: 3600 }
```

Tanpa versioning, update v2 akan break semua client yang expect v1 response.

---

## Setup Versioning

### Basic Configuration

```typescript
import { createApp } from './src';

const app = createApp();

// Configure versioning
app.configVersions({
  strategies: ['path', 'header', 'query'],  // 3 strategi yang didukung
  header: 'api-version',                    // Nama header (default: api-version)
  queryParam: 'v',                          // Nama query param (default: v)
  defaultVersion: 'v1',                     // Versi default jika tidak specify
  register: ['v1', 'v2', 'v3']              // Versi yang tersedia
});
```

### Options

| Option | Type | Default | Deskripsi |
|--------|------|---------|-----------|
| `strategies` | array | - | Strategi versioning: `'path'`, `'header'`, `'query'` |
| `header` | string | `'api-version'` | Nama HTTP header untuk version |
| `queryParam` | string | `'v'` | Nama query parameter untuk version |
| `defaultVersion` | string | - | Versi default jika tidak di-specify |
| `register` | string[] | - | Daftar versi yang valid |

---

## Strategies

Nexus mendukung 3 strategi versioning:

### 1. Path Strategy (`/v1/...`, `/v2/...`)

Request: `POST /v1/login`  
Response: v1 response

```typescript
app.post('/login', {
  handler: async (ctx) => {
    // ctx.version = 'v1'
    return { token: 'abc123' };
  }
});

// Otomatis jadi: POST /v1/login dan POST /v2/login
```

**Kelebihan:**
- ✅ Explicit dan mudah dibaca di URL
- ✅ SEO-friendly
- ✅ Supported oleh semua tools (curl, browser, etc)

**Kekurangan:**
- ❌ URL berbeda untuk tiap versi
- ❌ Client harus ganti endpoint URL

---

### 2. Header Strategy (`Accept-Version: v2`)

Request:
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -H "api-version: v2" \
  -d '{"email":"test@mail.com","password":"123"}'
```

Response: v2 response

```typescript
app.post('/login', {
  handler: async (ctx) => {
    // ctx.version = 'v2' (dari header)
    if (ctx.version === 'v2') {
      return { token: 'xyz789', refreshToken: 'abc' };
    }
    return { token: 'abc123' };
  }
});
```

**Kelebihan:**
- ✅ URL tetap sama
- ✅ Clean untuk SDK/API clients
- ✅ Non-breaking untuk existing clients

**Kekurangan:**
- ❌ Tidak visible di browser URL
- ❌ Perlu dokumentasi lebih jelas

---

### 3. Query Strategy (`?v=v2`)

Request: `POST /login?v=v2`

Response: v2 response

```bash
curl -X POST "http://localhost:3000/login?v=v2" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@mail.com","password":"123"}'
```

```typescript
app.post('/login', {
  handler: async (ctx) => {
    // ctx.version = 'v2' (dari query param)
    if (ctx.version === 'v2') {
      return { token: 'xyz789', refreshToken: 'abc' };
    }
    return { token: 'abc123' };
  }
});
```

**Kelebihan:**
- ✅ URL tetap sama
- ✅ Mudah untuk testing
- ✅ Visible di URL tapi tidak di path

**Kekurangan:**
- ❌ Query parameter bisa di-ignore cache
- ❌ Tidak ideal untuk production

---

## Examples

### Example 1: Simple Versioning dengan Path Strategy

```typescript
const app = createApp();

app.configVersions({
  strategies: ['path'],
  defaultVersion: 'v1',
  register: ['v1', 'v2']
});

// Route ini akan jadi: POST /v1/users
app.post('/users', {
  handler: async (ctx) => {
    return { users: [], version: ctx.version };
  }
});

// Route ini akan jadi: POST /v2/users
app.post('/v2/users', {
  handler: async (ctx) => {
    return { 
      users: [], 
      version: ctx.version,
      metadata: { count: 0 }  // field baru di v2
    };
  }
});

app.listen(3000);
```

**Test:**
```bash
# Keduanya bisa diakses
curl http://localhost:3000/v1/users
curl http://localhost:3000/v2/users
```

---

### Example 2: Multiple Strategies

```typescript
const app = createApp();

app.configVersions({
  strategies: ['path', 'header', 'query'],
  header: 'api-version',
  queryParam: 'v',
  defaultVersion: 'v1',
  register: ['v1', 'v2']
});

app.post('/login', {
  handler: async (ctx) => {
    const { version } = ctx;
    
    if (version === 'v2') {
      return { 
        token: 'xyz789',
        refreshToken: 'abc123',
        expiresIn: 3600
      };
    }
    
    return { token: 'abc123' };
  }
});

app.listen(3000);
```

**Test semua strategi:**
```bash
# Path strategy
curl http://localhost:3000/v1/login
curl http://localhost:3000/v2/login

# Header strategy
curl http://localhost:3000/login -H "api-version: v2"

# Query strategy
curl "http://localhost:3000/login?v=v2"

# Default (no version = v1)
curl http://localhost:3000/login
```

---

### Example 3: Gradual Migration

```typescript
const app = createApp();

app.configVersions({
  strategies: ['header'],
  header: 'api-version',
  defaultVersion: 'v1',
  register: ['v1', 'v2', 'v3']
});

// New endpoint hanya di v3
app.post('/v3/users', {
  handler: async (ctx) => {
    return { users: [], pagination: { page: 1, total: 100 } };
  }
});

// Enhanced di v2
app.post('/v2/users', {
  handler: async (ctx) => {
    return { users: [], count: 100 };
  }
});

// Legacy v1
app.post('/users', {  // defaultVersion = v1
  handler: async (ctx) => {
    return { users: [] };
  }
});

app.listen(3000);
```

**Migration path:**
1. Existing clients pakai v1 (default)
2. New clients pakai v2 (dengan `api-version: v2`)
3. Gradually migrate v2 clients ke v3
4. Akhirnya sunset v1 dan v2

---

## Context Properties

Saat versioning diaktifkan, context akan include:

```typescript
interface Context {
  // ... existing properties
  version: string;          // 'v1' atau 'v2' etc
  versionSource?: string;   // 'path' | 'header' | 'query' | 'default'
}
```

**Usage:**
```typescript
app.post('/login', {
  handler: async (ctx) => {
    console.log(`Request version: ${ctx.version}`);
    console.log(`Version from: ${ctx.versionSource}`); // path, header, query, atau default
    
    if (ctx.version === 'v2') {
      // v2 logic
    } else {
      // v1 logic
    }
  }
});
```

---

## Best Practices

### 1. Choose Right Strategy

| Strategi | Use Case |
|----------|----------|
| **Path** | Public API, REST purists, SEO |
| **Header** | SDK/Client libraries, mobile apps |
| **Query** | Testing, debugging, temporary migration |

Rekomendasi: Gunakan **Path** untuk public APIs.

### 2. Always Set Default Version

```typescript
app.configVersions({
  defaultVersion: 'v1',  // ← PENTING
  register: ['v1', 'v2']
});
```

Ini memastikan request tanpa explicit version tetap handled.

### 3. Register All Valid Versions

```typescript
app.configVersions({
  register: ['v1', 'v2', 'v3']  // ← Jangan lupa version baru!
});
```

### 4. Deprecate Old Versions Gracefully

```typescript
app.post('/v1/users', {
  handler: async (ctx) => {
    // Add deprecation warning header
    ctx.response.header('Deprecation', 'true');
    ctx.response.header('Sunset', 'Sun, 31 Dec 2024 23:59:59 GMT');
    ctx.response.header('Link', '</docs/migration>; rel="deprecation"');
    
    return { users: [] };
  }
});
```

### 5. Document Version Differences

```typescript
app.post('/users', {
  handler: async (ctx) => { /* ... */ },
  meta: {
    summary: 'List users',
    description: 'v1: Basic list. v2+: With pagination and filters.',
    tags: ['Users']
  }
});
```

### 6. Test All Versions

```bash
# Create test script
#!/bin/bash

# Test v1
curl http://localhost:3000/v1/users -H "api-version: v1"

# Test v2
curl http://localhost:3000/v2/users -H "api-version: v2"

# Test default (should be v1)
curl http://localhost:3000/users
```

---

## Playground Integration

Versioned routes akan otomatis ter-index di Playground:

```typescript
app.plugin(playground());
app.configVersions({
  strategies: ['path'],
  defaultVersion: 'v1',
  register: ['v1', 'v2']
});

// Semua route ini akan visible di Playground
app.post('/login', { /* ... */ });
app.post('/v2/login', { /* ... */ });
```

Di Playground, Anda bisa test semua versi dengan:
- Memilih endpoint `/v1/login` atau `/v2/login`
- Atau set header/query pada request

---

## Advanced: Custom Version Resolution

Jika ingin custom logic di version resolution:

```typescript
const app = createApp();

// Custom middleware untuk custom version detection
app.use(async (ctx, next) => {
  // Custom logic: detect version dari user profile, IP whitelist, etc
  const userVersion = await getUserVersion(ctx);
  if (userVersion) {
    ctx.version = userVersion;
  }
  return next(ctx);
});

app.configVersions({
  strategies: ['path'],
  defaultVersion: 'v1',
  register: ['v1', 'v2']
});
```

---

## Common Patterns

### Pattern 1: Gradual Field Addition

```typescript
app.post('/user/:id', {
  handler: async (ctx) => {
    const user = await getUser(ctx.params.id);
    
    const response: any = {
      id: user.id,
      name: user.name,
      email: user.email
    };
    
    // v2+ include metadata
    if (ctx.version !== 'v1') {
      response.createdAt = user.createdAt;
      response.metadata = { role: user.role };
    }
    
    return response;
  }
});
```

### Pattern 2: Different Response Formats

```typescript
app.get('/products', {
  handler: async (ctx) => {
    const products = await getProducts();
    
    if (ctx.version === 'v1') {
      // Array response
      return products;
    }
    
    // v2+: Object response dengan metadata
    return {
      data: products,
      pagination: { page: 1, total: products.length },
      timestamp: new Date().toISOString()
    };
  }
});
```

### Pattern 3: Separate Handlers Per Version

```typescript
const handleV1 = async (ctx) => {
  return { token: 'abc123' };
};

const handleV2 = async (ctx) => {
  return { token: 'xyz789', refreshToken: 'abc' };
};

app.post('/v1/login', { handler: handleV1 });
app.post('/v2/login', { handler: handleV2 });
```

---

## Summary

| Aspek | Detail |
|-------|--------|
| **Setup** | `app.configVersions({...})` |
| **Strategies** | path, header, query |
| **Context** | `ctx.version`, `ctx.versionSource` |
| **Best Practice** | Path strategy untuk public APIs |
| **Deprecation** | Add Deprecation header dengan sunset date |
| **Documentation** | Selalu document version differences |

---

## See Also

- [Routing Guide](./03-routing.md)
- [Middleware Guide](./04-middleware.md)
- [API Reference](./09-api-reference.md)

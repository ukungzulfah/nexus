# 📊 Benchmark Report: Nexus vs Express vs Fastify

**Tanggal Test:** 7 Desember 2025  
**Environment:** macOS  
**Node.js Runtime:** tsx (TypeScript execution)

---

## ⚙️ Konfigurasi Benchmark

| Parameter | Value |
|-----------|-------|
| Duration | 10 detik per test |
| Connections | 100 concurrent |
| Pipelining | 10 requests per connection |
| Tool | autocannon v7.15.0 |

---

## 🏆 Hasil Overall

| Rank | Server | Avg Req/sec | Avg Latency | Total Errors |
|------|--------|-------------|-------------|--------------|
| 🥇 | **Fastify** | 71,578 | 16.5 ms | 0 |
| 🥈 | **Nexus** | 49,313 | 19.2 ms | 910 |
| 🥉 | **Express** | 20,277 | 51.6 ms | 0 |

---

## 📌 Hasil Per Endpoint

### 1. Simple JSON Response (`GET /json`)

Response: `{ "message": "Hello, World!" }`

| Server | Req/sec | Latency (avg) | Latency (p99) | Throughput |
|--------|---------|---------------|---------------|------------|
| **Fastify** | 98,004 | 9.69 ms | 16 ms | 18.51 MB/s |
| **Nexus** | 96,131 | 9.99 ms | 15 ms | 16.69 MB/s |
| Express | 27,071 | 36.42 ms | 74 ms | 6.76 MB/s |

**🏆 Winner:** Fastify (+1.9% vs Nexus)

> ✅ **Nexus sangat kompetitif!** Hanya 1.9% lebih lambat dari Fastify untuk simple JSON.

---

### 2. Echo with Query Parameter (`GET /echo?name=Benchmark`)

Response: `{ "echo": "Hello, Benchmark!" }`

| Server | Req/sec | Latency (avg) | Latency (p99) | Throughput |
|--------|---------|---------------|---------------|------------|
| **Fastify** | 92,023 | 10.44 ms | 19 ms | 17.47 MB/s |
| **Nexus** | 71,066 | 13.70 ms | 23 ms | 12.40 MB/s |
| Express | 22,747 | 43.39 ms | 87 ms | 5.71 MB/s |

**🏆 Winner:** Fastify (+29.5% vs Nexus)

> ⚠️ **Gap mulai terlihat** saat ada query parameter parsing.

---

### 3. Large Array Response (`GET /users`)

Response: Array of 100 user objects

| Server | Req/sec | Latency (avg) | Latency (p99) | Throughput |
|--------|---------|---------------|---------------|------------|
| **Fastify** | 31,896 | 30.83 ms | 54 ms | 218.99 MB/s |
| **Nexus** | 30,047 | 32.75 ms | 68 ms | 205.84 MB/s |
| Express | 15,349 | 64.47 ms | 127 ms | 106.37 MB/s |

**🏆 Winner:** Fastify (+6.2% vs Nexus)

> ✅ **Nexus performs well** untuk payload besar, hanya 6% lebih lambat.

---

### 4. POST with JSON Body (`POST /data`)

Request Body: `{ "test": "data", "numbers": [1,2,3,4,5] }`

| Server | Req/sec | Latency (avg) | Latency (p99) | Errors |
|--------|---------|---------------|---------------|--------|
| **Fastify** | 64,388 | 15.03 ms | 28 ms | 0 |
| Express | 15,941 | 62.10 ms | 103 ms | 0 |
| Nexus | 8 | 20.44 ms | 27 ms | **910** |

**🏆 Winner:** Fastify

> 🚨 **CRITICAL ISSUE:** Nexus mengalami 910 timeout errors dan hanya mampu handle 8 req/sec!

---

## 🐛 Issue Analysis: Nexus POST Body Parsing

### Problem yang Ditemukan

Saat benchmark POST endpoint, Nexus mengalami:
- **910 timeout errors**
- **0 successful 2xx responses** (82 non-2xx responses)
- Throughput drop dari ~70k req/s ke **8 req/s**

### Root Cause Analysis

Berdasarkan kode server Nexus yang kita gunakan:

```typescript
app.post('/data', async (ctx) => {
  const body = await ctx.body();  // ← Potential bottleneck
  return ctx.json({ received: body, processed: true });
});
```

**Kemungkinan penyebab:**

1. **Async Body Parsing Bottleneck**
   - `ctx.body()` mungkin tidak di-optimize untuk high concurrency
   - Setiap request harus wait untuk body stream selesai di-parse
   - Dengan 100 connections × 10 pipelining = 1000 concurrent requests, ini bisa cause blocking

2. **Stream Handling Issue**
   - Body parsing mungkin tidak properly buffer incoming data
   - Potential memory pressure saat banyak request bersamaan

3. **Missing Content-Type Handling**
   - Mungkin perlu explicit JSON parser middleware

4. **Connection Pool Exhaustion**
   - Async operations yang pending bisa exhaust available resources

### Rekomendasi untuk Nexus

```typescript
// Option 1: Pre-parse body dengan middleware
app.use(async (ctx, next) => {
  if (ctx.method === 'POST' || ctx.method === 'PUT') {
    ctx.parsedBody = await ctx.body();
  }
  return next();
});

// Option 2: Gunakan built-in JSON middleware jika ada
app.use(nexus.json()); // seperti express.json()

// Option 3: Batasi concurrent body parsing
import { Semaphore } from 'async-mutex';
const bodySemaphore = new Semaphore(50);

app.post('/data', async (ctx) => {
  const [, release] = await bodySemaphore.acquire();
  try {
    const body = await ctx.body();
    return ctx.json({ received: body, processed: true });
  } finally {
    release();
  }
});
```

---

## 📈 Performance Gap Analysis: Mengapa Nexus Kalah dari Fastify?

### 1. JSON Serialization

**Fastify** menggunakan `fast-json-stringify` yang pre-compile JSON schema:

```javascript
// Fastify internal - schema-based serialization
const stringify = fastJson({
  type: 'object',
  properties: {
    message: { type: 'string' }
  }
});
// Output langsung tanpa JSON.stringify overhead
```

**Improvement untuk Nexus:**
- Implement schema-based JSON serialization
- Cache stringify functions per route
- Gunakan library seperti `fast-json-stringify` atau `@msgpack/msgpack`

---

### 2. Router Performance

**Fastify** menggunakan `find-my-way`, radix tree-based router yang O(log n):

```
/users/:id → Radix tree lookup (sangat cepat)
```

**Improvement untuk Nexus:**
- Evaluate current router implementation
- Consider menggunakan `find-my-way` atau `trek-router`
- Implement route caching untuk static routes
- Pre-compile regex patterns saat startup

---

### 3. Request/Response Object Overhead

**Fastify** minimize object creation dan property access:

```javascript
// Fastify - minimal wrapper
reply.send({ data }); // Direct write ke socket
```

**Improvement untuk Nexus:**
- Reduce Context object properties
- Lazy-load properties yang jarang dipakai
- Pool dan reuse context objects
- Avoid spread operators di hot paths

---

### 4. Body Parsing Strategy

**Fastify** parse body secara lazy dan streaming:

```javascript
// Hanya parse jika diperlukan
fastify.addContentTypeParser('application/json', 
  { parseAs: 'buffer' }, 
  (req, body, done) => {
    // Efficient buffer-based parsing
  }
);
```

**Improvement untuk Nexus:**
- Implement streaming body parser
- Add body size limits untuk prevent DoS
- Cache parsed bodies
- Support different content types efficiently

---

### 5. Middleware Chain Optimization

**Improvement untuk Nexus:**
```typescript
// Instead of array-based middleware
// Use compiled function chain
const compiledHandler = compileMiddleware([
  middleware1,
  middleware2,
  routeHandler
]);

function compileMiddleware(middlewares) {
  return middlewares.reduceRight(
    (next, mw) => (ctx) => mw(ctx, next),
    (ctx) => ctx
  );
}
```

---

### 6. HTTP Header Handling

**Improvement untuk Nexus:**
- Pre-allocate common headers
- Use header caching
- Minimize header parsing overhead

```typescript
// Cache static headers
const COMMON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-powered-by': 'Nexus'
};

// Apply once, not per-request
response.writeHead(200, COMMON_HEADERS);
```

---

## 🎯 Priority Improvements untuk Nexus

### High Priority (Impact Besar)

| # | Improvement | Expected Gain | Effort |
|---|-------------|---------------|--------|
| 1 | Fix POST body parsing | +10,000% untuk POST | Medium |
| 2 | Schema-based JSON stringify | +15-25% | Medium |
| 3 | Optimize router | +10-20% | High |

### Medium Priority

| # | Improvement | Expected Gain | Effort |
|---|-------------|---------------|--------|
| 4 | Query string parser optimization | +5-15% | Low |
| 5 | Context object pooling | +5-10% | Medium |
| 6 | Header caching | +3-5% | Low |

### Low Priority (Nice to Have)

| # | Improvement | Expected Gain | Effort |
|---|-------------|---------------|--------|
| 7 | HTTP/2 support | Varies | High |
| 8 | Cluster mode built-in | Linear scaling | Medium |
| 9 | Native addon for hot paths | +20-30% | Very High |

---

## 📋 Summary

### Kelebihan Nexus Saat Ini
- ✅ Performa GET request sangat bagus (hampir setara Fastify)
- ✅ Simple JSON response hanya 1.9% lebih lambat dari Fastify
- ✅ Large payload handling bagus (6% gap)
- ✅ Developer Experience yang baik

### Area yang Perlu Diperbaiki
- 🔴 **CRITICAL:** POST body parsing broken under load
- 🟡 Query parameter parsing bisa lebih cepat (+29% gap)
- 🟡 JSON serialization bisa di-optimize

### Rekomendasi Utama
1. **Immediate:** Fix body parsing untuk POST/PUT requests
2. **Short-term:** Implement schema-based JSON serialization
3. **Medium-term:** Optimize router dengan radix tree
4. **Long-term:** Consider V8 fast-path optimizations

---

## 🔗 Resources

- [Fastify Benchmarks](https://fastify.dev/benchmarks/)
- [fast-json-stringify](https://github.com/fastify/fast-json-stringify)
- [find-my-way Router](https://github.com/delvedor/find-my-way)
- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/dont-block-the-event-loop/)

---

*Report generated by benchmark suite on December 7, 2025*

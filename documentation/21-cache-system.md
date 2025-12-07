# Cache System - Multi-Tier Caching untuk Nexus Framework

## Pendahuluan

Nexus Framework menyediakan **Multi-Tier Cache** system yang powerful untuk meningkatkan performa aplikasi. Sistem ini mendukung cache-aside pattern, memoization, tag-based invalidation, dan wildcard pattern matching.

## Instalasi & Setup

```typescript
import { MultiTierCache, InMemoryCacheStore } from 'nexus';

// Setup cache dengan 1 tier (in-memory)
const cache = new MultiTierCache([
  {
    store: new InMemoryCacheStore('primary', 10_000), // max 10k entries
    ttl: 60_000 // 1 menit default TTL
  }
]);
```

## API Reference

### 1. `cache.get(key)`

Ambil value dari cache dengan key tertentu.

```typescript
const value = await cache.get('user:123');
if (value) {
  console.log('Found in cache:', value);
} else {
  console.log('Cache miss');
}
```

**Return**: `Value | undefined`

---

### 2. `cache.set(key, value, options)`

Simpan value ke cache dengan optional TTL dan tags.

```typescript
await cache.set('user:123', userData, {
  ttl: 300_000,        // 5 menit
  tags: ['users', 'active-users'],
  meta: { fetchedAt: new Date() }
});
```

**Options**:
- `ttl?: number` - Time to live dalam milliseconds
- `tags?: string[]` - Tag untuk group invalidation
- `meta?: Record<string, any>` - Metadata tambahan

---

### 3. `cache.wrap(key, resolver, options)`

Cache-aside pattern otomatis. Cek cache, jika miss jalankan resolver lalu simpan hasilnya.

```typescript
const user = await cache.wrap(
  'user:123',
  async () => {
    // Hanya dipanggil jika cache miss
    return await fetchUserFromDatabase(123);
  },
  { ttl: 300_000, tags: ['users'] }
);
```

**Keuntungan**:
- Otomatis handle cache miss
- Lebih simple dan clean
- Menghindari race condition

---

### 4. `cache.memoize(fn, options)`

Wrap async function agar hasil cache otomatis.

```typescript
async function fetchOrders(userId: string) {
  return await database.orders.findByUserId(userId);
}

// Memoize dengan custom key resolver
const getCachedOrders = cache.memoize(fetchOrders, {
  ttl: 300_000,
  tags: ['orders'],
  keyResolver: (userId) => `orders:${userId}`
});

// Panggil seperti biasa, tapi hasil di-cache
const orders = await getCachedOrders('user:123');
```

---

### 5. `cache.delete(key)`

Hapus satu cache key.

```typescript
await cache.delete('user:123');
```

---

### 6. `cache.deletePattern(pattern)`

Hapus cache dengan wildcard pattern.

```typescript
// Hapus semua cache user:123
await cache.deletePattern('user:123:*');

// Hapus semua cache dengan pattern
await cache.deletePattern('order:*:items');
```

**Pattern Syntax**:
- `*` = matches any characters (greedy)
- `?` = matches single character

---

### 7. `cache.invalidateTags(tags)`

Hapus semua cache dengan tag tertentu.

```typescript
// Hapus semua cache dengan tag 'users'
await cache.invalidateTags(['users']);

// Hapus cache dengan multiple tags
await cache.invalidateTags(['users', 'admin']);
```

**Gunakan untuk**: Invalidasi semua related data dalam satu operation.

---

### 8. `cache.getStats()`

Dapatkan statistik cache.

```typescript
const stats = cache.getStats();
console.log(stats);
// Output:
// {
//   tiers: [{ name: 'primary' }, { name: 'secondary' }],
//   tags: ['users', 'orders', 'products'],
//   defaultTTL: 60000
// }
```

---

## Use Cases & Contoh

### Use Case 1: Simple User Data Cache

```typescript
app.get('/api/users/:id', async (ctx: Context) => {
  const userId = ctx.params.id;
  
  const user = await cache.wrap(
    `user:${userId}`,
    async () => fetchUserFromDB(userId),
    { ttl: 300_000, tags: ['users'] }
  );

  return user;
});
```

**Flow**:
1. Request pertama → Cache miss → Fetch dari DB (100ms) → Simpan cache
2. Request kedua → Cache hit → Response instant (0ms)
3. Request ketiga → Cache hit → Response instant (0ms)

---

### Use Case 2: Product Catalog dengan Cache Invalidation

```typescript
// GET product
app.get('/api/products/:id', async (ctx: Context) => {
  return cache.wrap(
    `product:${ctx.params.id}`,
    () => fetchProduct(ctx.params.id),
    { ttl: 600_000, tags: ['products'] }
  );
});

// UPDATE product → invalidate cache
app.put('/api/products/:id', async (ctx: Context) => {
  const productId = ctx.params.id;
  
  // Update database
  await updateProductInDB(productId, ctx.body);
  
  // Invalidate cache
  await cache.delete(`product:${productId}`);
  
  return { message: 'Product updated' };
});

// ADMIN: Clear all product cache
app.delete('/api/admin/cache/products', async () => {
  await cache.invalidateTags(['products']);
  return { message: 'All product cache cleared' };
});
```

---

### Use Case 3: Complex Query dengan Memoization

```typescript
// Fungsi yang expensive (slow query)
async function getUserStatistics(userId: string) {
  return {
    totalOrders: await countOrders(userId),
    totalSpent: await sumOrderAmount(userId),
    lastOrder: await getLastOrder(userId),
    favoriteProducts: await getFavoriteProducts(userId)
  };
}

// Memoize dengan TTL 1 jam
const getStatsCached = cache.memoize(getUserStatistics, {
  ttl: 3600_000,
  tags: ['user-stats'],
  keyResolver: (userId) => `stats:${userId}`
});

app.get('/api/users/:id/stats', async (ctx: Context) => {
  // Cache hit: instant
  // Cache miss: sekali hitung, kemudian di-cache
  return getStatsCached(ctx.params.id);
});
```

---

### Use Case 4: Multi-Tier Cache (L1 & L2)

```typescript
const multiTierCache = new MultiTierCache([
  // Tier 1: Ultra fast, limited size (L1)
  {
    store: new InMemoryCacheStore('l1', 1_000),
    ttl: 30_000 // 30 detik
  },
  // Tier 2: Larger, longer TTL (L2)
  {
    store: new InMemoryCacheStore('l2', 50_000),
    ttl: 300_000 // 5 menit
  }
]);

// Cek L1 dulu, kalau miss cek L2
// Jika di-hit di L2, akan di-promote ke L1 untuk next request
const data = await multiTierCache.wrap(
  'hot-data',
  () => fetchExpensiveData(),
  { ttl: 300_000 }
);
```

**Behavior**:
- Request 1 → Miss L1 & L2 → Fetch data → Save di L1 & L2
- Request 2 → Hit L1 → Instant (0ms)
- Request 3 (setelah L1 expire) → Miss L1 → Hit L2 → Copy ke L1 → Return

---

### Use Case 5: Search Results Caching dengan Pattern

```typescript
// Cache search results dengan pattern
app.get('/api/search', async (ctx: Context) => {
  const { q, page = 1 } = ctx.query;
  const cacheKey = `search:${q}:${page}`;
  
  return cache.wrap(
    cacheKey,
    () => searchDatabase(q, page),
    { 
      ttl: 600_000,
      tags: ['search', `search:${q}`] // tag by query
    }
  );
});

// Clear search results untuk query tertentu
app.delete('/api/search/:q/cache', async (ctx: Context) => {
  await cache.deletePattern(`search:${ctx.params.q}:*`);
  return { message: `Cleared search cache for "${ctx.params.q}"` };
});
```

---

## Performance Comparison

### Tanpa Cache
```
GET /api/users/1
├─ Database query: 100ms
├─ JSON serialization: 5ms
└─ Total: ~105ms
```

### Dengan Cache
```
GET /api/users/1 (first request)
├─ Cache miss: 0ms
├─ Database query: 100ms
├─ Save to cache: 1ms
└─ Total: ~101ms

GET /api/users/1 (second request)
├─ Cache hit: <1ms
└─ Total: <1ms

Performance improvement: 100x faster! 🚀
```

---

## Best Practices

### ✅ Do's

1. **Use appropriate TTL**
   ```typescript
   // User data yang jarang berubah: TTL panjang
   await cache.set('user:123', user, { ttl: 3600_000 }); // 1 jam
   
   // Real-time data: TTL pendek
   await cache.set('stock:ABC', price, { ttl: 5_000 }); // 5 detik
   ```

2. **Use tags untuk group-related data**
   ```typescript
   await cache.set('order:1', order, { tags: ['orders', 'user:123'] });
   await cache.set('order:2', order, { tags: ['orders', 'user:123'] });
   
   // Invalidate semua orders user:123
   await cache.invalidateTags(['user:123']);
   ```

3. **Use wrap() untuk cache-aside pattern**
   ```typescript
   const value = await cache.wrap(key, resolver);
   ```

4. **Use memoize() untuk function results**
   ```typescript
   const memoized = cache.memoize(asyncFunction);
   ```

5. **Invalidate cache after mutations**
   ```typescript
   app.put('/users/:id', async (ctx) => {
     await updateUser(ctx.params.id, ctx.body);
     await cache.delete(`user:${ctx.params.id}`);
     return { success: true };
   });
   ```

### ❌ Don'ts

1. **Jangan cache sensitive data tanpa enkripsi**
   ```typescript
   // ❌ JANGAN
   await cache.set('password:123', plainPassword);
   
   // ✅ LAKUKAN
   await cache.set('password_hash:123', hashedPassword);
   ```

2. **Jangan cache data yang mutable tanpa copy**
   ```typescript
   // ❌ Risiko: object shared reference
   const obj = { count: 0 };
   await cache.set('data', obj);
   obj.count = 1; // modifies cache!
   
   // ✅ LAKUKAN: deep copy
   await cache.set('data', JSON.parse(JSON.stringify(obj)));
   ```

3. **Jangan lupa invalidate setelah update**
   ```typescript
   // ❌ JANGAN - user masih melihat old data
   await updateUserInDB(id, data);
   
   // ✅ LAKUKAN
   await updateUserInDB(id, data);
   await cache.delete(`user:${id}`);
   ```

4. **Jangan set TTL terlalu panjang untuk frequently-changing data**
   ```typescript
   // ❌ JANGAN - user count bisa stale
   await cache.set('user_count', count, { ttl: 86400_000 }); // 1 hari
   
   // ✅ LAKUKAN
   await cache.set('user_count', count, { ttl: 60_000 }); // 1 menit
   ```

---

## Advanced: Redis Store (Coming Soon)

Untuk production dengan persistent cache:

```typescript
import { RedisStore } from 'nexus/cache/redis';

const cache = new MultiTierCache([
  // L1: Fast in-memory
  {
    store: new InMemoryCacheStore('l1', 1_000),
    ttl: 30_000
  },
  // L2: Redis (persistent)
  {
    store: new RedisStore('redis://localhost:6379'),
    ttl: 3600_000
  }
]);
```

---

## Testing Cache

Lihat `demo.ts` untuk contoh lengkap testing cache dengan pembeda performance.

```bash
# Start server
npx ts-node demo.ts

# Test cache hit vs miss
curl http://localhost:3000/api/users/1           # DATABASE
curl http://localhost:3000/api/users/1           # CACHE (instant)
curl http://localhost:3000/api/users/1/no-cache # DATABASE (always)

# Invalidate cache
curl -X DELETE http://localhost:3000/api/users/1/cache
curl http://localhost:3000/api/users/1           # DATABASE (again)

# Stats
curl http://localhost:3000/api/cache/stats
```

---

## Troubleshooting

### Cache tidak bekerja?

1. **Check TTL expire**
   ```typescript
   // Pastikan TTL cukup panjang
   { ttl: 300_000 } // 5 menit
   ```

2. **Check cache key consistency**
   ```typescript
   // ❌ JANGAN - key berbeda tiap kali
   cache.wrap(`user:${Math.random()}`, resolver);
   
   // ✅ LAKUKAN - key konsisten
   cache.wrap(`user:${userId}`, resolver);
   ```

3. **Check tags untuk invalidation**
   ```typescript
   // Setup dengan tag
   await cache.set(key, value, { tags: ['users'] });
   
   // Invalidate dengan tag yang sama
   await cache.invalidateTags(['users']);
   ```

---

## Summary

| Fitur | Use Case |
|-------|----------|
| `get()` / `set()` | Manual cache management |
| `wrap()` | Cache-aside pattern otomatis |
| `memoize()` | Function result caching |
| `delete()` | Invalidate single key |
| `deletePattern()` | Invalidate by pattern |
| `invalidateTags()` | Invalidate group of related data |
| Multi-tier | L1 (fast) + L2 (large/persistent) |

Gunakan cache dengan bijak untuk meningkatkan performa aplikasi hingga 100x! 🚀

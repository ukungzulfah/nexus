# Dependency Injection

Nexus Framework menyediakan sistem **Dependency Injection (DI)** yang type-safe untuk mengelola dependencies seperti database, cache, mailer, dan service lainnya.

## Quick Start

```typescript
import { createApp } from 'nexus';

// 1. Define dependencies
const db = new Database();
const cache = new RedisCache();
const mailer = new Mailer();

// 2. Create app dan provide dependencies
const app = createApp()
  .provide({ db, cache, mailer });

// 3. Gunakan di handler - auto-injected & fully typed!
app.get('/users', async (ctx, { db, cache }) => {
    const cached = await cache.get('users');
    if (cached) return { users: cached, source: 'cache' };
    
    const users = await db.query('SELECT * FROM users');
    await cache.set('users', users);
    return { users, source: 'database' };
});
```

## API Reference

### `app.provide(dependencies)`

Register dependencies yang akan di-inject ke semua route handlers.

```typescript
interface Dependencies {
    db: Database;
    cache: CacheService;
    mailer: MailerService;
    // ... tambahkan sesuai kebutuhan
}

const app = createApp().provide<Dependencies>({
    db: new Database(),
    cache: new RedisCache(),
    mailer: new Mailer()
});
```

**Returns:** `Application` (chainable)

## Usage Patterns

### Pattern 1: Simple Function Handler

Paling simple - langsung destructure dependencies di parameter kedua:

```typescript
app.get('/users', async (ctx, { db }) => {
    const users = await db.getUsers();
    return { users };
});

app.post('/send-email', async (ctx, { mailer }) => {
    await mailer.send({
        to: ctx.body.email,
        subject: 'Welcome!',
        body: 'Thanks for signing up.'
    });
    return { sent: true };
});
```

### Pattern 2: Access All Dependencies

Jika butuh akses ke semua dependencies:

```typescript
app.post('/users', async (ctx, deps) => {
    // deps berisi semua: db, cache, mailer, dll
    const user = await deps.db.createUser(ctx.body);
    await deps.cache.invalidate('users');
    await deps.mailer.send({
        to: user.email,
        subject: 'Welcome!'
    });
    return { user };
});
```

### Pattern 3: Config Object dengan Explicit Inject

Untuk kontrol lebih detail, gunakan config object:

```typescript
app.get('/users/:id', {
    inject: ['db', 'cache'],  // Explicit specify dependencies
    handler: async (ctx, { db, cache }) => {
        const id = ctx.params.id;
        
        // Check cache first
        const cached = await cache.get(`user:${id}`);
        if (cached) return cached;
        
        // Fetch from DB
        const user = await db.getUserById(id);
        await cache.set(`user:${id}`, user, { ttl: 3600 });
        
        return { user };
    }
});
```

## Type Safety

Dependencies sepenuhnya type-safe. TypeScript akan:
- Autocomplete nama dependency
- Type-check penggunaan dependency
- Error jika dependency tidak ada

```typescript
interface AppDeps {
    db: {
        getUsers(): Promise<User[]>;
        getUserById(id: string): Promise<User>;
    };
    cache: {
        get<T>(key: string): Promise<T | null>;
        set(key: string, value: any): Promise<void>;
    };
}

const app = createApp().provide<AppDeps>({
    db: new PostgresDB(),
    cache: new Redis()
});

// ✅ TypeScript knows db.getUsers() returns Promise<User[]>
app.get('/users', async (ctx, { db }) => {
    const users = await db.getUsers();
    return { users };
});

// ❌ TypeScript error: 'unknown' does not exist on AppDeps
app.get('/test', async (ctx, { unknown }) => {
    // Error!
});
```

## Real-World Example

```typescript
import { createApp } from 'nexus';
import { z } from 'zod';

// === Services ===
class Database {
    private users = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' }
    ];
    
    async getUsers() { return this.users; }
    async getUserById(id: number) { return this.users.find(u => u.id === id); }
    async createUser(data: { name: string; email: string }) {
        const user = { id: this.users.length + 1, ...data };
        this.users.push(user);
        return user;
    }
}

class CacheService {
    private store = new Map<string, { data: any; expiry: number }>();
    
    async get<T>(key: string): Promise<T | null> {
        const item = this.store.get(key);
        if (!item || item.expiry < Date.now()) return null;
        return item.data;
    }
    
    async set(key: string, data: any, ttl = 60000) {
        this.store.set(key, { data, expiry: Date.now() + ttl });
    }
    
    async invalidate(pattern: string) {
        for (const key of this.store.keys()) {
            if (key.includes(pattern)) this.store.delete(key);
        }
    }
}

class MailerService {
    async send(opts: { to: string; subject: string; body?: string }) {
        console.log(`📧 Sending email to ${opts.to}: ${opts.subject}`);
        return true;
    }
}

// === App Setup ===
const app = createApp()
    .provide({
        db: new Database(),
        cache: new CacheService(),
        mailer: new MailerService()
    });

// === Routes ===

// GET /users - with caching
app.get('/users', async (ctx, { db, cache }) => {
    const cached = await cache.get<any[]>('users');
    if (cached) {
        return { users: cached, source: 'cache' };
    }
    
    const users = await db.getUsers();
    await cache.set('users', users);
    return { users, source: 'database' };
});

// GET /users/:id
app.get('/users/:id', async (ctx, { db }) => {
    const user = await db.getUserById(parseInt(ctx.params.id));
    if (!user) {
        return ctx.response.status(404).json({ error: 'User not found' });
    }
    return { user };
});

// POST /users - create with email notification
app.post('/users', async (ctx, { db, cache, mailer }) => {
    const user = await db.createUser(ctx.body);
    await cache.invalidate('users');
    await mailer.send({
        to: user.email,
        subject: 'Welcome!',
        body: 'Thanks for joining us.'
    });
    return { user, message: 'User created and welcome email sent' };
});

app.listen(3000);
```

## Best Practices

### 1. Define Interface untuk Dependencies

```typescript
interface AppDependencies {
    db: DatabaseService;
    cache: CacheService;
    mailer: MailerService;
    logger: LoggerService;
}

const app = createApp().provide<AppDependencies>({ ... });
```

### 2. Gunakan Factory Functions

```typescript
function createDependencies(config: Config): AppDependencies {
    return {
        db: new Database(config.database),
        cache: new Redis(config.redis),
        mailer: new Mailer(config.smtp),
        logger: new Logger(config.logging)
    };
}

const app = createApp().provide(createDependencies(config));
```

### 3. Lazy Initialization

```typescript
class LazyDatabase {
    private _connection?: Connection;
    
    async getConnection() {
        if (!this._connection) {
            this._connection = await Database.connect();
        }
        return this._connection;
    }
}
```

### 4. Testing dengan Mock Dependencies

```typescript
// test/users.test.ts
import { createApp } from 'nexus';
import { TestClient } from 'nexus/testing';

const mockDb = {
    getUsers: jest.fn().mockResolvedValue([{ id: 1, name: 'Test' }])
};

const app = createApp().provide({ db: mockDb });
app.get('/users', async (ctx, { db }) => {
    return { users: await db.getUsers() };
});

const client = new TestClient(app);

test('GET /users returns users', async () => {
    const res = await client.get('/users');
    expect(res.status).toBe(200);
    expect(mockDb.getUsers).toHaveBeenCalled();
});
```

## Comparison dengan Framework Lain

| Feature | Nexus | Express | Fastify | NestJS |
|---------|-------|---------|---------|--------|
| Built-in DI | ✅ | ❌ | ❌ | ✅ |
| Type-safe | ✅ | ❌ | Partial | ✅ |
| Zero config | ✅ | - | - | ❌ |
| Decorator-free | ✅ | - | - | ❌ |

## See Also

- [Lifecycle Hooks](./28-lifecycle-hooks.md) - Request lifecycle hooks
- [Context Store](./26-context-store.md) - State management
- [Testing](./24-testing-utilities.md) - Testing with mock dependencies

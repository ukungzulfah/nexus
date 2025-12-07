# JWT Authentication

Nexus Framework menyediakan **JWT Provider** dan **JWT Plugin** untuk autentikasi berbasis JSON Web Token yang mudah digunakan, type-safe, dan terintegrasi dengan sistem DI dan Plugin.

## Quick Start

### Menggunakan JWT Provider (Simple)

```typescript
import { createApp } from 'nexus';
import { JWTProvider } from 'nexus/security';

// 1. Create JWT Provider
const jwt = new JWTProvider({
  secret: process.env.JWT_SECRET!,
  expiresIn: '7d'
});

// 2. Inject ke app via DI
const app = createApp().provide({ jwt });

// 3. Gunakan di route handler
app.post('/api/auth/login', async (ctx, { jwt }) => {
  const { email, password } = ctx.body;
  
  // Validasi credentials...
  const user = await validateUser(email, password);
  
  // Generate token
  const token = await jwt.sign({
    id: user.id,
    email: user.email,
    roles: user.roles
  });
  
  return { success: true, token };
});

// 4. Protected route
app.get('/api/profile', async (ctx, { jwt }) => {
  const result = await jwt.verify(ctx);
  
  if (!result.valid) {
    return ctx.response.status(401).json({ 
      error: 'Unauthorized',
      message: result.error 
    });
  }
  
  return { user: result.user };
});

app.listen(3000);
```

### Menggunakan JWT Plugin (Full Featured)

```typescript
import { createApp } from 'nexus';
import { jwtPlugin } from 'nexus/security';

const app = createApp()
  .plugin(jwtPlugin, {
    secret: process.env.JWT_SECRET!,
    expiresIn: '7d',
    autoProtect: true,
    publicPaths: ['/api/auth/login', '/api/auth/register', '/health']
  });

await app.initialize();

// Login route (public)
app.post('/api/auth/login', async (ctx) => {
  const jwt = app.getPluginExports('jwt');
  const token = await jwt.sign({ id: user.id, email: user.email });
  return { token };
});

// Protected route - user otomatis ada di ctx.user
app.get('/api/profile', async (ctx) => {
  return { user: ctx.user };
});

app.listen(3000);
```

## JWT Provider API

### Configuration

```typescript
interface JWTProviderConfig {
  secret: string;           // JWT secret key (wajib)
  expiresIn?: string | number;  // Token expiry: '1h', '7d', 3600
  issuer?: string;          // Token issuer (opsional)
  audience?: string;        // Token audience (opsional)
}
```

### Methods

#### `sign(payload, options?)`

Generate JWT token dari payload.

```typescript
const token = await jwt.sign({
  id: 'user_123',
  email: 'john@example.com',
  username: 'john',
  roles: ['user', 'admin'],
  permissions: ['create:posts', 'delete:posts']
});

// Dengan custom options
const token = await jwt.sign(
  { id: user.id },
  { expiresIn: '30d' }  // Override default expiry
);
```

#### `verify(ctx, options?)`

Verify token dari request context (header/cookie/query).

```typescript
const result = await jwt.verify(ctx);

if (result.valid) {
  console.log(result.user);  // { id, email, roles, ... }
} else {
  console.log(result.error);   // 'Token expired', 'Invalid signature', etc.
  console.log(result.expired); // true jika token expired
}
```

Dengan cookie:

```typescript
const result = await jwt.verify(ctx, { cookieName: 'auth_token' });
```

#### `verifyToken(token)`

Verify token string langsung.

```typescript
const result = await jwt.verifyToken('eyJhbGciOiJIUzI1NiIs...');
```

#### `decode(token)`

Decode token tanpa verifikasi (untuk debugging).

```typescript
const payload = jwt.decode(token);
console.log(payload);
// { id: 'user_123', email: '...', iat: 1234567890, exp: 1234571490 }
```

#### `refresh(token, options?)`

Generate token baru dengan data yang sama tapi expiry baru.

```typescript
const newToken = await jwt.refresh(oldToken);

if (newToken) {
  // Token berhasil di-refresh
} else {
  // Token invalid, user harus login ulang
}
```

#### `middleware(options?)`

Get middleware untuk protect route.

```typescript
// Dengan functional routes
app.get('/protected', jwt.middleware(), async (ctx) => {
  return { user: ctx.user };
});
```

#### `hasRole(user, role)`

Check apakah user punya role tertentu.

```typescript
if (jwt.hasRole(user, 'admin')) {
  // User adalah admin
}

// Multiple roles (OR)
if (jwt.hasRole(user, ['admin', 'moderator'])) {
  // User adalah admin ATAU moderator
}
```

#### `hasPermission(user, permission)`

Check apakah user punya permission tertentu.

```typescript
if (jwt.hasPermission(user, 'delete:posts')) {
  // User bisa delete posts
}

// Multiple permissions (OR)
if (jwt.hasPermission(user, ['create:posts', 'edit:posts'])) {
  // User bisa create ATAU edit posts
}
```

## JWT Plugin API

### Plugin Configuration

```typescript
interface JWTPluginConfig {
  secret: string;              // JWT secret (wajib)
  expiresIn?: string | number; // Token expiry
  issuer?: string;             // Token issuer
  audience?: string;           // Token audience
  autoProtect?: boolean;       // Auto-protect semua route (default: false)
  publicPaths?: string[];      // Path yang tidak perlu auth
  cookieName?: string;         // Nama cookie untuk token
  onUnauthorized?: (ctx, error) => any;  // Custom unauthorized handler
}
```

### Plugin Exports

```typescript
interface JWTPluginExports {
  provider: JWTProvider;
  sign: (payload) => Promise<string>;
  verify: (ctx) => Promise<VerifyResult>;
  verifyToken: (token) => Promise<VerifyResult>;
  decode: (token) => any;
  refresh: (token) => Promise<string | null>;
  hasRole: (user, role) => boolean;
  hasPermission: (user, permission) => boolean;
  middleware: () => MiddlewareFunction;
}
```

### Akses Plugin Exports

```typescript
// Via app
const jwt = app.getPluginExports<JWTPluginExports>('jwt');
const token = await jwt.sign({ id: user.id });

// Via context (jika plugin sudah decorate)
app.get('/test', async (ctx) => {
  const result = await ctx.jwt.verify(ctx);
  return { user: result.user };
});
```

## Penggunaan dengan Class-Based Routes

```typescript
import { Route, Context } from 'nexus';
import { JWTProvider } from 'nexus/security';

// Buat JWT provider global
export const jwt = new JWTProvider({
  secret: process.env.JWT_SECRET!,
  expiresIn: '1h'
});

// Login Route
export class LoginRoute extends Route {
  pathName = '/api/auth/login';
  method = 'POST' as const;

  schema() {
    return {
      body: z.object({
        email: z.string().email(),
        password: z.string().min(6)
      })
    };
  }

  async handler(ctx: Context) {
    const { email, password } = ctx.body;
    
    // Validasi credentials...
    const user = await this.validateUser(email, password);
    
    if (!user) {
      return ctx.response.status(401).json({ 
        error: 'Invalid credentials' 
      });
    }
    
    const token = await jwt.sign({
      id: user.id,
      email: user.email,
      roles: user.roles
    });
    
    return { success: true, token };
  }
  
  private async validateUser(email: string, password: string) {
    // Implement your validation logic
  }
}

// Protected Route
export class ProfileRoute extends Route {
  pathName = '/api/user/profile';
  method = 'GET' as const;

  middlewares() {
    return [jwt.middleware()];
  }

  async handler(ctx: Context) {
    const user = (ctx as any).user;
    return { user };
  }
}

// Role-Protected Route
export class AdminRoute extends Route {
  pathName = '/api/admin/dashboard';
  method = 'GET' as const;

  middlewares() {
    return [
      jwt.middleware(),
      // Custom role check middleware
      async (ctx: Context, next: any) => {
        const user = (ctx as any).user;
        if (!jwt.hasRole(user, 'admin')) {
          return ctx.response.status(403).json({ 
            error: 'Forbidden',
            message: 'Admin access required' 
          });
        }
        return next(ctx);
      }
    ];
  }

  async handler(ctx: Context) {
    return { message: 'Welcome to admin dashboard!' };
  }
}
```

## Token Expiry Format

```typescript
// Detik
expiresIn: 3600      // 1 jam

// String format
expiresIn: '30s'     // 30 detik
expiresIn: '15m'     // 15 menit
expiresIn: '1h'      // 1 jam
expiresIn: '7d'      // 7 hari
```

## Token Extraction

JWT Provider otomatis mengekstrak token dari:

1. **Authorization Header** (prioritas pertama)
   ```
   Authorization: Bearer <token>
   ```

2. **Cookie** (jika `cookieName` di-set)
   ```
   Cookie: auth_token=<token>
   ```

3. **Query Parameter** (untuk WebSocket atau special cases)
   ```
   GET /api/profile?token=<token>
   ```

## Auto-Protect Mode (Plugin)

Dengan `autoProtect: true`, semua route otomatis dilindungi kecuali yang ada di `publicPaths`:

```typescript
app.plugin(jwtPlugin, {
  secret: process.env.JWT_SECRET!,
  autoProtect: true,
  publicPaths: [
    '/health',
    '/api/auth/login',
    '/api/auth/register',
    '/api/public/*'  // Wildcard support
  ]
});
```

## Custom Unauthorized Handler

```typescript
app.plugin(jwtPlugin, {
  secret: process.env.JWT_SECRET!,
  autoProtect: true,
  onUnauthorized: (ctx, error) => {
    // Custom response
    return ctx.response.status(401).json({
      success: false,
      error: 'Authentication Required',
      message: error,
      loginUrl: '/api/auth/login'
    });
  }
});
```

## Verify Result Type

```typescript
interface VerifyResult {
  valid: boolean;     // true jika token valid
  user: User | null;  // User data dari token
  error?: string;     // Error message jika invalid
  expired?: boolean;  // true jika token expired
}

interface User {
  id: string | number;
  email?: string;
  username?: string;
  roles?: string[];
  permissions?: string[];
}
```

## Best Practices

### 1. Gunakan Environment Variable untuk Secret

```typescript
// ❌ Jangan hardcode
const jwt = new JWTProvider({ secret: 'my-secret' });

// ✅ Gunakan env variable
const jwt = new JWTProvider({ 
  secret: process.env.JWT_SECRET! 
});
```

### 2. Secret Minimal 32 Karakter

```bash
# Generate random secret
openssl rand -base64 32
```

### 3. Gunakan Expiry yang Sesuai

```typescript
// Access token: pendek (1 jam)
const accessToken = await jwt.sign(user, { expiresIn: '1h' });

// Refresh token: panjang (7 hari)
const refreshToken = await jwt.sign(
  { id: user.id, type: 'refresh' }, 
  { expiresIn: '7d' }
);
```

### 4. Handle Token Expired

```typescript
app.get('/api/data', async (ctx, { jwt }) => {
  const result = await jwt.verify(ctx);
  
  if (!result.valid) {
    if (result.expired) {
      return ctx.response.status(401).json({
        error: 'Token Expired',
        code: 'TOKEN_EXPIRED'  // Client bisa refresh token
      });
    }
    return ctx.response.status(401).json({
      error: 'Invalid Token',
      code: 'INVALID_TOKEN'  // Client harus login ulang
    });
  }
  
  return { data: 'secret data' };
});
```

### 5. Implement Refresh Token Flow

```typescript
// Endpoint untuk refresh token
app.post('/api/auth/refresh', async (ctx, { jwt }) => {
  const { refreshToken } = ctx.body;
  
  const result = await jwt.verifyToken(refreshToken);
  
  if (!result.valid || result.user?.type !== 'refresh') {
    return ctx.response.status(401).json({ 
      error: 'Invalid refresh token' 
    });
  }
  
  // Generate new access token
  const accessToken = await jwt.sign({
    id: result.user.id,
    email: result.user.email,
    roles: result.user.roles
  }, { expiresIn: '1h' });
  
  return { accessToken };
});
```

## Testing

```typescript
import { TestClient } from 'nexus/testing';

describe('JWT Authentication', () => {
  const jwt = new JWTProvider({ secret: 'test-secret-min-32-characters!!' });
  
  test('should generate valid token', async () => {
    const token = await jwt.sign({ id: 1, email: 'test@test.com' });
    expect(token).toBeDefined();
    expect(token.split('.')).toHaveLength(3);
  });
  
  test('should verify valid token', async () => {
    const token = await jwt.sign({ id: 1, email: 'test@test.com' });
    const result = await jwt.verifyToken(token);
    
    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(1);
    expect(result.user?.email).toBe('test@test.com');
  });
  
  test('should reject expired token', async () => {
    const token = await jwt.sign(
      { id: 1 }, 
      { expiresIn: '1s' }
    );
    
    // Wait for token to expire
    await new Promise(r => setTimeout(r, 1100));
    
    const result = await jwt.verifyToken(token);
    expect(result.valid).toBe(false);
    expect(result.expired).toBe(true);
  });
  
  test('protected route should require token', async () => {
    const app = createApp().provide({ jwt });
    
    app.get('/protected', async (ctx, { jwt }) => {
      const result = await jwt.verify(ctx);
      if (!result.valid) {
        return ctx.response.status(401).json({ error: 'Unauthorized' });
      }
      return { user: result.user };
    });
    
    const client = new TestClient(app);
    
    // Without token
    const res1 = await client.get('/protected');
    expect(res1.status).toBe(401);
    
    // With valid token
    const token = await jwt.sign({ id: 1, email: 'test@test.com' });
    const res2 = await client.get('/protected', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res2.status).toBe(200);
    expect(res2.body.user.id).toBe(1);
  });
});
```

## See Also

- [Dependency Injection](./27-dependency-injection.md) - DI system untuk inject JWT Provider
- [Plugin System](./30-plugin-system.md) - Plugin system untuk JWT Plugin
- [Class-Based Routing](./19-class-based-routing.md) - Penggunaan dengan class routes
- [Middleware](./04-middleware.md) - Custom middleware

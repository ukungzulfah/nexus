# Class-Based Routing

Nexus Framework mendukung **class-based routing** yang memungkinkan kamu mengorganisir route dalam bentuk class. Pendekatan ini sangat berguna untuk:

- ✅ Memisahkan logic route ke file terpisah
- ✅ Reusability dan testability yang lebih baik
- ✅ Clean code architecture
- ✅ Dependency injection friendly
- ✅ **Lifecycle hooks** untuk kontrol penuh atas request/response

## Quick Start

### Menggunakan `Route` Abstract Class (Recommended)

Gunakan abstract class `Route` jika kamu ingin **TypeScript memaksa implementasi handler**:

```typescript
import { createApp, Route, Context } from 'nexus';
import { z } from 'zod';

// TypeScript akan ERROR kalau handler atau pathName tidak di-implement!
class UserRegister extends Route {
  pathName = '/api/users/register';

  // ✅ Optional: Hook sebelum handler
  async onBefore(ctx: Context) {
    console.log('Before handler');
    // Return value untuk skip handler
    // return { redirect: '/login' };
  }

  // ✅ Optional: Hook setelah handler sukses
  async onAfter(ctx: Context, result: any) {
    return { ...result, timestamp: Date.now() };
  }

  // ✅ Optional: Custom error handling
  async onError(ctx: Context, error: Error) {
    return { error: error.message, code: 'CUSTOM_ERROR' };
  }

  schema() {
    return {
      body: z.object({
        email: z.string().email(),
        password: z.string().min(8)
      })
    };
  }

  meta() {
    return {
      summary: 'Register new user',
      tags: ['Users']
    };
  }

  // ⚠️ WAJIB! TypeScript akan error kalau tidak ada
  async handler(ctx: Context) {
    const { email } = ctx.body;
    return { success: true, email };
  }
}

const app = createApp();
app.post(new UserRegister());
app.listen(3000);
```

### Menggunakan `RouteBase` Interface (Flexible)

Gunakan interface `RouteBase` untuk fleksibilitas (handler optional untuk file-based routing):

```typescript
import { createApp, RouteBase, Context } from 'nexus';
import { z } from 'zod';

class UserRegister implements RouteBase {
  pathName = '/api/users/register';

  async handler(ctx: Context) {
    const { email } = ctx.body;
    return { success: true, email };
  }
}

app.post(new UserRegister());
```

## Route Abstract Class (Recommended)

```typescript
abstract class Route<TContext = Context> {
  /** REQUIRED: Path route (e.g., '/api/users/:id') */
  abstract pathName: string;
  
  /** REQUIRED: Handler function - TypeScript enforced! */
  abstract handler(ctx: TContext): Promise<any> | any;
  
  /** Optional: HTTP method */
  method?: HTTPMethod | HTTPMethod[];
  
  // ─────────────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Helper: Return success response */
  protected ok<T>(data: T): { success: true } & T;
  
  /** Helper: Return error response with status code */
  protected fail(ctx: TContext, status: number, message: string, data?: any): Response;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle Hooks
  // ─────────────────────────────────────────────────────────────────────────
  
  /** Optional: Hook sebelum handler */
  onBefore?(ctx: TContext): Promise<any | void> | any | void;
  
  /** Optional: Hook setelah handler sukses */
  onAfter?(ctx: TContext, result: any): Promise<any> | any;
  
  /** Optional: Custom error handling */
  onError?(ctx: TContext, error: Error): Promise<any> | any;
  
  /** Optional: Schema validation (Zod) */
  schema?(): SchemaConfig;
  
  /** Optional: Metadata untuk Swagger/OpenAPI */
  meta?(): RouteMeta;
  
  /** Optional: Route-specific middlewares */
  middlewares?(): Middleware[];
}
```

## Helper Methods

Route abstract class menyediakan helper methods untuk response handling yang lebih clean:

### `ok(data)` - Success Response

Mengembalikan response sukses dengan `success: true`:

```typescript
class GetUser extends Route {
  pathName = '/api/users/:id';

  async handler(ctx: Context) {
    const user = await db.findUser(ctx.params.id);
    
    // ✅ Clean dan konsisten!
    return this.ok({ user });
    // Returns: { success: true, user: { id: 1, name: 'John' } }
  }
}
```

### `fail(ctx, status, message, data?)` - Error Response

Mengembalikan error response dengan status code:

```typescript
class GetUser extends Route {
  pathName = '/api/users/:id';

  async handler(ctx: Context) {
    const user = await db.findUser(ctx.params.id);
    
    if (!user) {
      // ✅ Returns 404 dengan body: { success: false, message: 'User not found' }
      return this.fail(ctx, 404, 'User not found');
    }
    
    return this.ok({ user });
  }
}

class CreateUser extends Route {
  pathName = '/api/users';

  async handler(ctx: Context) {
    const errors = validate(ctx.body);
    
    if (errors.length > 0) {
      // ✅ Returns 400 dengan body: { success: false, message: 'Validation failed', data: { errors: [...] } }
      return this.fail(ctx, 400, 'Validation failed', { errors });
    }
    
    const user = await db.createUser(ctx.body);
    return this.ok({ user });
  }
}
```

### Kombinasi dengan Lifecycle Hooks

```typescript
class ProtectedResource extends Route {
  pathName = '/api/admin/settings';

  async onBefore(ctx: Context) {
    if (!ctx.headers.authorization) {
      return this.fail(ctx, 401, 'Unauthorized');
    }
  }

  async onError(ctx: Context, error: Error) {
    return this.fail(ctx, 500, error.message);
  }

  async handler(ctx: Context) {
    const settings = await db.getSettings();
    return this.ok({ settings });
  }
}
```

## Lifecycle Hooks

### `onBefore` - Pre-handler Hook

Dijalankan **sebelum handler**. Gunakan untuk:
- Logging request
- Authentication check
- Early return / redirect

```typescript
class ProtectedRoute extends Route {
  pathName = '/api/admin/dashboard';

  async onBefore(ctx: Context) {
    // Check auth
    if (!ctx.headers.authorization) {
      // Return value = skip handler, langsung return response ini
      return { 
        error: 'Unauthorized',
        code: 401 
      };
    }
    
    // Return undefined = lanjut ke handler
  }

  async handler(ctx: Context) {
    return { data: 'Admin dashboard data' };
  }
}
```

### `onAfter` - Post-handler Hook

Dijalankan **setelah handler sukses**. Gunakan untuk:
- Transform response
- Add metadata
- Logging response

```typescript
class ApiRoute extends Route {
  pathName = '/api/users';

  async handler(ctx: Context) {
    return { users: [{ id: 1, name: 'John' }] };
  }

  async onAfter(ctx: Context, result: any) {
    // Transform response
    return {
      ...result,
      meta: {
        timestamp: Date.now(),
        version: '1.0.0'
      }
    };
  }
}
```

### `onError` - Error Handler Hook

Dijalankan **saat handler atau onBefore throw error**. Gunakan untuk:
- Custom error format
- Error logging
- Fallback response

```typescript
class SafeRoute extends Route {
  pathName = '/api/risky';

  async handler(ctx: Context) {
    throw new Error('Something went wrong!');
  }

  async onError(ctx: Context, error: Error) {
    console.error('Logged error:', error);
    
    return {
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
      timestamp: Date.now()
    };
  }
}
```

## RouteBase Interface (Legacy)

```typescript
interface RouteBase<TContext = Context> {
  /** Path route (e.g., '/api/users/:id') */
  pathName?: string;
  
  /** Optional: Schema validation (Zod) */
  schema?: () => SchemaConfig;
  
  /** Optional: Metadata untuk Swagger/OpenAPI */
  meta?: () => RouteMeta;
  
  /** Optional: Route-specific middlewares */
  middlewares?: () => Middleware[];
  
  /** Handler function (optional for file-based routing) */
  handler?: Handler<TContext>;
}
```

## Penggunaan

### 1. Basic Route

```typescript
class HealthCheck implements RouteBase {
  pathName = '/health';

  async handler(ctx: Context) {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}

app.get(new HealthCheck());
```

### 2. Route dengan Validasi

```typescript
class CreateProduct implements RouteBase {
  pathName = '/api/products';

  schema() {
    return {
      body: z.object({
        name: z.string().min(3, 'Nama minimal 3 karakter'),
        price: z.number().positive('Harga harus positif'),
        category: z.enum(['electronics', 'clothing', 'food'])
      })
    };
  }

  async handler(ctx: Context) {
    const { name, price, category } = ctx.body;
    // Save to database...
    return { id: 'prod_123', name, price, category };
  }
}

app.post(new CreateProduct());
```

### 3. Route dengan Path Parameters

```typescript
class GetUserById implements RouteBase {
  pathName = '/api/users/:id';

  schema() {
    return {
      params: z.object({
        id: z.string().uuid('ID harus valid UUID')
      })
    };
  }

  meta() {
    return {
      summary: 'Get user by ID',
      description: 'Retrieve detailed user information',
      tags: ['Users'],
      responses: {
        200: 'User found',
        404: 'User not found'
      }
    };
  }

  async handler(ctx: Context) {
    const { id } = ctx.params;
    // Fetch from database...
    return { id, name: 'John Doe', email: 'john@example.com' };
  }
}

app.get(new GetUserById());
```

### 4. Route dengan Query Parameters

```typescript
class ListProducts implements RouteBase {
  pathName = '/api/products';

  schema() {
    return {
      query: z.object({
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(10),
        category: z.string().optional(),
        search: z.string().optional()
      })
    };
  }

  meta() {
    return {
      summary: 'List products',
      description: 'Get paginated list of products with optional filters',
      tags: ['Products']
    };
  }

  async handler(ctx: Context) {
    const { page, limit, category, search } = ctx.query;
    // Fetch from database with filters...
    return {
      data: [],
      pagination: { page, limit, total: 0 }
    };
  }
}

app.get(new ListProducts());
```

### 5. Route dengan Middleware

```typescript
import { authMiddleware, rateLimitMiddleware } from './middlewares';

class DeleteUser implements RouteBase {
  pathName = '/api/users/:id';

  middlewares() {
    return [
      authMiddleware({ role: 'admin' }),
      rateLimitMiddleware({ max: 10, window: '1m' })
    ];
  }

  schema() {
    return {
      params: z.object({
        id: z.string().uuid()
      })
    };
  }

  meta() {
    return {
      summary: 'Delete user',
      tags: ['Users', 'Admin'],
      responses: {
        204: 'User deleted',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'User not found'
      }
    };
  }

  async handler(ctx: Context) {
    const { id } = ctx.params;
    // Delete from database...
    return ctx.response.status(204).text('');
  }
}

app.delete(new DeleteUser());
```

### 6. Route dengan Custom Validation Error

```typescript
class UpdateProfile implements RouteBase {
  pathName = '/api/profile';

  schema() {
    return {
      body: z.object({
        name: z.string().min(2),
        bio: z.string().max(500).optional(),
        avatar: z.string().url().optional()
      }),
      onValidationError: (errors, ctx) => ({
        statusCode: 422,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'VALIDATION_ERROR',
          message: 'Data tidak valid',
          errors: errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      })
    };
  }

  async handler(ctx: Context) {
    // Update profile...
    return { success: true };
  }
}

app.put(new UpdateProfile());
```

## Organisasi File

Rekomendasi struktur folder untuk class-based routes:

```
src/
├── routes/
│   ├── index.ts           # Export semua routes
│   ├── auth/
│   │   ├── login.ts
│   │   ├── register.ts
│   │   └── logout.ts
│   ├── users/
│   │   ├── list.ts
│   │   ├── get.ts
│   │   ├── create.ts
│   │   ├── update.ts
│   │   └── delete.ts
│   └── products/
│       ├── list.ts
│       ├── get.ts
│       └── create.ts
├── middlewares/
├── services/
└── app.ts
```

### Contoh: routes/auth/register.ts

```typescript
import { RouteBase, Context } from 'nexus';
import { z } from 'zod';
import { UserService } from '../../services/user';

export class RegisterRoute implements RouteBase {
  pathName = '/api/auth/register';
  
  private userService: UserService;

  constructor(userService?: UserService) {
    this.userService = userService || new UserService();
  }

  schema() {
    return {
      body: z.object({
        email: z.string().email(),
        username: z.string().min(3).max(20),
        password: z.string().min(8)
      })
    };
  }

  meta() {
    return {
      summary: 'Register new user',
      tags: ['Authentication'],
      responses: {
        201: 'User created',
        400: 'Invalid data',
        409: 'Email already exists'
      }
    };
  }

  async handler(ctx: Context) {
    const { email, username, password } = ctx.body;
    
    const user = await this.userService.create({ email, username, password });
    
    return ctx.response.status(201).json({
      success: true,
      user: { id: user.id, email: user.email, username: user.username }
    });
  }
}
```

### Contoh: routes/index.ts

```typescript
import { Application } from 'nexus';

// Auth routes
import { LoginRoute } from './auth/login';
import { RegisterRoute } from './auth/register';
import { LogoutRoute } from './auth/logout';

// User routes
import { ListUsersRoute } from './users/list';
import { GetUserRoute } from './users/get';
import { CreateUserRoute } from './users/create';
import { UpdateUserRoute } from './users/update';
import { DeleteUserRoute } from './users/delete';

export function registerRoutes(app: Application) {
  // Auth
  app.post(new LoginRoute());
  app.post(new RegisterRoute());
  app.post(new LogoutRoute());

  // Users
  app.get(new ListUsersRoute());
  app.get(new GetUserRoute());
  app.post(new CreateUserRoute());
  app.put(new UpdateUserRoute());
  app.delete(new DeleteUserRoute());
}
```

### Contoh: app.ts

```typescript
import { createApp, swagger, postman, playground } from 'nexus';
import { registerRoutes } from './routes';

const app = createApp({ debug: true });

// Features
app.feature(swagger());
app.feature(postman());
app.feature(playground());

// Register all routes
registerRoutes(app);

app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
```

## Perbandingan: Function vs Class-Based

### Function-Based (Inline)

```typescript
app.post('/api/users', {
  schema: {
    body: z.object({ email: z.string().email() })
  },
  handler: async (ctx) => {
    return { success: true };
  },
  meta: {
    summary: 'Create user',
    tags: ['Users']
  }
});
```

### Class-Based

```typescript
class CreateUser implements RouteBase {
  pathName = '/api/users';

  schema() {
    return { body: z.object({ email: z.string().email() }) };
  }

  meta() {
    return { summary: 'Create user', tags: ['Users'] };
  }

  async handler(ctx: Context) {
    return { success: true };
  }
}

app.post(new CreateUser());
```

## Tips & Best Practices

### 1. Gunakan Dependency Injection

```typescript
class UserController implements RouteBase {
  pathName = '/api/users';

  constructor(
    private userService: UserService,
    private logger: Logger
  ) {}

  async handler(ctx: Context) {
    this.logger.info('Fetching users');
    const users = await this.userService.findAll();
    return { users };
  }
}

// Dengan DI container
const userService = container.resolve(UserService);
const logger = container.resolve(Logger);
app.get(new UserController(userService, logger));
```

### 2. Extend Base Class untuk Shared Logic

```typescript
abstract class BaseRoute implements RouteBase {
  abstract pathName: string;
  abstract handler(ctx: Context): Promise<any>;

  // Shared validation error handler
  protected validationErrorHandler(errors: any[], ctx: Context) {
    return {
      statusCode: 422,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'VALIDATION_ERROR', errors })
    };
  }

  schema() {
    return {
      onValidationError: this.validationErrorHandler.bind(this)
    };
  }
}

class MyRoute extends BaseRoute {
  pathName = '/api/example';

  schema() {
    return {
      ...super.schema(),
      body: z.object({ name: z.string() })
    };
  }

  async handler(ctx: Context) {
    return { hello: ctx.body.name };
  }
}
```

### 3. Testing

```typescript
import { TestClient } from 'nexus';

describe('RegisterRoute', () => {
  let app: Application;
  let client: TestClient;

  beforeEach(() => {
    app = createApp();
    app.post(new RegisterRoute());
    client = new TestClient(app);
  });

  it('should register user successfully', async () => {
    const res = await client.post('/api/auth/register', {
      body: {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123'
      }
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should return validation error for invalid email', async () => {
    const res = await client.post('/api/auth/register', {
      body: {
        email: 'invalid-email',
        username: 'testuser',
        password: 'password123'
      }
    });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
```

## HTTP Methods yang Didukung

| Method | Usage |
|--------|-------|
| `app.get(route)` | GET request |
| `app.post(route)` | POST request |
| `app.put(route)` | PUT request |
| `app.patch(route)` | PATCH request |
| `app.delete(route)` | DELETE request |

## Integrasi dengan Features

Class-based routes **otomatis terintegrasi** dengan:

- 📚 **Swagger** - Dokumentasi API otomatis dari `meta()`
- 📦 **Postman** - Collection generator
- 🎮 **Playground** - Interactive API explorer
- ✅ **Validation** - Zod schema dari `schema()`

```typescript
const app = createApp();

app.feature(swagger());
app.feature(postman());
app.feature(playground());

// Routes akan muncul di Swagger, Postman, dan Playground
app.post(new RegisterRoute());
app.get(new ListUsersRoute());
```

---

**Next:** [20-testing.md](./20-testing.md) - Testing your routes

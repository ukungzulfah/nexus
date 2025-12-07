# Routing Guide

## Overview

Nexus uses a **Radix Tree** for routing, providing O(log n) lookup performance. The routing system supports static routes, dynamic parameters, and wildcards.

## Basic Routes

### Static Routes

```typescript
app.get('/about', async (ctx) => {
  return { page: 'about' };
});

app.get('/api/users', async (ctx) => {
  return { users: [] };
});
```

### HTTP Methods

```typescript
app.get('/resource', async (ctx) => {
  return { method: 'GET' };
});

app.post('/resource', async (ctx) => {
  return { method: 'POST', body: ctx.body };
});

app.put('/resource/:id', async (ctx) => {
  return { method: 'PUT', id: ctx.params.id };
});

app.patch('/resource/:id', async (ctx) => {
  return { method: 'PATCH', id: ctx.params.id };
});

app.delete('/resource/:id', async (ctx) => {
  return { method: 'DELETE', id: ctx.params.id };
});
```

## Dynamic Routes

### Single Parameter

```typescript
app.get('/users/:id', async (ctx) => {
  const userId = ctx.params.id;
  const user = await getUser(userId);
  return { user };
});
```

### Multiple Parameters

```typescript
app.get('/users/:userId/posts/:postId', async (ctx) => {
  const { userId, postId } = ctx.params;
  const post = await getPost(userId, postId);
  return { post };
});
```

### Parameter Naming

Use descriptive parameter names:

```typescript
// Good
app.get('/articles/:articleId/comments/:commentId', ...);

// Avoid
app.get('/articles/:id1/comments/:id2', ...);
```

## Wildcard Routes

Capture the remaining path with `*`:

```typescript
app.get('/files/*filepath', async (ctx) => {
  const filepath = ctx.params.filepath;
  // filepath = "docs/guide/intro.md" for /files/docs/guide/intro.md
  return { filepath };
});

app.get('/proxy/*', async (ctx) => {
  const path = ctx.params.wildcard; // default name
  return { proxiedPath: path };
});
```

## Route Priority

Routes are matched in this order:

1. **Static** - Exact matches
2. **Parameters** - Dynamic segments (`:param`)
3. **Wildcards** - Catch-all (`*`)

```typescript
app.get('/users/active', ...);      // 1. Matched first
app.get('/users/:id', ...);         // 2. Matched second
app.get('/users/*', ...);           // 3. Matched last
```

Example:
- `/users/active` → matches static route
- `/users/123` → matches parameter route
- `/users/admin/settings` → matches wildcard route

## Declarative Route Definition

Use the `route()` method for advanced configuration:

```typescript
import { z } from 'zod';

app.route({
  method: 'POST',
  path: '/api/users',
  
  // Schema validation
  schema: {
    body: z.object({
      name: z.string().min(2),
      email: z.string().email()
    })
  },
  
  // Middleware
  middlewares: [authenticate, rateLimit],
  
  // Handler
  handler: async (ctx) => {
    const user = await createUser(ctx.body);
    return { user };
  },
  
  // Metadata (for documentation)
  meta: {
    description: 'Create a new user',
    tags: ['users'],
    responses: {
      201: 'User created',
      400: 'Validation error'
    }
  }
});
```

## Route Groups

Organize routes by creating separate router modules:

### `routes/users.ts`

```typescript
import { Router } from '../nexus';

export const userRoutes = (app: Application) => {
  app.get('/users', async (ctx) => {
    return { users: await getUsers() };
  });
  
  app.get('/users/:id', async (ctx) => {
    return { user: await getUser(ctx.params.id) };
  });
  
  app.post('/users', {
    schema: { /* ... */ },
    handler: async (ctx) => { /* ... */ }
  });
};
```

### `index.ts`

```typescript
import { createApp } from './nexus';
import { userRoutes } from './routes/users';
import { postRoutes } from './routes/posts';

const app = createApp();

userRoutes(app);
postRoutes(app);

app.listen(3000);
```

## Route Prefixes

Create prefixed route groups:

```typescript
const createAPIRoutes = (app: Application, prefix: string) => {
  app.get(`${prefix}/users`, ...);
  app.get(`${prefix}/posts`, ...);
  app.get(`${prefix}/comments`, ...);
};

createAPIRoutes(app, '/api/v1');
createAPIRoutes(app, '/api/v2');
```

## Query Parameters

Access query parameters via `ctx.query`:

```typescript
// GET /search?q=nexus&page=2&limit=20
app.get('/search', async (ctx) => {
  const query = ctx.query.q;
  const page = parseInt(ctx.query.page) || 1;
  const limit = parseInt(ctx.query.limit) || 10;
  
  const results = await search(query, page, limit);
  return { results, page, limit };
});
```

### Type-Safe Query Validation

```typescript
import { z } from 'zod';

app.get('/search', {
  schema: {
    query: z.object({
      q: z.string().min(1),
      page: z.string().regex(/^\d+$/).transform(Number).default('1'),
      limit: z.string().regex(/^\d+$/).transform(Number).default('10')
    })
  },
  handler: async (ctx) => {
    // ctx.query is now typed and validated
    const { q, page, limit } = ctx.query;
    return await search(q, page, limit);
  }
});
```

## 404 Not Found

Nexus automatically returns 404 for unmatched routes:

```json
{
  "error": "Not Found"
}
```

Custom 404 handler:

```typescript
// Add a wildcard route at the end
app.get('/*', async (ctx) => {
  return ctx.response.status(404).json({
    error: 'Page not found',
    path: ctx.path
  });
});
```

## Route Introspection

Get all registered routes:

```typescript
const routes = app.getRoutes();
console.log(routes);
// [
//   { method: 'GET', path: '/users' },
//   { method: 'GET', path: '/users/:id' },
//   { method: 'POST', path: '/users' }
// ]
```

Useful for:
- Generating API documentation
- Debugging route conflicts
- Creating route lists

## Best Practices

### ✅ DO: Use RESTful conventions

```typescript
app.get('/users', ...);           // List users
app.get('/users/:id', ...);       // Get user
app.post('/users', ...);          // Create user
app.put('/users/:id', ...);       // Update user (full)
app.patch('/users/:id', ...);     // Update user (partial)
app.delete('/users/:id', ...);    // Delete user
```

### ✅ DO: Version your API

```typescript
app.get('/api/v1/users', ...);
app.get('/api/v2/users', ...);
```

### ✅ DO: Use specific routes before wildcards

```typescript
// Correct order
app.get('/admin/dashboard', ...);
app.get('/admin/*', ...);

// Wrong order - dashboard will never be reached
app.get('/admin/*', ...);
app.get('/admin/dashboard', ...);
```

### ❌ DON'T: Create ambiguous routes

```typescript
// Ambiguous - which route matches /users/123?
app.get('/users/:id', ...);
app.get('/users/:userId', ...);  // Same as above!
```

### ✅ DO: Use consistent naming

```typescript
// Good
app.get('/users/:userId', ...);
app.get('/users/:userId/posts/:postId', ...);

// Inconsistent
app.get('/users/:id', ...);
app.get('/users/:userId/posts/:pid', ...);
```

## Performance

### Route Matching

Nexus uses a **Radix Tree** for O(log n) route lookup:

```typescript
// Fast - even with 1000+ routes
app.get('/api/v1/users/:id', ...);
// Lookup time: ~0.001ms
```

### Route Compilation

Routes are compiled at startup for optimal performance:

```typescript
const app = createApp({
  enableJIT: true  // Enable JIT compilation (default)
});
```

## Advanced Patterns

### Optional Parameters

Use query parameters for optional data:

```typescript
// GET /users?role=admin&active=true
app.get('/users', async (ctx) => {
  const filters = {
    role: ctx.query.role,
    active: ctx.query.active === 'true'
  };
  return await getUsers(filters);
});
```

### File Extensions

```typescript
app.get('/download/:filename', async (ctx) => {
  const filename = ctx.params.filename;
  // filename includes extension: "document.pdf"
  return ctx.stream(createReadStream(filename));
});
```

## Next Steps

- ✅ [Schema Validation](./05-validation.md) - Validate route parameters
- 🔌 [Middleware](./04-middleware.md) - Add route-specific middleware
- 🔒 [Error Handling](./06-error-handling.md) - Handle route errors

---

[← Context API](./02-context.md) | [Middleware →](./04-middleware.md)

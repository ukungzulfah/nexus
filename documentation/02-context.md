# Context API

## Overview

The **Context** is the heart of Nexus Framework. It replaces the traditional `req` and `res` pattern with a single, unified, immutable object that contains all request and response data.

## Why Context?

### Traditional Express.js
```javascript
app.get('/user/:id', (req, res) => {
  const id = req.params.id;
  const user = getUser(id);
  res.json({ user });
});
```

### Nexus Framework
```typescript
app.get('/user/:id', async (ctx) => {
  const user = await getUser(ctx.params.id);
  return { user }; // Auto-converted to JSON
});
```

**Benefits:**
- ✅ Single source of truth
- ✅ Immutability enables better testing
- ✅ Type inference works naturally
- ✅ Easier to extend with custom properties

## Context Properties

### Request Data

#### `ctx.method`
HTTP method of the request.

```typescript
app.get('/info', async (ctx) => {
  return { method: ctx.method }; // "GET"
});
```

#### `ctx.path`
Path of the request (without query string).

```typescript
app.get('/api/users', async (ctx) => {
  return { path: ctx.path }; // "/api/users"
});
```

#### `ctx.url`
Full URL object.

```typescript
app.get('/info', async (ctx) => {
  return {
    host: ctx.url.host,
    protocol: ctx.url.protocol
  };
});
```

#### `ctx.params`
Route parameters extracted from the path.

```typescript
app.get('/users/:id/posts/:postId', async (ctx) => {
  const { id, postId } = ctx.params;
  return { userId: id, postId };
});
```

#### `ctx.query`
Query string parameters.

```typescript
// GET /search?q=nexus&limit=10
app.get('/search', async (ctx) => {
  const { q, limit } = ctx.query;
  return { query: q, limit: parseInt(limit) };
});
```

#### `ctx.body`
Parsed request body (POST, PUT, PATCH).

```typescript
app.post('/users', async (ctx) => {
  const { name, email } = ctx.body;
  return { received: { name, email } };
});
```

**Automatic parsing for:**
- `application/json`
- `application/x-www-form-urlencoded`
- `text/*`

#### `ctx.headers`
Request headers.

```typescript
app.get('/auth', async (ctx) => {
  const token = ctx.headers.authorization;
  const userAgent = ctx.headers['user-agent'];
  return { token, userAgent };
});
```

#### `ctx.cookies`
Cookie management.

```typescript
app.get('/profile', async (ctx) => {
  // Get cookie
  const sessionId = ctx.cookies.get('session');
  
  // Set cookie
  ctx.cookies.set('visited', 'true', {
    maxAge: 86400, // 1 day in seconds
    httpOnly: true,
    secure: true,
    sameSite: 'strict'
  });
  
  // Delete cookie
  ctx.cookies.delete('old-cookie');
  
  return { sessionId };
});
```

## Response Methods

### `ctx.json(data)`
Return JSON response.

```typescript
app.get('/user', async (ctx) => {
  return ctx.json({ 
    name: 'John',
    email: 'john@example.com'
  });
});

// Or simply return the object (auto-converted)
app.get('/user', async (ctx) => {
  return { name: 'John', email: 'john@example.com' };
});
```

### `ctx.html(content)`
Return HTML response.

```typescript
app.get('/page', async (ctx) => {
  return ctx.html(`
    <!DOCTYPE html>
    <html>
      <head><title>My Page</title></head>
      <body><h1>Welcome!</h1></body>
    </html>
  `);
});
```

### `ctx.text(content)`
Return plain text response.

```typescript
app.get('/robots.txt', async (ctx) => {
  return ctx.text('User-agent: *\nDisallow: /admin/');
});
```

### `ctx.redirect(url, status?)`
Redirect to another URL.

```typescript
app.get('/old-page', async (ctx) => {
  return ctx.redirect('/new-page', 301); // Permanent redirect
});

app.get('/login', async (ctx) => {
  return ctx.redirect('/auth/login'); // Default 302
});
```

### `ctx.stream(readable)`
Stream a response (for large files).

```typescript
import { createReadStream } from 'fs';

app.get('/download', async (ctx) => {
  const stream = createReadStream('./large-file.zip');
  return ctx.stream(stream);
});
```

## Response Builder

Use the response builder for custom status codes and headers:

```typescript
app.get('/custom', async (ctx) => {
  return ctx.response
    .status(201)
    .header('X-Custom-Header', 'value')
    .json({ created: true });
});
```

## Raw Node.js Objects

Access raw Node.js objects when needed:

```typescript
app.get('/raw', async (ctx) => {
  // Access raw request
  const req = ctx.raw.req;
  const contentLength = req.headers['content-length'];
  
  // Access raw response
  const res = ctx.raw.res;
  res.setHeader('X-Custom', 'value');
  
  return { contentLength };
});
```

## Custom Context Properties

Middleware can add custom properties to the context:

```typescript
// Middleware adds user
const auth = async (ctx: any, next: any) => {
  ctx.user = await authenticateUser(ctx.headers.authorization);
  return next(ctx);
};

app.get('/profile', {
  middlewares: [auth],
  handler: async (ctx: any) => {
    // ctx.user is now available
    return { user: ctx.user };
  }
});
```

For type-safe custom properties, see [Middleware Documentation](./04-middleware.md).

## Context Pooling

Nexus automatically pools context objects for performance. You don't need to do anything - it's built-in!

**Performance benefit:** ~60-80% reduction in object allocations.

```typescript
// Get pool statistics
const app = createApp();
// ... after some requests
const stats = app.getPoolStats();
console.log(stats);
// {
//   poolSize: 50,
//   maxSize: 100,
//   created: 150,
//   reused: 100,
//   hitRate: 0.67
// }
```

## Best Practices

### ✅ DO: Return data directly

```typescript
app.get('/users', async (ctx) => {
  const users = await getUsers();
  return { users };
});
```

### ❌ DON'T: Mutate the context

```typescript
// BAD - context is immutable
app.get('/bad', async (ctx) => {
  ctx.path = '/new-path'; // Won't work!
});
```

### ✅ DO: Use typed custom properties

```typescript
interface AuthContext extends Context {
  user: User;
}

const handler = async (ctx: AuthContext) => {
  return { userId: ctx.user.id }; // Type-safe!
};
```

### ✅ DO: Use cookies for session management

```typescript
app.post('/login', async (ctx) => {
  const user = await authenticate(ctx.body);
  
  ctx.cookies.set('session', user.sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 86400
  });
  
  return { success: true };
});
```

## Next Steps

- 🛤️ [Routing Guide](./03-routing.md) - Learn about routing
- 🔌 [Middleware](./04-middleware.md) - Extend context with middleware
- ✅ [Validation](./05-validation.md) - Validate context data

---

[← Getting Started](./01-getting-started.md) | [API Reference →](./09-api-reference.md)

# Getting Started with Nexus Framework

## Installation

### Prerequisites

- Node.js >= 18.0.0
- TypeScript >= 5.0.0

### Setup

1. **Clone or initialize your project**

```bash
mkdir my-nexus-app
cd my-nexus-app
npm init -y
```

2. **Install dependencies**

```bash
npm install typescript @types/node zod
npm install -D ts-node
```

3. **Configure TypeScript**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

## Your First Application

### Basic Server

Create `src/index.ts`:

```typescript
import { createApp } from './nexus';

const app = createApp();

app.get('/hello', async (ctx) => {
  return { message: 'Hello, Nexus!' };
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

### Run the Application

```bash
npx ts-node src/index.ts
```

Visit `http://localhost:3000/hello` to see your first response!

## Core Concepts

### 1. Unified Context

Unlike Express.js which uses separate `req` and `res` objects, Nexus uses a single **Context** object:

```typescript
app.get('/user', async (ctx) => {
  // Access request data
  const userId = ctx.query.id;
  const token = ctx.headers.authorization;
  
  // Return response (auto-converted to JSON)
  return { userId, authenticated: !!token };
});
```

### 2. Async-First

All handlers are async functions with **automatic error handling**:

```typescript
app.get('/user/:id', async (ctx) => {
  // Errors are automatically caught
  const user = await database.getUser(ctx.params.id);
  return { user };
});
```

No need for try-catch or `next(error)` calls!

### 3. Type Safety

Full TypeScript support with **type inference**:

```typescript
import { z } from 'zod';

app.post('/users', {
  schema: {
    body: z.object({
      name: z.string(),
      email: z.string().email()
    })
  },
  handler: async (ctx) => {
    // ctx.body is typed as { name: string, email: string }
    const user = await createUser(ctx.body);
    return { user };
  }
});
```

## HTTP Methods

Nexus supports all standard HTTP methods:

```typescript
app.get('/resource', async (ctx) => { /* ... */ });
app.post('/resource', async (ctx) => { /* ... */ });
app.put('/resource/:id', async (ctx) => { /* ... */ });
app.patch('/resource/:id', async (ctx) => { /* ... */ });
app.delete('/resource/:id', async (ctx) => { /* ... */ });
```

## Response Types

### JSON (Default)

```typescript
app.get('/data', async (ctx) => {
  return { key: 'value' }; // Auto-serialized to JSON
});
```

### HTML

```typescript
app.get('/page', async (ctx) => {
  return ctx.html('<h1>Welcome</h1>');
});
```

### Text

```typescript
app.get('/text', async (ctx) => {
  return ctx.text('Plain text response');
});
```

### Redirect

```typescript
app.get('/old', async (ctx) => {
  return ctx.redirect('/new', 301);
});
```

### Stream

```typescript
import { createReadStream } from 'fs';

app.get('/file', async (ctx) => {
  const stream = createReadStream('./large-file.dat');
  return ctx.stream(stream);
});
```

## Project Structure

Recommended structure for your application:

```
my-app/
├── src/
│   ├── index.ts           # Application entry point
│   ├── routes/            # Route handlers
│   │   ├── users.ts
│   │   └── posts.ts
│   ├── middleware/        # Custom middleware
│   │   └── auth.ts
│   └── config/            # Configuration
│       └── app.ts
├── package.json
└── tsconfig.json
```

## Next Steps

- 📖 [Context Documentation](./02-context.md) - Learn about the Context API
- 🛤️ [Routing Guide](./03-routing.md) - Advanced routing patterns
- 🔌 [Middleware System](./04-middleware.md) - Create custom middleware
- ✅ [Validation](./05-validation.md) - Schema validation with Zod
- ⚡ [Performance](./07-performance.md) - Optimization features

## Quick Reference

```typescript
import { createApp, z, logger, cors } from './nexus';

const app = createApp({
  debug: true,
  contextPoolSize: 100
});

// Global middleware
app.use(logger());
app.use(cors());

// Routes
app.get('/path', handler);
app.post('/path', { schema, handler });
app.route({ method, path, handler, middlewares, schema });

// Error handling
app.onError((error, ctx) => {
  return { statusCode: 500, body: 'Error' };
});

// Start server
app.listen(3000);
```

---

**Need help?** Check the [API Reference](./09-api-reference.md) for detailed documentation.

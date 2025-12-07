# Nexus Framework Documentation

Welcome to the comprehensive documentation for **Nexus Framework** - a modern, async-first web framework built with TypeScript, performance, and developer experience in mind.

## 📚 Documentation Structure

### Getting Started
- **[01. Getting Started](./01-getting-started.md)** - Installation, first app, and core concepts

### Core Features
- **[02. Context API](./02-context.md)** - Unified request/response context
- **[03. Routing](./03-routing.md)** - Static, dynamic, and wildcard routes
- **[04. Middleware](./04-middleware.md)** - Type-safe composable middleware
- **[05. Validation](./05-validation.md)** - Schema validation with Zod
- **[06. Error Handling](./06-error-handling.md)** - Automatic error handling

### Advanced Topics
- **[07. Performance](./07-performance.md)** - Optimization features and benchmarking
- **[08. Adapters](./08-adapters.md)** - Extensibility and plugin system

### Reference
- **[09. API Reference](./09-api-reference.md)** - Complete API documentation
- **[10. Examples](./10-examples.md)** - Real-world use cases

### Advanced Patterns
- **[24. Testing Utilities](./24-testing-utilities.md)** - Testing your API
- **[25. API Versioning](./25-api-versioning.md)** - Multiple API versions

## 🚀 Quick Links

### For Beginners
1. Start with [Getting Started](./01-getting-started.md)
2. Learn about [Context API](./02-context.md)
3. Explore [Routing](./03-routing.md)

### For Experienced Developers
1. Review [Middleware](./04-middleware.md) patterns
2. Implement [Validation](./05-validation.md)
3. Optimize with [Performance](./07-performance.md) features

### Common Tasks

| Task | Documentation |
|------|--------------|
| Create a REST API | [Examples - REST API](./10-examples.md#rest-api) |
| Add authentication | [Examples - Authentication](./10-examples.md#authentication) |
| Validate input | [Validation Guide](./05-validation.md) |
| Handle errors | [Error Handling](./06-error-handling.md) |
| Optimize performance | [Performance Guide](./07-performance.md) |
| Create plugins | [Adapters](./08-adapters.md) |
| Version your API | [API Versioning](./25-api-versioning.md) |

## 🎯 Key Features

### ✨ **Unified Context**
Single immutable object replacing `req` and `res`
```typescript
app.get('/user/:id', async (ctx) => {
  return { user: await getUser(ctx.params.id) };
});
```

### 🚀 **Async-First**
Native async/await with automatic error handling
```typescript
// No try-catch needed!
app.get('/data', async (ctx) => {
  const data = await fetchData();
  return { data };
});
```

### 🔒 **Type-Safe**
Full TypeScript support with schema validation
```typescript
app.post('/users', {
  schema: { body: z.object({ name: z.string() }) },
  handler: async (ctx) => {
    // ctx.body is typed!
    return await createUser(ctx.body);
  }
});
```

### ⚡ **High Performance**
- Context pooling reduces GC pressure by 60-80%
- Radix tree routing for O(log n) lookup
- JIT compilation for hot paths
- Zero-copy buffer handling

### 🧩 **Extensible**
Adapter pattern for plugins and custom implementations
```typescript
app.adapter('logger', new PinoLogger());
app.plugin(analyticsPlugin);
```

## 📖 Learning Path

### Beginner (< 1 hour)
1. [Getting Started](./01-getting-started.md) - 15 min
2. [Context API](./02-context.md) - 20 min
3. [Routing Basics](./03-routing.md) - 15 min

### Intermediate (1-2 hours)
4. [Middleware](./04-middleware.md) - 30 min
5. [Validation](./05-validation.md) - 30 min
6. [Error Handling](./06-error-handling.md) - 20 min

### Advanced (2+ hours)
7. [Performance](./07-performance.md) - 30 min
8. [Adapters](./08-adapters.md) - 45 min
9. Build a [complete application](./10-examples.md) - 1+ hour

## 💡 Example Application

```typescript
import { createApp, z, logger, cors } from './nexus';

const app = createApp();

// Global middleware
app.use(logger());
app.use(cors());

// Simple route
app.get('/hello', async (ctx) => {
  return { message: 'Hello, Nexus!' };
});

// Validated route
app.post('/users', {
  schema: {
    body: z.object({
      name: z.string().min(2),
      email: z.string().email()
    })
  },
  handler: async (ctx) => {
    const user = await createUser(ctx.body);
    return { user };
  }
});

// Error handling
app.onError((error, ctx) => {
  console.error(error);
  return ctx.response.status(500).json({
    error: 'Internal Server Error'
  });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

## 🔍 Search Tips

Use your browser's search (Cmd/Ctrl + F) to find specific topics across documentation files:

- Search "validation" for input validation
- Search "middleware" for middleware examples
- Search "error" for error handling
- Search "performance" for optimization
- Search "adapter" for extensibility

## 🤝 Contributing

Found an issue or want to improve the documentation? Contributions are welcome!

## 📄 License

MIT License - See LICENSE file for details

---

**Ready to build?** Start with [Getting Started →](./01-getting-started.md)

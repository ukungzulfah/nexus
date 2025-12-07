# Error Handling

## Overview

Nexus provides **automatic error handling** for all async handlers. You don't need to wrap everything in try-catch or call `next(error)` like in Express.js.

## Automatic Error Handling

### Basic Example

```typescript
app.get('/user/:id', async (ctx) => {
  // Any error thrown here is automatically caught
  const user = await database.getUser(ctx.params.id);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  return { user };
});
```

The framework catches the error and returns:

```json
{
  "error": "Internal Server Error",
  "message": "User not found"  // Only in development
}
```

## Custom Error Handler

### Global Error Handler

```typescript
app.onError((error, ctx) => {
  // Log the error
  console.error('Error:', error.message);
  console.error('Path:', ctx.path);
  console.error('Stack:', error.stack);
  
  // Return custom response
  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'Something went wrong',
      requestId: ctx.requestId
    })
  };
});
```

### Environment-Aware Errors

```typescript
app.onError((error, ctx) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return ctx.response.status(500).json({
    error: 'Internal Server Error',
    message: isDevelopment ? error.message : undefined,
    stack: isDevelopment ? error.stack : undefined,
    path: ctx.path
  });
});
```

## Custom Error Classes

### Define Custom Errors

```typescript
class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}
```

### Use Custom Errors

```typescript
app.get('/users/:id', async (ctx) => {
  const user = await database.getUser(ctx.params.id);
  
  if (!user) {
    throw new NotFoundError('User');
  }
  
  return { user };
});

app.post('/admin/users', async (ctx) => {
  if (!ctx.user?.isAdmin) {
    throw new ForbiddenError('Admin access required');
  }
  
  return await createUser(ctx.body);
});
```

### Handle Custom Errors

```typescript
app.onError((error, ctx) => {
  // Handle custom app errors
  if (error instanceof AppError) {
    return ctx.response.status(error.statusCode).json({
      error: error.message,
      statusCode: error.statusCode
    });
  }
  
  // Handle unexpected errors
  console.error('Unexpected error:', error);
  return ctx.response.status(500).json({
    error: 'Internal Server Error'
  });
});
```

## Validation Errors

Validation errors are automatically handled:

```typescript
app.post('/users', {
  schema: {
    body: z.object({
      email: z.string().email()
    })
  },
  handler: async (ctx) => {
    return await createUser(ctx.body);
  }
});

// Invalid request returns:
// {
//   "error": "Validation failed",
//   "details": [...]
// }
```

## Error Middleware

### Wrap Routes in Error Handler

```typescript
import { errorHandler } from './nexus';

const safErrorHandler = errorHandler((error, ctx) => {
  // Custom error handling
  if (error.name === 'DatabaseError') {
    return ctx.response.status(503).json({
      error: 'Service Unavailable',
      message: 'Database connection failed'
    });
  }
  
  return ctx.response.status(500).json({
    error: 'Internal Server Error'
  });
});

app.use(safeErrorHandler);
```

## Async Error Handling

### Promises

```typescript
app.get('/data', async (ctx) => {
  // Errors in promises are automatically caught
  const data = await fetchData();
  const processed = await processData(data);
  return { processed };
});
```

### Parallel Operations

```typescript
app.get('/dashboard', async (ctx) => {
  // Errors in Promise.all are caught
  const [users, posts, comments] = await Promise.all([
    getUsers(),
    getPosts(),
    getComments()
  ]);
  
  return { users, posts, comments };
});
```

## HTTP Status Codes

### Common Error Responses

```typescript
app.get('/users/:id', async (ctx) => {
  const user = await getUser(ctx.params.id);
  
  if (!user) {
    // 404 Not Found
    return ctx.response.status(404).json({
      error: 'Not Found',
      message: 'User not found'
    });
  }
  
  return { user };
});

app.post('/admin/action', async (ctx) => {
  if (!ctx.headers.authorization) {
    // 401 Unauthorized
    return ctx.response.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }
  
  if (!ctx.user.isAdmin) {
    // 403 Forbidden
    return ctx.response.status(403).json({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }
  
  return await performAction();
});
```

## Error Logging

### Structured Logging

```typescript
app.onError((error, ctx) => {
  const logData = {
    timestamp: new Date().toISOString(),
    level: 'error',
    message: error.message,
    stack: error.stack,
    context: {
      method: ctx.method,
      path: ctx.path,
      query: ctx.query,
      headers: ctx.headers,
      user: ctx.user?.id
    }
  };
  
  console.error(JSON.stringify(logData));
  
  return ctx.response.status(500).json({
    error: 'Internal Server Error'
  });
});
```

### Integration with Logging Services

```typescript
import * as Sentry from '@sentry/node';

app.onError((error, ctx) => {
  // Send to Sentry
  Sentry.captureException(error, {
    tags: {
      path: ctx.path,
      method: ctx.method
    },
    user: ctx.user ? { id: ctx.user.id } : undefined
  });
  
  return ctx.response.status(500).json({
    error: 'Internal Server Error',
    errorId: Sentry.lastEventId()
  });
});
```

## Real-World Examples

### Complete Error Handling Setup

```typescript
import { createApp } from './nexus';

// Custom errors
class AppError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Create app
const app = createApp();

// Global error handler
app.onError((error, ctx) => {
  // Log error
  console.error({
    error: error.message,
    stack: error.stack,
    path: ctx.path,
    method: ctx.method
  });
  
  // App errors (known)
  if (error instanceof AppError) {
    return ctx.response.status(error.statusCode).json({
      error: error.message,
      path: ctx.path
    });
  }
  
  // Validation errors
  if (error.name === 'ZodError') {
    return ctx.response.status(400).json({
      error: 'Validation failed',
      details: error.errors
    });
  }
  
  // Database errors
  if (error.name === 'SequelizeConnectionError') {
    return ctx.response.status(503).json({
      error: 'Service Unavailable'
    });
  }
  
  // Unknown errors
  return ctx.response.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Routes
app.get('/users/:id', async (ctx) => {
  const user = await getUser(ctx.params.id);
  if (!user) throw new AppError('User not found', 404);
  return { user };
});
```

### Database Error Handling

```typescript
app.get('/users', async (ctx) => {
  try {
    const users = await database.query('SELECT * FROM users');
    return { users };
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      throw new AppError('Database connection failed', 503);
    }
    throw error; // Re-throw for global handler
  }
});
```

## Best Practices

### ✅ DO: Use custom error classes

```typescript
throw new NotFoundError('User');
throw new ValidationError('Invalid email format');
```

### ✅ DO: Log errors properly

```typescript
app.onError((error, ctx) => {
  console.error({
    message: error.message,
    stack: error.stack,
    path: ctx.path
  });
  // Return response
});
```

### ✅ DO: Return appropriate status codes

```typescript
// 400 - Bad Request (validation)
// 401 - Unauthorized (authentication)
// 403 - Forbidden (authorization)
// 404 - Not Found
// 500 - Internal Server Error
// 503 - Service Unavailable
```

### ❌ DON'T: Expose sensitive information

```typescript
// Bad
return { error: error.stack };

// Good
return {
  error: 'Internal Server Error',
  errorId: generateErrorId()
};
```

### ✅ DO: Provide helpful error messages in development

```typescript
const message = process.env.NODE_ENV === 'development'
  ? error.message
  : 'Something went wrong';
```

## Next Steps

- ⚡ [Performance](./07-performance.md) - Optimize your application
- 🔌 [Adapters](./08-adapters.md) - Extend with adapters
- 📖 [API Reference](./09-api-reference.md) - Complete API docs

---

[← Validation](./05-validation.md) | [Performance →](./07-performance.md)

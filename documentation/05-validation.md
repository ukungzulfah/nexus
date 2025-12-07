# Schema Validation

## Overview

Nexus integrates **Zod** for type-safe schema validation. Validation happens automatically before your handler runs, with clear error responses for invalid data.

## Installation

Zod is included as a dependency:

```bash
npm install zod
```

## Basic Validation

### Body Validation

```typescript
import { z } from 'zod';

app.post('/users', {
  schema: {
    body: z.object({
      name: z.string().min(2).max(50),
      email: z.string().email(),
      age: z.number().min(18).max(120)
    })
  },
  handler: async (ctx) => {
    // ctx.body is now typed and validated
    const { name, email, age } = ctx.body;
    return { user: { name, email, age } };
  }
});
```

### Query Validation

```typescript
app.get('/search', {
  schema: {
    query: z.object({
      q: z.string().min(1),
      page: z.string().regex(/^\d+$/).transform(Number).default('1'),
      limit: z.string().regex(/^\d+$/).transform(Number).default('10')
    })
  },
  handler: async (ctx) => {
    const { q, page, limit } = ctx.query;
    return await search(q, page, limit);
  }
});
```

### Params Validation

```typescript
app.get('/users/:id', {
  schema: {
    params: z.object({
      id: z.string().uuid()
    })
  },
  handler: async (ctx) => {
    const { id } = ctx.params; // Validated UUID
    return await getUser(id);
  }
});
```

### Headers Validation

```typescript
app.post('/api/data', {
  schema: {
    headers: z.object({
      'content-type': z.literal('application/json'),
      'authorization': z.string().startsWith('Bearer ')
    })
  },
  handler: async (ctx) => {
    // Headers are validated
    return { success: true };
  }
});
```

## Validation Types

### String Validation

```typescript
const schema = z.object({
  // Basic string
  name: z.string(),
  
  // Length constraints
  username: z.string().min(3).max(20),
  
  // Email
  email: z.string().email(),
  
  // URL
  website: z.string().url(),
  
  // UUID
  id: z.string().uuid(),
  
  // Regex pattern
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  
  // Enum
  role: z.enum(['admin', 'user', 'guest']),
  
  // Transform
  slug: z.string().toLowerCase().trim()
});
```

### Number Validation

```typescript
const schema = z.object({
  // Basic number
  age: z.number(),
  
  // Range
  rating: z.number().min(1).max(5),
  
  // Integer
  count: z.number().int(),
  
  // Positive/Negative
  price: z.number().positive(),
  balance: z.number().negative().optional(),
  
  // Transform from string
  page: z.string().transform(Number)
});
```

### Boolean Validation

```typescript
const schema = z.object({
  // Basic boolean
  isActive: z.boolean(),
  
  // Transform from string
  enabled: z.string()
    .transform(val => val === 'true')
    .pipe(z.boolean())
});
```

### Array Validation

```typescript
const schema = z.object({
  // Array of strings
  tags: z.array(z.string()),
  
  // Min/Max length
  items: z.array(z.string()).min(1).max(10),
  
  // Array of objects
  users: z.array(z.object({
    id: z.string(),
    name: z.string()
  })),
  
  // Non-empty array
  categories: z.array(z.string()).nonempty()
});
```

### Object Validation

```typescript
const schema = z.object({
  // Nested object
  address: z.object({
    street: z.string(),
    city: z.string(),
    zipCode: z.string().regex(/^\d{5}$/)
  }),
  
  // Optional nested object
  billing: z.object({
    cardNumber: z.string(),
    cvv: z.string()
  }).optional()
});
```

## Optional & Default Values

### Optional Fields

```typescript
const schema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().optional(),        // Can be undefined
  phone: z.string().optional()
});
```

### Default Values

```typescript
const schema = z.object({
  page: z.number().default(1),
  limit: z.number().default(10),
  sortBy: z.string().default('createdAt')
});
```

### Nullable Fields

```typescript
const schema = z.object({
  middleName: z.string().nullable(),  // Can be null
  notes: z.string().nullish()         // Can be null or undefined
});
```

## Complex Validation

### Conditional Validation

```typescript
const schema = z.object({
  type: z.enum(['individual', 'company']),
  name: z.string(),
  
  // Conditional fields
  companyName: z.string().optional(),
  taxId: z.string().optional()
}).refine(
  data => {
    if (data.type === 'company') {
      return !!data.companyName && !!data.taxId;
    }
    return true;
  },
  {
    message: 'Company type requires companyName and taxId',
    path: ['type']
  }
);
```

### Custom Validation

```typescript
const schema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .refine(
      val => /[A-Z]/.test(val),
      'Password must contain uppercase letter'
    )
    .refine(
      val => /[0-9]/.test(val),
      'Password must contain a number'
    ),
  
  confirmPassword: z.string()
}).refine(
  data => data.password === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  }
);
```

### Async Validation

```typescript
const schema = z.object({
  email: z.string().email()
}).refine(
  async (data) => {
    const exists = await checkEmailExists(data.email);
    return !exists;
  },
  { message: 'Email already exists' }
);
```

## Error Handling

### Automatic Error Response

When validation fails, Nexus automatically returns:

```json
{
  "error": "Validation failed",
  "details": [
    {
      "code": "too_small",
      "minimum": 2,
      "type": "string",
      "inclusive": true,
      "message": "String must contain at least 2 character(s)",
      "path": ["name"]
    }
  ]
}
```

### Custom Error Messages

```typescript
const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please provide a valid email'),
  age: z.number().min(18, 'You must be at least 18 years old')
});
```

## Real-World Examples

### User Registration

```typescript
const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  
  email: z.string()
    .email('Invalid email address'),
  
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  
  confirmPassword: z.string(),
  
  acceptTerms: z.boolean()
    .refine(val => val === true, 'You must accept the terms and conditions')
}).refine(
  data => data.password === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  }
);

app.post('/auth/register', {
  schema: { body: registerSchema },
  handler: async (ctx) => {
    const user = await createUser(ctx.body);
    return { user };
  }
});
```

### Pagination & Filtering

```typescript
const listUsersSchema = {
  query: z.object({
    page: z.string()
      .regex(/^\d+$/, 'Page must be a number')
      .transform(Number)
      .pipe(z.number().min(1))
      .default('1'),
    
    limit: z.string()
      .regex(/^\d+$/, 'Limit must be a number')
      .transform(Number)
      .pipe(z.number().min(1).max(100))
      .default('10'),
    
    sortBy: z.enum(['name', 'email', 'createdAt'])
      .default('createdAt'),
    
    order: z.enum(['asc', 'desc'])
      .default('desc'),
    
    role: z.enum(['admin', 'user', 'guest'])
      .optional(),
    
    search: z.string()
      .min(3, 'Search query must be at least 3 characters')
      .optional()
  })
};

app.get('/users', {
  schema: listUsersSchema,
  handler: async (ctx) => {
    const { page, limit, sortBy, order, role, search } = ctx.query;
    const users = await getUsers({ page, limit, sortBy, order, role, search });
    return { users, page, limit };
  }
});
```

### File Upload Metadata

```typescript
const uploadSchema = z.object({
  filename: z.string()
    .regex(/^[a-zA-Z0-9_-]+\.[a-z]{2,4}$/, 'Invalid filename'),
  
  size: z.number()
    .max(10 * 1024 * 1024, 'File size must be less than 10MB'),
  
  mimeType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ], { errorMap: () => ({ message: 'Unsupported file type' }) }),
  
  description: z.string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
});
```

## Type Inference

Zod schemas provide TypeScript type inference:

```typescript
const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().optional()
});

// Infer the type
type User = z.infer<typeof userSchema>;
// { name: string; email: string; age?: number }

const createUser = (user: User) => {
  // Type-safe function
};
```

## Best Practices

### ✅ DO: Use descriptive error messages

```typescript
const schema = z.object({
  age: z.number()
    .min(18, 'You must be at least 18 years old to register')
});
```

### ✅ DO: Transform data when needed

```typescript
const schema = z.object({
  email: z.string().email().toLowerCase().trim(),
  tags: z.string().transform(val => val.split(',').map(t => t.trim()))
});
```

### ✅ DO: Reuse schemas

```typescript
const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zipCode: z.string()
});

const userSchema = z.object({
  name: z.string(),
  address: addressSchema,
  billingAddress: addressSchema.optional()
});
```

### ❌ DON'T: Over-validate

```typescript
// Too restrictive
const schema = z.object({
  name: z.string()
    .min(2).max(50)
    .regex(/^[A-Za-z\s'-]+$/)
    .transform(val => val.trim())
    .refine(val => !val.includes('  '))
});

// Better
const schema = z.object({
  name: z.string().min(2).max(50).trim()
});
```

## Next Steps

- 🔒 [Error Handling](./06-error-handling.md) - Handle validation errors
- 🔌 [Middleware](./04-middleware.md) - Validate in middleware
- 📖 [API Reference](./09-api-reference.md) - Complete API docs

---

[← Middleware](./04-middleware.md) | [Error Handling →](./06-error-handling.md)

# Common Examples

## Table of Contents

1. [REST API](#rest-api)
2. [Authentication](#authentication)
3. [File Upload](#file-upload)
4. [Real-Time Chat](#real-time-chat)
5. [API Gateway](#api-gateway)
6. [Blog Platform](#blog-platform)
7. [E-Commerce](#e-commerce)

---

## REST API

Complete RESTful API with CRUD operations:

```typescript
import { createApp, z, logger, cors } from './nexus';

const app = createApp();

app.use(logger());
app.use(cors());

// In-memory database
const users = new Map<string, User>();

// List users
app.get('/api/users', {
  schema: {
    query: z.object({
      page: z.string().transform(Number).default('1'),
      limit: z.string().transform(Number).default('10')
    })
  },
  handler: async (ctx) => {
    const { page, limit } = ctx.query;
    const allUsers = Array.from(users.values());
    const start = (page - 1) * limit;
    const paginatedUsers = allUsers.slice(start, start + limit);
    
    return {
      users: paginatedUsers,
      pagination: {
        page,
        limit,
        total: allUsers.length
      }
    };
  }
});

// Get user by ID
app.get('/api/users/:id', async (ctx) => {
  const user = users.get(ctx.params.id);
  
  if (!user) {
    return ctx.response.status(404).json({
      error: 'User not found'
    });
  }
  
  return { user };
});

// Create user
app.post('/api/users', {
  schema: {
    body: z.object({
      name: z.string().min(2),
      email: z.string().email(),
      age: z.number().min(18).optional()
    })
  },
  handler: async (ctx) => {
    const id = crypto.randomUUID();
    const user = { id, ...ctx.body, createdAt: new Date() };
    users.set(id, user);
    
    return ctx.response.status(201).json({ user });
  }
});

// Update user
app.put('/api/users/:id', {
  schema: {
    body: z.object({
      name: z.string().min(2).optional(),
      email: z.string().email().optional(),
      age: z.number().min(18).optional()
    })
  },
  handler: async (ctx) => {
    const user = users.get(ctx.params.id);
    
    if (!user) {
      return ctx.response.status(404).json({
        error: 'User not found'
      });
    }
    
    const updated = { ...user, ...ctx.body };
    users.set(ctx.params.id, updated);
    
    return { user: updated };
  }
});

// Delete user
app.delete('/api/users/:id', async (ctx) => {
  if (!users.has(ctx.params.id)) {
    return ctx.response.status(404).json({
      error: 'User not found'
    });
  }
  
  users.delete(ctx.params.id);
  return ctx.response.status(204).json({});
});

app.listen(3000);
```

---

## Authentication

JWT-based authentication system:

```typescript
import { createApp, z } from './nexus';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

const app = createApp();
const SECRET = process.env.JWT_SECRET || 'secret';
const users = new Map<string, any>();

// Register
app.post('/auth/register', {
  schema: {
    body: z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string()
    })
  },
  handler: async (ctx) => {
    const { email, password, name } = ctx.body;
    
    if (users.has(email)) {
      return ctx.response.status(400).json({
        error: 'User already exists'
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { email, password: hashedPassword, name };
    users.set(email, user);
    
    return { message: 'User registered successfully' };
  }
});

// Login
app.post('/auth/login', {
  schema: {
    body: z.object({
      email: z.string().email(),
      password: z.string()
    })
  },
  handler: async (ctx) => {
    const { email, password } = ctx.body;
    const user = users.get(email);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return ctx.response.status(401).json({
        error: 'Invalid credentials'
      });
    }
    
    const token = jwt.sign({ email }, SECRET, { expiresIn: '1h' });
    
    return { token, user: { email: user.email, name: user.name } };
  }
});

// Auth middleware
const authenticate = async (ctx: any, next: any) => {
  const token = ctx.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return ctx.response.status(401).json({
      error: 'Unauthorized'
    });
  }
  
  try {
    const decoded = jwt.verify(token, SECRET) as any;
    ctx.user = users.get(decoded.email);
    return next(ctx);
  } catch (error) {
    return ctx.response.status(401).json({
      error: 'Invalid token'
    });
  }
};

// Protected route
app.get('/profile', {
  middlewares: [authenticate],
  handler: async (ctx: any) => {
    return { user: ctx.user };
  }
});

app.listen(3000);
```

---

## File Upload

Handle file uploads with validation:

```typescript
import { createApp } from './nexus';
import multer from 'multer';
import path from 'path';

const app = createApp();

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// Upload endpoint
app.post('/upload', async (ctx) => {
  // Use multer middleware (needs integration)
  // In a real app, you'd integrate multer properly
  
  return {
    message: 'File uploaded successfully',
    file: {
      filename: 'example.jpg',
      size: 12345,
      url: '/uploads/example.jpg'
    }
  };
});

// Download endpoint
app.get('/uploads/:filename', async (ctx) => {
  const { filename } = ctx.params;
  const filepath = path.join(__dirname, 'uploads', filename);
  
  // Security: validate filename
  if (filename.includes('..')) {
    return ctx.response.status(400).json({
      error: 'Invalid filename'
    });
  }
  
  const stream = createReadStream(filepath);
  return ctx.stream(stream);
});

app.listen(3000);
```

---

## Real-Time Chat

Simple chat application (conceptual):

```typescript
import { createApp } from './nexus';

const app = createApp();

// Store messages in memory
const messages: Array<{ id: string; user: string; text: string; timestamp: Date }> = [];
const clients: Set<any> = new Set();

// Get messages
app.get('/api/messages', async (ctx) => {
  return { messages };
});

// Post message
app.post('/api/messages', {
  schema: {
    body: z.object({
      user: z.string(),
      text: z.string().min(1).max(500)
    })
  },
  handler: async (ctx) => {
    const message = {
      id: crypto.randomUUID(),
      ...ctx.body,
      timestamp: new Date()
    };
    
    messages.push(message);
    
    // Broadcast to all clients (WebSocket would be here)
    // clients.forEach(client => client.send(message));
    
    return { message };
  }
});

// Delete message
app.delete('/api/messages/:id', async (ctx) => {
  const index = messages.findIndex(m => m.id === ctx.params.id);
  
  if (index === -1) {
    return ctx.response.status(404).json({
      error: 'Message not found'
    });
  }
  
  messages.splice(index, 1);
  return ctx.response.status(204).json({});
});

app.listen(3000);
```

---

## API Gateway

Proxy requests to multiple services:

```typescript
import { createApp } from './nexus';
import fetch from 'node-fetch';

const app = createApp();

const services = {
  users: 'http://users-service:3001',
  posts: 'http://posts-service:3002',
  comments: 'http://comments-service:3003'
};

// Proxy middleware
const proxy = (service: string) => {
  return async (ctx: any) => {
    const targetUrl = `${services[service as keyof typeof services]}${ctx.path}`;
    
    const response = await fetch(targetUrl, {
      method: ctx.method,
      headers: ctx.headers as any,
      body: ctx.method !== 'GET' ? JSON.stringify(ctx.body) : undefined
    });
    
    const data = await response.json();
    return ctx.response.status(response.status).json(data);
  };
};

// Route to services
app.get('/api/users/*', proxy('users'));
app.post('/api/users/*', proxy('users'));

app.get('/api/posts/*', proxy('posts'));
app.post('/api/posts/*', proxy('posts'));

app.get('/api/comments/*', proxy('comments'));
app.post('/api/comments/*', proxy('comments'));

// Health check
app.get('/health', async (ctx) => {
  return { status: 'ok', timestamp: new Date() };
});

app.listen(3000);
```

---

## Blog Platform

Complete blog with posts and comments:

```typescript
import { createApp, z } from './nexus';

const app = createApp();

const posts = new Map<string, any>();
const comments = new Map<string, any[]>();

// List posts
app.get('/api/posts', async (ctx) => {
  return { posts: Array.from(posts.values()) };
});

// Get post
app.get('/api/posts/:id', async (ctx) => {
  const post = posts.get(ctx.params.id);
  if (!post) {
    return ctx.response.status(404).json({ error: 'Post not found' });
  }
  
  return {
    post,
    comments: comments.get(ctx.params.id) || []
  };
});

// Create post
app.post('/api/posts', {
  schema: {
    body: z.object({
      title: z.string().min(3).max(200),
      content: z.string().min(10),
      author: z.string()
    })
  },
  handler: async (ctx) => {
    const id = crypto.randomUUID();
    const post = {
      id,
      ...ctx.body,
      createdAt: new Date(),
      views: 0
    };
    
    posts.set(id, post);
    comments.set(id, []);
    
    return ctx.response.status(201).json({ post });
  }
});

// Add comment
app.post('/api/posts/:id/comments', {
  schema: {
    body: z.object({
      author: z.string(),
      text: z.string().min(1).max(1000)
    })
  },
  handler: async (ctx) => {
    if (!posts.has(ctx.params.id)) {
      return ctx.response.status(404).json({ error: 'Post not found' });
    }
    
    const comment = {
      id: crypto.randomUUID(),
      postId: ctx.params.id,
      ...ctx.body,
      createdAt: new Date()
    };
    
    const postComments = comments.get(ctx.params.id) || [];
    postComments.push(comment);
    comments.set(ctx.params.id, postComments);
    
    return { comment };
  }
});

app.listen(3000);
```

---

## E-Commerce

Product catalog with cart:

```typescript
import { createApp, z } from './nexus';

const app = createApp();

const products = new Map<string, any>();
const carts = new Map<string, any[]>();

// Seed products
products.set('1', { id: '1', name: 'Laptop', price: 999, stock: 10 });
products.set('2', { id: '2', name: 'Mouse', price: 29, stock: 50 });
products.set('3', { id: '3', name: 'Keyboard', price: 79, stock: 30 });

// List products
app.get('/api/products', async (ctx) => {
  return { products: Array.from(products.values()) };
});

// Get cart
app.get('/api/cart/:userId', async (ctx) => {
  const cart = carts.get(ctx.params.userId) || [];
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  return { cart, total };
});

// Add to cart
app.post('/api/cart/:userId', {
  schema: {
    body: z.object({
      productId: z.string(),
      quantity: z.number().min(1)
    })
  },
  handler: async (ctx) => {
    const product = products.get(ctx.body.productId);
    
    if (!product) {
      return ctx.response.status(404).json({ error: 'Product not found' });
    }
    
    if (product.stock < ctx.body.quantity) {
      return ctx.response.status(400).json({ error: 'Insufficient stock' });
    }
    
    const cart = carts.get(ctx.params.userId) || [];
    cart.push({
      ...product,
      quantity: ctx.body.quantity
    });
    carts.set(ctx.params.userId, cart);
    
    return { cart };
  }
});

// Checkout
app.post('/api/checkout/:userId', async (ctx) => {
  const cart = carts.get(ctx.params.userId) || [];
  
  if (cart.length === 0) {
    return ctx.response.status(400).json({ error: 'Cart is empty' });
  }
  
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  // Clear cart
  carts.delete(ctx.params.userId);
  
  return {
    order: {
      id: crypto.randomUUID(),
      items: cart,
      total,
      timestamp: new Date()
    }
  };
});

app.listen(3000);
```

---

[← API Reference](./09-api-reference.md)

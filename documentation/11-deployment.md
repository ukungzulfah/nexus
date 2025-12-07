# Deployment & Production Guide

Nexus Framework menyediakan fitur-fitur production-ready untuk deployment:

## Table of Contents

1. [Graceful Shutdown](#graceful-shutdown)
2. [Clustering](#clustering)
3. [Environment Configuration](#environment-configuration)
4. [Docker Support](#docker-support)

---

## Graceful Shutdown

Zero-downtime deployment dengan proper connection draining.

### Basic Usage

```typescript
import { createApp } from 'nexus';

const app = createApp();

// Enable graceful shutdown
app.gracefulShutdown({
  timeout: 30000, // Wait max 30 seconds for connections to drain
  verbose: true
});

// Add cleanup hooks
app.onShutdown('database', async () => {
  await db.close();
  console.log('Database connection closed');
}, 10); // Higher priority = runs first

app.onShutdown('cache', async () => {
  await redis.disconnect();
  console.log('Redis connection closed');
}, 5);

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Configuration Options

```typescript
app.gracefulShutdown({
  // Maximum time to wait for ongoing requests (ms)
  timeout: 30000,

  // Stop accepting new connections immediately
  stopAcceptingConnections: true,

  // Signals to listen for
  signals: ['SIGTERM', 'SIGINT'],

  // Custom health check during shutdown
  healthCheck: async () => ({
    status: 'healthy',
    details: { db: 'connected' }
  }),

  // Callbacks
  onShutdownStart: () => console.log('Shutdown starting...'),
  onShutdownComplete: () => console.log('Shutdown complete!'),

  // Enable verbose logging
  verbose: true
});
```

### Programmatic Shutdown

```typescript
// Trigger shutdown programmatically
await app.shutdown();

// Check if shutdown is in progress
if (app.isShuttingDown()) {
  console.log('Server is shutting down...');
}
```

---

## Clustering

Multi-process deployment untuk high availability dan performance.

### Basic Usage

```typescript
import { createApp, runClustered } from 'nexus';

runClustered(() => {
  const app = createApp();
  
  app.get('/', (ctx) => ({
    message: 'Hello from worker!',
    workerId: process.pid
  }));
  
  app.listen(3000);
}, {
  workers: 'auto', // Use all CPU cores
  verbose: true
});
```

### Advanced Clustering

```typescript
import { createApp, ClusterManager } from 'nexus';

const app = createApp();
const cluster = app.cluster({
  workers: 4,
  restartStrategy: 'rolling',
  restartDelay: 5000,
  maxRestarts: 10,

  onWorkerStart: (worker) => {
    console.log(`Worker ${worker.id} started`);
  },

  onWorkerExit: (worker, code, signal) => {
    console.log(`Worker ${worker.id} exited: ${code} ${signal}`);
  }
});

cluster.start(() => {
  app.get('/', (ctx) => ({ hello: 'world' }));
  app.listen(3000);
});
```

### Cluster Management

```typescript
// Check if primary process
if (cluster.isPrimary()) {
  // Primary-only logic (e.g., scheduling)
  
  // Get cluster stats
  const stats = cluster.getStats();
  console.log(`Active workers: ${stats.activeWorkers}`);
  
  // Rolling restart all workers
  await cluster.rollingRestart();
  
  // Broadcast to all workers
  cluster.broadcast({ type: 'reload-config' });
}

// In worker process
if (cluster.isWorker()) {
  process.on('message', (msg) => {
    if (msg.type === 'reload-config') {
      // Reload configuration
    }
  });
}
```

---

## Environment Configuration

Type-safe configuration dengan environment separation.

### Define Configuration

```typescript
import { defineConfig } from 'nexus';

const config = defineConfig({
  // Base configuration (all environments)
  base: {
    server: {
      port: 3000,
      host: 'localhost'
    },
    logging: {
      level: 'info'
    }
  },

  // Development overrides
  development: {
    logging: {
      level: 'debug',
      format: 'pretty'
    }
  },

  // Production overrides
  production: {
    server: {
      host: '0.0.0.0',
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000
    },
    logging: {
      level: 'info',
      format: 'json'
    },
    security: {
      headers: 'strict'
    }
  },

  // Test overrides
  test: {
    database: {
      url: ':memory:'
    }
  }
});

// Use configuration
const port = config.get('server.port');
const dbUrl = config.get('database.url');

if (config.isProduction()) {
  // Production-specific logic
}
```

### Environment Variables

```bash
# .env file
APP_SERVER_PORT=8080
APP_DATABASE_URL=postgres://localhost/mydb
APP_LOGGING_LEVEL=debug
```

```typescript
import { env, requireEnv } from 'nexus';

// Get env with default
const port = env('PORT', 3000);

// Require env (throws if not set)
const secret = requireEnv('JWT_SECRET');
```

### Configuration Files

```
project/
├── .env                 # Base environment variables
├── .env.development     # Development-specific
├── .env.production      # Production-specific
├── .env.local           # Local overrides (not committed)
└── .env.example         # Template for required vars
```

---

## Docker Support

Generate optimized Docker configurations.

### Generate Docker Files

```typescript
import { generateDockerFiles } from 'nexus';

// Generate with default options
generateDockerFiles();

// Generate with custom options
generateDockerFiles('.', {
  baseImage: 'node:20-alpine',
  port: 3000,
  healthCheck: true,
  healthEndpoint: '/__nexus/health',
  nonRootUser: true,
  multiStage: true
});
```

### Generated Files

```
project/
├── Dockerfile           # Multi-stage optimized build
├── .dockerignore        # Optimized ignore patterns
├── docker-compose.yml   # Production compose file
└── docker-compose.dev.yml # Development compose file
```

### Generated Dockerfile

```dockerfile
# ============================================
# Base Stage
# ============================================
FROM node:20-alpine AS base
WORKDIR /app

# ============================================
# Dependencies Stage
# ============================================
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# ============================================
# Build Stage
# ============================================
FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ============================================
# Production Stage
# ============================================
FROM base AS production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nexus

ENV NODE_ENV=production

COPY --from=deps --chown=nexus:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nexus:nodejs /app/dist ./dist
COPY --from=build --chown=nexus:nodejs /app/package.json ./

USER nexus

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

### Docker Commands

```bash
# Build image
docker build -t myapp .

# Run container
docker run -p 3000:3000 myapp

# Using docker-compose
docker-compose up -d

# Development with hot-reload
docker-compose -f docker-compose.dev.yml up
```

### Custom Docker Configuration

```typescript
import { createDocker } from 'nexus';

const docker = createDocker({
  baseImage: 'node:20-alpine',
  port: 8080,
  entrypoint: 'dist/server.js',
  env: {
    TZ: 'UTC',
    NODE_OPTIONS: '--max-old-space-size=512'
  },
  labels: {
    'app.version': '1.0.0',
    'app.maintainer': 'team@example.com'
  }
});

// Generate individual files
const dockerfile = docker.generateDockerfile();
const dockerignore = docker.generateDockerignore();
const compose = docker.generateComposeFile({
  services: {
    redis: {
      image: 'redis:alpine',
      ports: ['6379:6379']
    }
  }
});
```

---

## Complete Production Setup

```typescript
import { 
  createApp, 
  defineConfig, 
  runClustered,
  generateDockerFiles 
} from 'nexus';

// Configuration
const config = defineConfig({
  base: {
    server: { port: 3000 }
  },
  production: {
    server: { port: parseInt(process.env.PORT || '3000') },
    security: { headers: 'strict' }
  }
});

// Generate Docker files (run once during setup)
if (process.argv.includes('--docker')) {
  generateDockerFiles('.', { port: config.get('server.port') });
  process.exit(0);
}

// Run with clustering in production
runClustered(() => {
  const app = createApp({ debug: config.isDevelopment() });

  // Enable graceful shutdown
  app.gracefulShutdown({
    timeout: 30000,
    verbose: config.isDevelopment()
  });

  // Add shutdown hooks
  app.onShutdown('database', async () => {
    await db.close();
  });

  // Enable observability
  app.observe({
    metrics: { enabled: true },
    health: {
      endpoint: '/__nexus/health',
      checks: [
        { name: 'database', check: async () => ({ status: 'up' }) }
      ]
    }
  });

  // Routes
  app.get('/', (ctx) => ({ status: 'ok' }));

  // Start server
  app.start({
    port: config.get('server.port'),
    host: '0.0.0.0'
  });

  console.log(`Worker ${process.pid} listening on port ${config.get('server.port')}`);

}, {
  workers: config.isProduction() ? 'auto' : 1,
  verbose: config.isDevelopment()
});
```

---

## Best Practices

1. **Always use graceful shutdown** in production
2. **Use clustering** to utilize all CPU cores
3. **Separate configuration** by environment
4. **Use multi-stage Docker builds** for smaller images
5. **Run as non-root user** in containers
6. **Include health checks** for orchestration platforms
7. **Set proper timeouts** for connection draining
8. **Add shutdown hooks** for cleanup (DB, Redis, etc.)

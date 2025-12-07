# Nexus Framework - Package Structure

Nexus Framework mendukung tree-shaking dan optional imports melalui subpath exports.

## Quick Start

```typescript
// Full framework (includes all features)
import { Application, Router, createApp } from '@engjts/server';

// Core only (minimal, no optional deps)
import { Application, Router, createApp } from '@engjts/server/core';
```

## Available Subpath Imports

### Core (No Optional Dependencies)
```typescript
import { 
    Application, 
    createApp, 
    Router,
    MiddlewareExecutor,
    ContextStore,
    RequestStore,
    // Plugin System
    definePlugin,
    createPlugin,
    PluginManager
} from '@engjts/server/core';
```

### Database
```typescript
import { 
    Database, 
    QueryBuilder, 
    Schema, 
    Migration 
} from '@engjts/server/database';
```

### GraphQL (requires `graphql` peer dependency)
```typescript
// npm install graphql
import { 
    GraphQLServer, 
    SimpleDataLoader 
} from '@engjts/server/graphql';
```

### Cache
```typescript
import { 
    MultiTierCache, 
    InMemoryCacheStore,
    RedisCacheStore  // requires ioredis
} from '@engjts/server/cache';
```

### Jobs (Background Processing)
```typescript
import { 
    JobQueue, 
    InMemoryQueueStore,
    RedisQueueStore  // requires ioredis
} from '@engjts/server/jobs';
```

### Sentry (Error Tracking & APM)
```typescript
import { 
    SentryClient, 
    initSentry, 
    captureException 
} from '@engjts/server/sentry';
```

### Realtime (WebSocket) (requires `ws` peer dependency)
```typescript
// npm install ws
import { 
    WebSocketGateway 
} from '@engjts/server/realtime';
```

### Testing
```typescript
import { 
    TestClient, 
    Factory, 
    MockFn, 
    MockDatabase,
    NexusTestRunner 
} from '@engjts/server/testing';
```

### Security
```typescript
import { 
    RateLimiter, 
    CSRFProtection, 
    JWTAuth,
    SecurityHeaders 
} from '@engjts/server/security';
```

### Deployment
```typescript
import { 
    GracefulShutdownManager, 
    ClusterManager, 
    ConfigManager,
    DockerGenerator 
} from '@engjts/server/deployment';
```

### API Documentation

```typescript
// Swagger
import { swagger, SwaggerGenerator } from '@engjts/server/swagger';

// Postman
import { postman } from '@engjts/server/postman';

// Playground
import { playground } from '@engjts/server/playground';
```

## Peer Dependencies

These dependencies are optional and only needed if you use specific features:

| Package | Required For |
|---------|-------------|
| `graphql` | GraphQL module |
| `ws` | WebSocket/Realtime module |
| `ioredis` | Redis cache & job queue stores |

## Installation Examples

### Minimal (Core Only)
```bash
npm install @engjts/server
```

### With GraphQL
```bash
npm install @engjts/server graphql
```

### With WebSocket
```bash
npm install @engjts/server ws
```

### With Redis Support
```bash
npm install @engjts/server ioredis
```

### Full Installation (All Optional Features)
```bash
npm install @engjts/server graphql ws ioredis
```

## Bundle Size Optimization

By using subpath imports, you can significantly reduce bundle size:

```typescript
// ❌ Imports everything (larger bundle)
import { Application, GraphQLServer, WebSocketGateway } from '@engjts/server';

// ✅ Tree-shakeable imports (smaller bundle)
import { Application } from '@engjts/server/core';
import { GraphQLServer } from '@engjts/server/graphql';
import { WebSocketGateway } from '@engjts/server/realtime';
```

## Migration from Single Import

If you were previously using:
```typescript
import { Application, Database, GraphQLServer } from '@engjts/server';
```

You can either:
1. Keep using it (backwards compatible)
2. Or switch to subpath imports for better tree-shaking:
```typescript
import { Application } from '@engjts/server/core';
import { Database } from '@engjts/server/database';
import { GraphQLServer } from '@engjts/server/graphql';
```

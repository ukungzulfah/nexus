# Plugin System

Nexus Framework mendukung plugin system yang powerful untuk extensibility. Plugin memungkinkan Anda untuk:

- Menambahkan middleware secara modular
- Menambahkan routes
- Mendekorasi context dengan properties baru
- Berbagi API antar plugin
- Lifecycle hooks yang terstruktur

## Quick Start

```typescript
import { createApp, definePlugin, createPlugin } from '@engjts/server';

// Simple plugin
const myPlugin = createPlugin({
    name: 'my-plugin',
    register: (ctx) => {
        ctx.log.info('Hello from my plugin!');
    }
});

const app = createApp()
    .plugin(myPlugin);

await app.initialize();
app.listen(3000);
```

## Creating Plugins

### Method 1: `createPlugin()` - Quick & Simple

```typescript
import { createPlugin } from '@engjts/server';

const loggerPlugin = createPlugin({
    name: 'logger',
    version: '1.0.0',
    
    register: (ctx) => {
        ctx.app.use(async (reqCtx, next) => {
            console.log(`${reqCtx.method} ${reqCtx.path}`);
            return next(reqCtx);
        });
    }
});
```

### Method 2: `definePlugin()` - Fluent Builder (Recommended)

```typescript
import { definePlugin } from '@engjts/server';

interface MyConfig {
    apiKey: string;
    timeout?: number;
}

const myPlugin = definePlugin('my-plugin')
    .version('1.0.0')
    .description('My awesome plugin')
    .author('Your Name')
    .tags('utility', 'awesome')
    .priority('high')
    
    // Type-safe configuration
    .config<MyConfig>()
    .defaults({ timeout: 5000 })
    .validate((config) => {
        if (!config.apiKey) return 'API key is required';
        return true;
    })
    
    // Lifecycle hooks
    .configure((ctx) => {
        // Early setup, before other plugins
    })
    .register((ctx) => {
        // Main registration logic
    })
    .boot((ctx) => {
        // After all plugins registered
    })
    .ready((ctx) => {
        // Server is listening
    })
    .shutdown((ctx) => {
        // Cleanup on shutdown
    })
    
    .build();
```

## Plugin Lifecycle

Plugins go through these phases in order:

```
configure → register → boot → ready → shutdown
```

| Phase | Description | Use Case |
|-------|-------------|----------|
| `configure` | Early setup, before anything else | Set up configuration, environment |
| `register` | Main registration | Add routes, middleware, stores |
| `boot` | After all plugins registered | Connect to databases, external services |
| `ready` | Server is listening | Log startup info, notify services |
| `shutdown` | App is shutting down | Cleanup, close connections |

## Plugin Features

### Adding Middleware

```typescript
definePlugin('auth')
    .middleware((ctx) => {
        return async (reqCtx, next) => {
            // Auth logic using ctx.config
            const token = reqCtx.headers.authorization;
            reqCtx.user = await verifyToken(token, ctx.config.secret);
            return next(reqCtx);
        };
    })
    .build();
```

### Adding Routes

```typescript
definePlugin('api')
    .routes((ctx) => [
        {
            method: 'GET',
            path: '/api/status',
            handler: async (reqCtx) => ({ status: 'ok' }),
            meta: { tags: ['System'] }
        },
        {
            method: 'POST',
            path: '/api/webhook',
            handler: async (reqCtx) => {
                // Handle webhook
                return { received: true };
            }
        }
    ])
    .build();
```

### Decorating Context

```typescript
definePlugin('auth')
    .decorate((ctx) => {
        ctx.auth = {
            user: null,
            isAuthenticated: false,
            hasRole: (role: string) => false
        };
    })
    .build();

// Now in any route:
app.get('/profile', async (ctx) => {
    if (!ctx.auth.isAuthenticated) {
        return ctx.response.status(401).json({ error: 'Login required' });
    }
    return { user: ctx.auth.user };
});
```

### Exporting APIs

Plugins can export APIs for other plugins to use:

```typescript
interface AuthExports {
    verify: (token: string) => Promise<User | null>;
    sign: (user: User) => string;
}

const authPlugin = definePlugin('auth')
    .export<AuthExports>((ctx) => ({
        verify: async (token) => {
            // Verify logic
        },
        sign: (user) => {
            // Sign logic
        }
    }))
    .build();
```

Using exports from another plugin:

```typescript
const userPlugin = definePlugin('user')
    .depends(['auth'])  // Declare dependency
    .register((ctx) => {
        const auth = ctx.getPlugin<AuthExports>('auth');
        
        // Use auth API
        const token = auth.sign({ id: 1, name: 'John' });
    })
    .build();
```

### Plugin Dependencies

```typescript
definePlugin('user-service')
    // Required dependencies (will fail if not installed)
    .depends(['auth', 'database'])
    
    // Optional dependencies (won't fail if missing)
    .optionalDeps(['cache', 'metrics'])
    
    // Conflicting plugins (can't be installed together)
    .conflicts(['legacy-auth'])
    
    .register((ctx) => {
        // Check for optional dependency
        if (ctx.hasPlugin('cache')) {
            const cache = ctx.getPlugin('cache');
            // Use cache
        }
    })
    .build();
```

### Plugin Storage

Each plugin has isolated storage that persists across lifecycle phases:

```typescript
definePlugin('rate-limiter')
    .configure((ctx) => {
        ctx.storage.set('requests', new Map());
    })
    
    .middleware((ctx) => {
        return async (reqCtx, next) => {
            const requests = ctx.storage.get('requests');
            const ip = reqCtx.headers['x-forwarded-for'] || 'unknown';
            
            const count = requests.get(ip) || 0;
            if (count > 100) {
                return reqCtx.response.status(429).json({ error: 'Too many requests' });
            }
            
            requests.set(ip, count + 1);
            return next(reqCtx);
        };
    })
    
    .export((ctx) => ({
        getStats: () => {
            const requests = ctx.storage.get('requests');
            return { uniqueIPs: requests.size };
        }
    }))
    .build();
```

## Using Plugins in Application

```typescript
const app = createApp({ debug: true });

// Register plugins with configuration
app
    .plugin(loggerPlugin)
    .plugin(authPlugin, { 
        secret: process.env.JWT_SECRET!,
        expiry: 3600 
    })
    .plugin(userPlugin);

// Initialize all plugins (configure → register → boot)
await app.initialize();

// Add routes
app.get('/health', async () => ({ status: 'ok' }));

// Start server (triggers ready phase)
app.listen(3000, () => {
    console.log('Server running');
});

// Graceful shutdown (triggers shutdown phase)
process.on('SIGTERM', async () => {
    await app.shutdown();
});
```

## Plugin Manager API

```typescript
const pm = app.getPluginManager();

// Check if plugin exists
if (pm.has('auth')) {
    // Get plugin exports
    const auth = pm.getExports<AuthExports>('auth');
    auth.verify(token);
}

// Get plugin metadata
const meta = pm.getMeta('auth');
console.log(meta?.version);

// Get all plugins
const plugins = pm.getAll();
plugins.forEach(p => console.log(p.meta.name, p.state));

// Listen to events
pm.on('plugin:ready', (meta) => {
    console.log(`Plugin ${meta.name} is ready`);
});

pm.on('plugin:error', (meta, error) => {
    console.error(`Plugin ${meta.name} failed:`, error);
});
```

## Plugin Priority

Plugins can declare priority to control loading order:

```typescript
definePlugin('critical-plugin')
    .priority('critical')  // Loads first
    .build();

definePlugin('normal-plugin')
    .priority('normal')    // Default
    .build();

definePlugin('lazy-plugin')
    .priority('low')       // Loads last
    .build();
```

Priority levels: `critical` → `high` → `normal` → `low`

## Best Practices

1. **Use dependencies** - Declare what your plugin needs
2. **Validate config** - Fail fast with clear error messages
3. **Use lifecycle hooks** - Put logic in the right phase
4. **Export APIs** - Make functionality available to other plugins
5. **Handle shutdown** - Clean up resources properly
6. **Log appropriately** - Use `ctx.log` for scoped logging
7. **Type your exports** - Use TypeScript generics

## TypeScript Support

Full TypeScript support with generic types:

```typescript
interface MyConfig {
    apiKey: string;
    baseUrl: string;
}

interface MyExports {
    fetch: (endpoint: string) => Promise<any>;
}

const myPlugin = definePlugin('my-plugin')
    .config<MyConfig>()
    .export<MyExports>((ctx) => ({
        fetch: async (endpoint) => {
            const response = await fetch(ctx.config.baseUrl + endpoint, {
                headers: { 'X-API-Key': ctx.config.apiKey }
            });
            return response.json();
        }
    }))
    .build();

// Type-safe usage
const exports = app.getPluginExports<MyExports>('my-plugin');
const data = await exports?.fetch('/users');
```

## Migration from Legacy Plugin

If you have existing plugins using the old format:

```typescript
// Old format (still supported)
const legacyPlugin = {
    name: 'legacy',
    version: '1.0.0',
    install: (app) => {
        app.use(myMiddleware);
    }
};

// New format (recommended)
const modernPlugin = definePlugin('modern')
    .version('1.0.0')
    .register((ctx) => {
        ctx.app.use(myMiddleware);
    })
    .build();

// Both work
app.plugin(legacyPlugin);
app.plugin(modernPlugin);
```

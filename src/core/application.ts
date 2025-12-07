/**
 * Main application class
 * Orchestrates all framework components
 */

import { createServer, Server as HTTPServer, IncomingMessage, ServerResponse } from 'http';
import { Router } from './router';
import { ContextPool } from './context-pool';
import { MiddlewareExecutor } from './middleware';
import {
    Context,
    Handler,
    Middleware,
    Response,
    AppConfig,
    ErrorHandler,
    RouteConfig,
    Plugin,
    HTTPMethod,
    RouteBase,
    Route,
    VersioningConfig,
    VersioningStrategy,
    DependencyContainer,
    InjectedRouteConfig,
    LifecycleHooks
} from './types';
import { AdapterRegistry } from './adapter';
import { PluginManager, NexusPlugin, SimplePlugin } from './plugin';
import { FileRouter, FileRouterOptions } from './router/file-router';
import { createObservabilityMiddleware } from '../advanced/observability/createObservabilityMiddleware';
import { ObservabilityCenter } from '../advanced/observability/ObservabilityCenter';
import {
    GracefulShutdownManager,
    GracefulShutdownOptions,
    ClusterManager,
    ClusterOptions
} from '../deployment';
import {
    WebSocketGateway,
    WebSocketRouteConfig
} from '../advanced/realtime/websocket';
import { ObservabilityOptions } from '../advanced/observability/types';
import { StoreRegistry, StoreConstructor, ContextStore } from './store';

/**
 * Default error handler
 */
const defaultErrorHandler: ErrorHandler = (error: Error, ctx: Context): Response => {
    // Only log unexpected errors, not intentional ones (returned from handler)
    if (!(error as any)._isIntentional) {
        console.error('Unhandled error:', error);
        console.error('Path:', ctx.path, 'Method:', ctx.method);
    }

    return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            error: error.message || 'Internal Server Error',
            stack: process.env.NODE_ENV === 'development' && !(error as any)._isIntentional ? error.stack : undefined
        })
    };
};

/**
 * Application class
 */
export class Application<TDeps extends DependencyContainer = {}> {
    private router: Router;
    private contextPool: ContextPool;
    private middlewareExecutor: MiddlewareExecutor;
    private globalMiddlewares: Middleware[] = [];
    private errorHandler: ErrorHandler;
    private server?: HTTPServer;
    private config: AppConfig;
    private adapters: AdapterRegistry;
    private shutdownManager?: GracefulShutdownManager;
    private clusterManager?: ClusterManager;
    private fallbackHandler?: Handler;
    private wsGateway?: WebSocketGateway;
    
    // Dependency injection container
    private dependencies: TDeps = {} as TDeps;
    
    // Versioning properties
    private versioningConfig?: VersioningConfig;
    private registeredVersions: Set<string> = new Set();
    
    // Store registry for ContextStore system
    private storeRegistry: StoreRegistry;
    
    // Plugin manager for advanced plugins
    private pluginManager: PluginManager;
    
    // Lifecycle hooks
    private lifecycleHooks: LifecycleHooks = {};

    constructor(config: AppConfig = {}) {
        this.config = {
            contextPoolSize: 100,
            enableJIT: true,
            debug: false,
            logRequests: true,
            ...config
        };

        this.router = new Router();
        this.contextPool = new ContextPool(this.config.contextPoolSize);
        this.middlewareExecutor = new MiddlewareExecutor();
        this.errorHandler = config.onError || defaultErrorHandler;
        this.adapters = new AdapterRegistry();
        this.storeRegistry = new StoreRegistry({ debug: config.debug });
        this.pluginManager = new PluginManager(this, { debug: config.debug });
    }

    /**
     * Register lifecycle hooks for request processing
     * Hooks are called at specific points during request lifecycle
     * 
     * @example
     * ```typescript
     * app.hooks({
     *   onRequest: async (ctx) => {
     *     ctx.requestId = crypto.randomUUID();
     *     console.log(`[${ctx.requestId}] ${ctx.method} ${ctx.path}`);
     *   },
     *   
     *   beforeValidation: async (ctx) => {
     *     // Transform raw body before validation
     *     if (ctx.body?.data) {
     *       ctx.body = ctx.body.data;
     *     }
     *   },
     *   
     *   afterValidation: async (ctx) => {
     *     // Check authorization after body is validated
     *     if (!ctx.headers.authorization) {
     *       return ctx.response.status(401).json({ error: 'Unauthorized' });
     *     }
     *   },
     *   
     *   beforeHandler: async (ctx) => {
     *     // Load user from session
     *     ctx.user = await getUserFromToken(ctx.headers.authorization);
     *   },
     *   
     *   afterHandler: async (ctx, result) => {
     *     // Add metadata to all responses
     *     return { ...result, timestamp: Date.now(), requestId: ctx.requestId };
     *   },
     *   
     *   onError: async (ctx, error) => {
     *     // Log errors to external service
     *     await logToSentry(error, { requestId: ctx.requestId });
     *   },
     *   
     *   onResponse: async (ctx, response) => {
     *     console.log(`[${ctx.requestId}] Response: ${response.statusCode}`);
     *   }
     * });
     * ```
     */
    hooks(hooks: LifecycleHooks): this {
        this.lifecycleHooks = { ...this.lifecycleHooks, ...hooks };
        return this;
    }

    /**
     * Set a fallback handler for unmatched routes (e.g., static files)
     * Called before returning 404
     */
    setFallbackHandler(handler: Handler): this {
        this.fallbackHandler = handler;
        return this;
    }

    /**
     * Provide dependencies for injection into route handlers
     * Dependencies are available via the second parameter in handlers
     * 
     * @example
     * ```typescript
     * const db = new Database();
     * const cache = new Redis();
     * const mailer = new Mailer();
     * 
     * const app = createApp()
     *   .provide({ db, cache, mailer });
     * 
     * // Use with inject option
     * app.get('/users', {
     *   inject: ['db', 'cache'],
     *   handler: async (ctx, { db, cache }) => {
     *     // db and cache are fully typed!
     *     const users = await db.query('SELECT * FROM users');
     *     await cache.set('users', users);
     *     return { users };
     *   }
     * });
     * 
     * // Or access all dependencies
     * app.get('/mail', async (ctx, deps) => {
     *   await deps.mailer.send({ to: 'user@example.com', subject: 'Hello' });
     *   return { sent: true };
     * });
     * ```
     */
    provide<T extends DependencyContainer>(deps: T): Application<TDeps & T> {
        this.dependencies = { ...this.dependencies, ...deps } as TDeps & T;
        return this as unknown as Application<TDeps & T>;
    }

    /**
     * Get a specific dependency by name
     * 
     * @example
     * ```typescript
     * const db = app.getDep('db');
     * ```
     */
    getDep<K extends keyof TDeps>(name: K): TDeps[K] {
        return this.dependencies[name];
    }

    /**
     * Get all registered dependencies
     */
    getDeps(): TDeps {
        return this.dependencies;
    }

    /**
     * Configure API versioning
     * 
     * @example
     * ```typescript
     * app.configVersions({
     *   strategies: ['header', 'query'],
     *   header: 'api-version',
     *   queryParam: 'v',
     *   defaultVersion: 'v1',
     *   register: ['v1', 'v2']
     * });
     * 
     * // Route tanpa prefix → otomatis jadi /{defaultVersion}/login
     * app.post('/login', handler);
     * 
     * // Route dengan prefix explicit
     * app.post('/v2/login', handler);
     * ```
     */
    configVersions(config: VersioningConfig): this {
        this.versioningConfig = {
            header: 'api-version',
            queryParam: 'v',
            ...config
        };
        
        // Register all versions
        config.register.forEach(v => this.registeredVersions.add(v));
        
        return this;
    }

    /**
     * Check if a path starts with a registered version prefix
     */
    private hasVersionPrefix(path: string): string | null {
        const segment = path.split('/').filter(Boolean)[0];
        if (segment && this.registeredVersions.has(segment)) {
            return segment;
        }
        return null;
    }

    /**
     * Resolve version from request context
     */
    private resolveVersion(ctx: Context): { version: string; basePath: string; source: VersioningStrategy | 'default' } {
        if (!this.versioningConfig) {
            return { version: '', basePath: ctx.path, source: 'default' };
        }

        const { strategies, header, queryParam, defaultVersion } = this.versioningConfig;

        // 1. Check path strategy: /v1/login
        if (strategies.includes('path')) {
            const versionPrefix = this.hasVersionPrefix(ctx.path);
            if (versionPrefix) {
                const basePath = ctx.path.replace(new RegExp(`^/${versionPrefix}`), '') || '/';
                return { version: versionPrefix, basePath, source: 'path' };
            }
        }

        // 2. Check header strategy
        if (strategies.includes('header') && header) {
            const headerValue = ctx.headers[header] || ctx.headers[header.toLowerCase()];
            const version = Array.isArray(headerValue) ? headerValue[0] : headerValue;
            if (version && this.registeredVersions.has(version)) {
                return { version, basePath: ctx.path, source: 'header' };
            }
        }

        // 3. Check query strategy
        if (strategies.includes('query') && queryParam) {
            const queryVersion = ctx.query?.[queryParam];
            const version = Array.isArray(queryVersion) ? queryVersion[0] : queryVersion;
            if (version && this.registeredVersions.has(version)) {
                return { version, basePath: ctx.path, source: 'query' };
            }
        }

        // 4. Default version
        return { version: defaultVersion, basePath: ctx.path, source: 'default' };
    }

    /**
     * Build versioned path for route registration
     */
    private buildVersionedPath(path: string): string {
        if (!this.versioningConfig) return path;
        
        // If path already has version prefix, return as-is
        if (this.hasVersionPrefix(path)) {
            return path;
        }
        
        // Add default version prefix
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        return `/${this.versioningConfig.defaultVersion}${normalizedPath}`;
    }

    /**
     * Add global middleware or mount a router
     * 
     * @example
     * ```typescript
     * // Add middleware
     * app.use(loggerMiddleware);
     * app.use(corsMiddleware);
     * 
     * // Mount router
     * const routes = new Router();
     * routes.get('/users', getUsers);
     * app.use(routes);
     * 
     * // Mount router with prefix
     * app.use('/api', routes);
     * ```
     */
    use(middlewareOrRouter: Middleware | Router): this;
    use(prefix: string, router: Router): this;
    use(middlewareOrPrefixOrRouter: Middleware | Router | string, router?: Router): this {
        // app.use('/api', router)
        if (typeof middlewareOrPrefixOrRouter === 'string' && router) {
            this.mountRouter(middlewareOrPrefixOrRouter, router);
            return this;
        }

        // app.use(router)
        if (middlewareOrPrefixOrRouter instanceof Router) {
            this.mountRouter('', middlewareOrPrefixOrRouter);
            return this;
        }

        // app.use(middleware)
        this.globalMiddlewares.push(middlewareOrPrefixOrRouter as Middleware);
        return this;
    }

    /**
     * Mount a router's routes into the application
     */
    private mountRouter(prefix: string, router: Router): void {
        const routes = router.getRawRoutes();
        for (const route of routes) {
            const fullPath = prefix ? `${prefix}${route.path}` : route.path;
            this.router.addRoute({
                method: route.method,
                path: fullPath,
                handler: route.config.handler,
                middlewares: route.config.middlewares,
                schema: route.config.schema,
                meta: route.config.meta
            });
        }
    }

    /**
     * Register ContextStore classes
     * Stores are singleton instances accessible via ctx.store(StoreClass)
     * 
     * @example
     * ```typescript
     * class UserStore extends ContextStore<UserState> {
     *   protected initial() { return { users: [], loading: false }; }
     *   
     *   async fetchUsers() {
     *     this.update({ loading: true });
     *     const users = await api.getUsers();
     *     this.set({ users, loading: false });
     *   }
     * }
     * 
     * const app = createApp();
     * app.stores([UserStore, ProductStore]);
     * 
     * app.get('/users', async (ctx) => {
     *   const userStore = ctx.store(UserStore);
     *   return { users: userStore.state.users };
     * });
     * ```
     */
    stores(storeClasses: StoreConstructor<any>[]): this {
        this.storeRegistry.registerAll(storeClasses);
        return this;
    }

    /**
     * Register a single ContextStore class
     * 
     * @example
     * ```typescript
     * app.store(UserStore);
     * ```
     */
    store<T extends ContextStore<any>>(StoreClass: StoreConstructor<T>): this {
        this.storeRegistry.register(StoreClass);
        return this;
    }

    /**
     * Get a store instance directly from application level
     * Useful for accessing stores outside of request context
     * 
     * @example
     * ```typescript
     * const userStore = app.getStore(UserStore);
     * userStore.listen((state) => console.log('Users updated:', state));
     * ```
     */
    getStore<T extends ContextStore<any>>(StoreClass: StoreConstructor<T>): T {
        return this.storeRegistry.get(StoreClass);
    }

    /**
     * Get the store registry for advanced usage
     */
    getStoreRegistry(): StoreRegistry {
        return this.storeRegistry;
    }

    /**
     * Register a route
     */
    route(config: RouteConfig): this {
        this.router.addRoute(config);
        return this;
    }

    /**
     * Convenience: GET route
     * Supports both function-style and class-based routing
     * 
     * @example
     * ```typescript
     * // Function style (with dependencies)
     * app.get('/users', async (ctx, { db }) => ({ users: await db.getUsers() }));
     * 
     * // Config style with inject
     * app.get('/users', { 
     *   inject: ['db', 'cache'],
     *   handler: async (ctx, { db, cache }) => ({ users: [] }), 
     *   meta: {...} 
     * });
     * 
     * // Class-based style
     * app.get(new UserListRoute());
     * ```
     */
    get<K extends keyof TDeps = keyof TDeps>(
        pathOrRoute: string | Route, 
        handlerOrConfig?: Handler<Context, TDeps> | InjectedRouteConfig<Context, TDeps, K>
    ): this {
        // Class-based routing
        if (typeof pathOrRoute === 'object' && ('pathName' in pathOrRoute || 'handler' in pathOrRoute)) {
            return this.registerClassRoute('GET', pathOrRoute as Route);
        }
        
        return this.registerVersionedRoute('GET', pathOrRoute as string, handlerOrConfig);
    }

    /**
     * Convenience: POST route
     * Supports both function-style and class-based routing
     */
    post<K extends keyof TDeps = keyof TDeps>(
        pathOrRoute: string | Route, 
        handlerOrConfig?: Handler<Context, TDeps> | InjectedRouteConfig<Context, TDeps, K>
    ): this {
        // Class-based routing
        if (typeof pathOrRoute === 'object' && ('pathName' in pathOrRoute || 'handler' in pathOrRoute)) {
            return this.registerClassRoute('POST', pathOrRoute as Route);
        }
        
        return this.registerVersionedRoute('POST', pathOrRoute as string, handlerOrConfig);
    }

    /**
     * Convenience: PUT route
     * Supports both function-style and class-based routing
     */
    put<K extends keyof TDeps = keyof TDeps>(
        pathOrRoute: string | Route, 
        handlerOrConfig?: Handler<Context, TDeps> | InjectedRouteConfig<Context, TDeps, K>
    ): this {
        // Class-based routing
        if (typeof pathOrRoute === 'object' && ('pathName' in pathOrRoute || 'handler' in pathOrRoute)) {
            return this.registerClassRoute('PUT', pathOrRoute as Route);
        }
        
        return this.registerVersionedRoute('PUT', pathOrRoute as string, handlerOrConfig);
    }

    /**
     * Convenience: DELETE route
     * Supports both function-style and class-based routing
     */
    delete<K extends keyof TDeps = keyof TDeps>(
        pathOrRoute: string | Route, 
        handlerOrConfig?: Handler<Context, TDeps> | InjectedRouteConfig<Context, TDeps, K>
    ): this {
        // Class-based routing
        if (typeof pathOrRoute === 'object' && ('pathName' in pathOrRoute || 'handler' in pathOrRoute)) {
            return this.registerClassRoute('DELETE', pathOrRoute as Route);
        }
        
        return this.registerVersionedRoute('DELETE', pathOrRoute as string, handlerOrConfig);
    }

    /**
     * Convenience: PATCH route
     * Supports both function-style and class-based routing
     */
    patch<K extends keyof TDeps = keyof TDeps>(
        pathOrRoute: string | Route, 
        handlerOrConfig?: Handler<Context, TDeps> | InjectedRouteConfig<Context, TDeps, K>
    ): this {
        // Class-based routing
        if (typeof pathOrRoute === 'object' && ('pathName' in pathOrRoute || 'handler' in pathOrRoute)) {
            return this.registerClassRoute('PATCH', pathOrRoute as Route);
        }
        
        return this.registerVersionedRoute('PATCH', pathOrRoute as string, handlerOrConfig);
    }

    /**
     * Register a versioned route (internal)
     */
    private registerVersionedRoute<K extends keyof TDeps>(
        method: HTTPMethod, 
        path: string, 
        handlerOrConfig?: Handler<Context, TDeps> | InjectedRouteConfig<Context, TDeps, K>
    ): this {
        // Build versioned path if versioning is configured
        const versionedPath = this.buildVersionedPath(path);
        
        if (typeof handlerOrConfig === 'function') {
            // Function handler - wrap to inject all dependencies
            const originalHandler = handlerOrConfig;
            const deps = this.dependencies;
            const wrappedHandler: Handler = async (ctx) => originalHandler(ctx, deps);
            this.router.addRoute({ method, path: versionedPath, handler: wrappedHandler });
        } else if (handlerOrConfig) {
            // Config object with possible inject option
            const config = handlerOrConfig as InjectedRouteConfig<Context, TDeps, K>;
            const originalHandler = config.handler;
            const allDeps = this.dependencies;
            const injectKeys = config.inject;
            
            // Create wrapped handler that injects dependencies
            const wrappedHandler: Handler = async (ctx) => {
                let injectedDeps: any;
                if (injectKeys && injectKeys.length > 0) {
                    // Only inject specified dependencies
                    injectedDeps = {} as Pick<TDeps, K>;
                    for (const key of injectKeys) {
                        (injectedDeps as any)[key] = allDeps[key];
                    }
                } else {
                    // Inject all dependencies
                    injectedDeps = allDeps;
                }
                return originalHandler(ctx, injectedDeps);
            };
            
            this.router.addRoute({ 
                method, 
                path: versionedPath, 
                handler: wrappedHandler,
                middlewares: config.middlewares,
                schema: config.schema,
                meta: config.meta
            });
        }
        return this;
    }

    /**
     * Register a class-based route with lifecycle hooks support and dependency injection
     */
    private registerClassRoute(method: HTTPMethod, route: Route): this {
        // ⚠️ ENFORCE: Route class MUST extend Route abstract class
        if (!(route instanceof Route)) {
            const className = (route as any).constructor?.name || 'Unknown';
            throw new Error(
                `Route class "${className}" must extend the Route abstract class.\n` +
                `Example:\n` +
                `  import { Route } from 'nexus';\n` +
                `  class ${className} extends Route {\n` +
                `    pathName = '/your/path';\n` +
                `    async handler(ctx) { ... }\n` +
                `  }`
            );
        }

        if (!route.pathName) {
            throw new Error(
                `Route class must have a pathName property when using manual registration. ` +
                `Use app.useFileRoutes() for file-based routing without pathName.`
            );
        }
        
        // Determine the handler - either the handler method or the method-specific handler
        let originalHandler = route.handler;
        if (!originalHandler && typeof (route as any)[method] === 'function') {
            originalHandler = (route as any)[method].bind(route);
        }
        
        if (!originalHandler) {
            throw new Error(
                `Route class must have a handler method or a ${method} method.`
            );
        }

        // Wrap handler with lifecycle hooks if route extends Route class
        const routeInstance = route as Route;
        const hasHooks = typeof routeInstance.onBefore === 'function' || 
                         typeof routeInstance.onAfter === 'function' || 
                         typeof routeInstance.onError === 'function';

        // Capture dependencies for injection
        const deps = this.dependencies;
        let finalHandler: Handler;

        if (hasHooks) {
            const boundOriginalHandler = originalHandler.bind(route);
            const onBefore = routeInstance.onBefore?.bind(route);
            const onAfter = routeInstance.onAfter?.bind(route);
            const onError = routeInstance.onError?.bind(route);

            finalHandler = async (ctx: Context) => {
                try {
                    // Run onBefore hook (with deps)
                    if (onBefore) {
                        const beforeResult = await onBefore(ctx, deps);
                        // If onBefore returns a value (not undefined), skip handler
                        if (beforeResult !== undefined) {
                            return beforeResult;
                        }
                    }

                    // Run the main handler with dependencies
                    let result = await boundOriginalHandler(ctx, deps);

                    // Run onAfter hook (with deps)
                    if (onAfter) {
                        result = await onAfter(ctx, result, deps);
                    }

                    return result;
                } catch (error) {
                    // Run onError hook if defined (with deps)
                    if (onError) {
                        return await onError(ctx, error as Error, deps);
                    }
                    // Re-throw if no onError handler
                    throw error;
                }
            };
        } else {
            // No hooks - just wrap with dependency injection
            const boundHandler = originalHandler.bind(route);
            finalHandler = async (ctx: Context) => boundHandler(ctx, deps);
        }
        
        const config: RouteConfig = {
            method,
            path: route.pathName,
            handler: finalHandler,
            schema: route.schema?.(),
            meta: route.meta?.(),
            middlewares: route.middlewares?.()
        };
        this.router.addRoute(config);
        return this;
    }

    /**
     * Register a WebSocket route
     * 
     * @example
     * ```typescript
     * app.ws('/ws/chat', {
     *   auth: async (ctx) => validateToken(ctx.query.token),
     *   onConnect: async (socket, ctx) => {
     *     console.log('User connected:', ctx.user);
     *   },
     *   onMessage: async (socket, message, ctx) => {
     *     socket.send(JSON.stringify({ echo: message }));
     *   },
     *   onClose: async (socket, ctx) => {
     *     console.log('User disconnected');
     *   }
     * });
     * ```
     */
    ws(path: string, config: WebSocketRouteConfig): this {
        if (!this.wsGateway) {
            this.wsGateway = new WebSocketGateway();
        }
        this.wsGateway.register(path, config);
        return this;
    }

    /**
     * Get the WebSocket gateway for advanced usage (rooms, broadcast, etc.)
     * 
     * @example
     * ```typescript
     * const ws = app.getWebSocket();
     * ws.broadcast('room-name', { type: 'notification', message: 'Hello!' });
     * ws.joinRoom('room-name', socket);
     * ```
     */
    getWebSocket(): WebSocketGateway | undefined {
        return this.wsGateway;
    }

    /**
     * Use file-based routing (Next.js style)
     * 
     * Automatically scans a directory and registers routes based on file/folder structure.
     * Supports dynamic parameters [id], catch-all [...slug], and nested routes.
     * 
     * @example
     * ```typescript
     * // Folder structure:
     * // routes/
     * //   api/
     * //     users/
     * //       index.ts         → GET/POST /api/users
     * //       [id]/
     * //         index.ts       → GET/PUT/DELETE /api/users/:id
     * //         posts.ts       → GET /api/users/:id/posts
     * 
     * const app = createApp();
     * 
     * await app.useFileRoutes({
     *   dir: './src/routes',
     *   prefix: '',
     *   debug: true
     * });
     * 
     * app.listen(3000);
     * ```
     * 
     * Route file format (function-style):
     * ```typescript
     * // routes/api/users/index.ts
     * import { Context } from '@engjts/nexus';
     * 
     * export async function GET(ctx: Context) {
     *   return ctx.json({ users: [] });
     * }
     * 
     * export async function POST(ctx: Context) {
     *   const body = ctx.body;
     *   return ctx.json({ created: body }, 201);
     * }
     * 
     * export const schema = { body: z.object({ name: z.string() }) };
     * export const meta = { summary: 'User endpoints', tags: ['Users'] };
     * ```
     * 
     * Route file format (class-style):
     * ```typescript
     * // routes/api/users/[id]/index.ts
     * import { RouteBase, Context } from '@engjts/nexus';
     * 
     * export default class UserRoute implements RouteBase {
     *   method = ['GET', 'PUT', 'DELETE'] as const;
     *   
     *   async GET(ctx: Context) {
     *     return ctx.json({ user: { id: ctx.params.id } });
     *   }
     *   
     *   async PUT(ctx: Context) {
     *     return ctx.json({ updated: true });
     *   }
     *   
     *   async DELETE(ctx: Context) {
     *     return ctx.json({ deleted: true });
     *   }
     * }
     * ```
     */
    async useFileRoutes(options: FileRouterOptions): Promise<this> {
        const router = new FileRouter(options);
        await router.register(this);
        return this;
    }

    /**
     * Set custom error handler
     */
    onError(handler: ErrorHandler): this {
        this.errorHandler = handler;
        return this;
    }

    /**
     * Install a plugin (supports both legacy and new plugin formats)
     * 
     * @example
     * ```typescript
     * // Legacy plugin
     * app.plugin({ name: 'my-plugin', version: '1.0.0', install: (app) => {} });
     * 
     * // New advanced plugin
     * const authPlugin = definePlugin('auth')
     *   .version('1.0.0')
     *   .config<{ secret: string }>()
     *   .register(ctx => ctx.app.use(jwtMiddleware))
     *   .build();
     * 
     * app.plugin(authPlugin, { secret: 'my-secret' });
     * ```
     */
    plugin<TConfig = any>(
        plugin: Plugin | NexusPlugin<TConfig> | SimplePlugin,
        config?: TConfig
    ): this {
        // Check if it's a legacy Plugin with install method directly on app
        if ('install' in plugin && !('meta' in plugin)) {
            // Legacy format - call install directly
            (plugin as Plugin).install(this);
        } else {
            // New plugin format - use PluginManager
            this.pluginManager.add(plugin as NexusPlugin<TConfig>, config);
        }
        return this;
    }

    /**
     * Get the plugin manager for advanced plugin operations
     * 
     * @example
     * ```typescript
     * const pm = app.getPluginManager();
     * 
     * // Check if plugin exists
     * if (pm.has('auth-plugin')) {
     *   const authApi = pm.getExports<AuthAPI>('auth-plugin');
     *   authApi.verify(token);
     * }
     * 
     * // Listen to plugin events
     * pm.on('plugin:ready', (meta) => {
     *   console.log(`Plugin ${meta.name} is ready`);
     * });
     * ```
     */
    getPluginManager(): PluginManager {
        return this.pluginManager;
    }

    /**
     * Get exports from a specific plugin
     * Shorthand for getPluginManager().getExports()
     */
    getPluginExports<T = any>(pluginName: string): T | undefined {
        return this.pluginManager.getExports<T>(pluginName);
    }

    /**
     * Check if a plugin is installed
     */
    hasPlugin(name: string): boolean {
        return this.pluginManager.has(name);
    }

    /**
     * Register an adapter
     */
    adapter<T>(name: string, adapter: T): this {
        this.adapters.register(name, adapter);
        return this;
    }

    /**
     * Enable built-in observability (metrics, tracing, health checks)
     * with safe, configurable endpoints.
     */
    observe(options: ObservabilityOptions = {}): this {
        const center = new ObservabilityCenter(options);

        // Attach middleware for metrics/tracing/logging
        this.use(createObservabilityMiddleware(center, options));

        const existingRoutes = this.router.getRoutes();

        // Metrics endpoint (default: /__nexus/metrics)
        const metricsEnabled = options.metrics?.enabled ?? true;
        if (metricsEnabled) {
            const metricsPath = options.metrics?.endpoint ?? '/__nexus/metrics';
            this.ensureNoRouteConflict('GET', metricsPath, existingRoutes);
            this.get(metricsPath, async (ctx) => center.metricsHandler()(ctx));
        }

        // Health endpoint (default: /__nexus/health)
        if (options.health) {
            const healthPath = options.health.endpoint ?? '/__nexus/health';
            this.ensureNoRouteConflict('GET', healthPath, existingRoutes);
            this.get(healthPath, async (ctx) => center.healthHandler()(ctx));
        }

        return this;
    }

    private ensureNoRouteConflict(method: HTTPMethod, path: string, routes: Array<{ method: string; path: string }>) {
        const conflict = routes.some(r => r.method === method && r.path === path);
        if (conflict) {
            throw new Error(
                `Observability endpoint conflict for ${method} ${path}. ` +
                'Silakan override endpoint melalui konfigurasi observability (metrics.endpoint / health.endpoint).'
            );
        }
    }

    /**
     * Get an adapter
     */
    getAdapter<T>(name: string): T | undefined {
        return this.adapters.get<T>(name);
    }

    /**
     * Initialize all plugins (must be called before listen/start)
     * This runs: configure → register → boot lifecycle phases
     * 
     * @example
     * ```typescript
     * const app = createApp()
     *   .plugin(authPlugin, { secret: 'xxx' })
     *   .plugin(dbPlugin, { url: 'postgres://...' });
     * 
     * // Initialize all plugins
     * await app.initialize();
     * 
     * // Start the server
     * app.listen(3000);
     * ```
     */
    async initialize(): Promise<this> {
        await this.pluginManager.initialize();
        return this;
    }

    /**
     * Start the HTTP server
     */
    listen(port: number | string, callback?: () => void): HTTPServer {
        const portNumber = typeof port === 'string' ? parseInt(port, 10) : port;
        
        this.server = createServer(async (req, res) => {
            await this.handleRequest(req, res);
        });

        // Attach graceful shutdown if enabled
        if (this.shutdownManager) {
            this.shutdownManager.attach(this.server);
        }

        // Attach WebSocket gateway if any ws routes registered
        if (this.wsGateway) {
            this.wsGateway.attach(this.server);
        }

        this.server.listen(portNumber, () => {
            // Notify plugins that server is ready
            this.pluginManager.notifyReady().catch(err => {
                console.error('[PluginManager] Error in ready phase:', err);
            });
            callback?.();
        });
        return this.server;
    }

    /**
     * Start the server (alias for listen with modern options)
     */
    start(options: { port: number | string; host?: string; callback?: () => void } | number | string): HTTPServer {
        if (typeof options === 'number' || typeof options === 'string') {
            return this.listen(options);
        }

        const portNumber = typeof options.port === 'string' ? parseInt(options.port, 10) : options.port;

        this.server = createServer(async (req, res) => {
            await this.handleRequest(req, res);
        });

        // Attach graceful shutdown if enabled
        if (this.shutdownManager) {
            this.shutdownManager.attach(this.server);
        }

        // Attach WebSocket gateway if any ws routes registered
        if (this.wsGateway) {
            this.wsGateway.attach(this.server);
        }

        const { host = '0.0.0.0', callback } = options;
        this.server.listen(portNumber, host, () => {
            // Notify plugins that server is ready
            this.pluginManager.notifyReady().catch(err => {
                console.error('[PluginManager] Error in ready phase:', err);
            });
            callback?.();
        });
        return this.server;
    }

    /**
     * Handle incoming HTTP request
     */
    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        let ctx: Context | null = null;
        let response: Response | null = null;

        try {
            // Acquire context from pool
            ctx = await this.contextPool.acquire(req, res);

            // Inject store registry into context
            if ('setStoreRegistry' in ctx && typeof ctx.setStoreRegistry === 'function') {
                (ctx as any).setStoreRegistry(this.storeRegistry);
            }
            
            // Set debug mode for request stores
            if ('setDebugMode' in ctx && typeof ctx.setDebugMode === 'function') {
                (ctx as any).setDebugMode(this.config.debug ?? false);
            }

            // === HOOK: onRequest ===
            if (this.lifecycleHooks.onRequest) {
                const hookResult = await this.lifecycleHooks.onRequest(ctx);
                if (this.isResponse(hookResult)) {
                    await this.sendResponse(res, hookResult, ctx);
                    return;
                }
            }

            // Apply versioning if configured
            let matchPath = ctx.path;
            if (this.versioningConfig) {
                const { version, basePath, source } = this.resolveVersion(ctx);
                ctx.version = version;
                ctx.versionSource = source;
                
                // For header/query strategy, rewrite path to versioned path
                if (source === 'header' || source === 'query' || source === 'default') {
                    matchPath = `/${version}${basePath.startsWith('/') ? basePath : '/' + basePath}`;
                }
                
                if (this.config.debug) {
                    console.log(`[Versioning] ${source} → ${version}, path: ${ctx.path} → ${matchPath}`);
                }
            }

            // Find matching route
            const match = this.router.match(ctx.method, matchPath);

            if (!match) {
                // Try fallback handler (e.g., static files)
                if (this.fallbackHandler) {
                    const fallbackResponse = await this.fallbackHandler(ctx, this.dependencies);
                    await this.sendResponse(res, fallbackResponse, ctx);
                    return;
                }

                // 404 Not Found
                await this.sendResponse(res, {
                    statusCode: 404,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ error: 'Not Found' })
                }, ctx);
                return;
            }

            // Set route params
            if ('setParams' in ctx && typeof ctx.setParams === 'function') {
                ctx.setParams(match.params);
            } else {
                ctx.params = match.params;
            }

            // Combine global and route-specific middleware
            const allMiddlewares = [...this.globalMiddlewares, ...match.middlewares];

            // Execute middleware chain and handler with hooks
            response = await this.middlewareExecutor.executeWithHooks(
                ctx,
                allMiddlewares,
                match.handler,
                this.lifecycleHooks,
                this.dependencies
            );

            // === HOOK: onResponse ===
            if (this.lifecycleHooks.onResponse) {
                const hookResult = await this.lifecycleHooks.onResponse(ctx, response);
                if (this.isResponse(hookResult)) {
                    response = hookResult;
                }
            }

            // Send response
            await this.sendResponse(res, response, ctx);

        } catch (error) {
            // === HOOK: onError ===
            if (ctx && this.lifecycleHooks.onError) {
                try {
                    const hookResult = await this.lifecycleHooks.onError(ctx, error as Error);
                    if (this.isResponse(hookResult)) {
                        await this.sendResponse(res, hookResult, ctx);
                        return;
                    }
                } catch (hookError) {
                    // Hook itself threw an error, continue to default error handler
                    console.error('onError hook failed:', hookError);
                }
            }

            // Handle errors with default error handler
            try {
                const errorResponse = await this.errorHandler(error as Error, ctx!);
                
                // === HOOK: onResponse (for error responses) ===
                if (ctx && this.lifecycleHooks.onResponse) {
                    const hookResult = await this.lifecycleHooks.onResponse(ctx, errorResponse);
                    if (this.isResponse(hookResult)) {
                        await this.sendResponse(res, hookResult, ctx);
                        return;
                    }
                }
                
                await this.sendResponse(res, errorResponse, ctx!);
            } catch (handlerError) {
                // Fallback error response
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
        } finally {
            // Dispose request-scoped stores
            if (ctx && 'disposeRequestStores' in ctx && typeof ctx.disposeRequestStores === 'function') {
                (ctx as any).disposeRequestStores();
            }
            
            // Release context back to pool
            if (ctx) {
                this.contextPool.release(ctx);
            }
        }
    }
    
    /**
     * Check if value is a Response object
     */
    private isResponse(value: any): value is Response {
        return (
            value &&
            typeof value === 'object' &&
            'statusCode' in value &&
            'headers' in value &&
            'body' in value
        );
    }

    /**
     * Send HTTP response
     */
    private async sendResponse(res: ServerResponse, response: Response, ctx: Context): Promise<void> {
        // Set status code
        res.statusCode = response.statusCode;

        // Set headers
        for (const [key, value] of Object.entries(response.headers)) {
            if (value !== undefined) {
                res.setHeader(key, value);
            }
        }

        // Set cookies
        if ('getSetCookieHeaders' in ctx && typeof ctx.getSetCookieHeaders === 'function') {
            const setCookies = ctx.getSetCookieHeaders();
            if (setCookies.length > 0) {
                res.setHeader('Set-Cookie', setCookies);
            }
        }

        // Send body or stream
        if (response.stream) {
            response.stream.pipe(res);
        } else {
            res.end(response.body);
        }
    }

    /**
     * Get all registered routes
     */
    getRoutes() {
        return this.router.getRoutes();
    }

    /**
     * Get context pool statistics
     */
    getPoolStats() {
        return this.contextPool.getStats();
    }

    /**
     * Close the server
     */
    close(callback?: (err?: Error) => void): void {
        if (this.server) {
            this.server.close(callback);
        }
    }

    /**
     * Enable graceful shutdown for zero-downtime deployments
     */
    gracefulShutdown(options: GracefulShutdownOptions = {}): this {
        this.shutdownManager = new GracefulShutdownManager({
            verbose: this.config.debug,
            ...options
        });
        return this;
    }

    /**
     * Add a shutdown hook (e.g., closing database connections)
     */
    onShutdown(name: string, handler: () => Promise<void>, priority?: number): this {
        if (!this.shutdownManager) {
            this.gracefulShutdown();
        }
        this.shutdownManager!.addHook({ name, handler, priority });
        return this;
    }

    /**
     * Initiate graceful shutdown programmatically
     */
    async shutdown(): Promise<void> {
        // Shutdown all plugins first
        await this.pluginManager.shutdown();
        
        // Dispose all stores
        this.storeRegistry.dispose();
        
        if (this.shutdownManager) {
            await this.shutdownManager.shutdown();
        } else {
            this.close();
        }
    }

    /**
     * Check if shutdown is in progress
     */
    isShuttingDown(): boolean {
        return this.shutdownManager?.isInShutdown() ?? false;
    }

    /**
     * Get the shutdown manager for advanced usage
     */
    getShutdownManager(): GracefulShutdownManager | undefined {
        return this.shutdownManager;
    }

    /**
     * Start the application with clustering support
     * @param options Cluster options
     * @param startFn Function to start the server (called in each worker)
     */
    cluster(options: ClusterOptions = {}): ClusterManager {
        this.clusterManager = new ClusterManager({
            verbose: this.config.debug,
            ...options
        });
        return this.clusterManager;
    }

    /**
     * Get the cluster manager
     */
    getClusterManager(): ClusterManager | undefined {
        return this.clusterManager;
    }
}

/**
 * Factory function to create an application
 */
export function createApp(config?: AppConfig): Application {
    return new Application(config);
}

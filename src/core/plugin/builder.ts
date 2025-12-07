/**
 * Plugin Builder
 * Fluent API for creating plugins with type safety
 */

import {
    NexusPlugin,
    PluginMeta,
    PluginContext,
    PluginRouteExtension,
    PluginPriority,
    PluginFactory
} from './types';
import { Context, Middleware, Handler, Response } from '../types';

/**
 * Plugin Builder for fluent plugin creation
 * 
 * @example
 * ```typescript
 * const authPlugin = definePlugin('auth-plugin')
 *   .version('1.0.0')
 *   .description('Authentication plugin with JWT support')
 *   .depends(['database-plugin'])
 *   .config<{ secret: string; expiry: number }>()
 *   .defaults({ expiry: 3600 })
 *   .middleware((ctx) => jwtMiddleware(ctx.config.secret))
 *   .decorate((ctx) => {
 *     ctx.auth = { user: null, isAuthenticated: false };
 *   })
 *   .register(async (ctx) => {
 *     ctx.log.info('Auth plugin initialized');
 *   })
 *   .export((ctx) => ({
 *     verify: (token: string) => verifyJWT(token, ctx.config.secret),
 *     sign: (payload: any) => signJWT(payload, ctx.config.secret)
 *   }))
 *   .build();
 * ```
 */
export class PluginBuilder<TConfig = {}, TExports = {}> {
    private _meta: PluginMeta;
    private _defaults?: Partial<TConfig>;
    private _validateConfig?: (config: TConfig) => boolean | string;
    private _configure?: (ctx: PluginContext<TConfig>) => void | Promise<void>;
    private _register?: (ctx: PluginContext<TConfig>) => void | Promise<void>;
    private _boot?: (ctx: PluginContext<TConfig>) => void | Promise<void>;
    private _ready?: (ctx: PluginContext<TConfig>) => void | Promise<void>;
    private _shutdown?: (ctx: PluginContext<TConfig>) => void | Promise<void>;
    private _exports?: (ctx: PluginContext<TConfig>) => TExports;
    private _middlewares?: Middleware[] | ((ctx: PluginContext<TConfig>) => Middleware[]);
    private _routes?: PluginRouteExtension[] | ((ctx: PluginContext<TConfig>) => PluginRouteExtension[]);
    private _decorateContext?: (ctx: Context) => void;
    private _decorateApp?: (app: any) => void;

    constructor(name: string) {
        this._meta = { name, version: '1.0.0' };
    }

    /**
     * Set plugin version
     */
    version(version: string): this {
        this._meta.version = version;
        return this;
    }

    /**
     * Set plugin description
     */
    description(description: string): this {
        this._meta.description = description;
        return this;
    }

    /**
     * Set plugin author
     */
    author(author: string | { name: string; email?: string; url?: string }): this {
        this._meta.author = author;
        return this;
    }

    /**
     * Set plugin homepage
     */
    homepage(url: string): this {
        this._meta.homepage = url;
        return this;
    }

    /**
     * Set plugin priority
     */
    priority(priority: PluginPriority): this {
        this._meta.priority = priority;
        return this;
    }

    /**
     * Add tags for categorization
     */
    tags(...tags: string[]): this {
        this._meta.tags = tags;
        return this;
    }

    /**
     * Declare required dependencies
     */
    depends(plugins: string[]): this {
        this._meta.dependencies = plugins;
        return this;
    }

    /**
     * Declare optional dependencies
     */
    optionalDeps(plugins: string[]): this {
        this._meta.optionalDependencies = plugins;
        return this;
    }

    /**
     * Declare conflicting plugins
     */
    conflicts(plugins: string[]): this {
        this._meta.conflicts = plugins;
        return this;
    }

    /**
     * Define config type (for TypeScript inference)
     */
    config<T>(): PluginBuilder<T, TExports> {
        return this as unknown as PluginBuilder<T, TExports>;
    }

    /**
     * Set default configuration
     */
    defaults(defaults: Partial<TConfig>): this {
        this._defaults = defaults;
        return this;
    }

    /**
     * Add config validator
     */
    validate(validator: (config: TConfig) => boolean | string): this {
        this._validateConfig = validator;
        return this;
    }

    /**
     * Configure phase hook
     */
    configure(fn: (ctx: PluginContext<TConfig>) => void | Promise<void>): this {
        this._configure = fn;
        return this;
    }

    /**
     * Register phase hook
     */
    register(fn: (ctx: PluginContext<TConfig>) => void | Promise<void>): this {
        this._register = fn;
        return this;
    }

    /**
     * Boot phase hook
     */
    boot(fn: (ctx: PluginContext<TConfig>) => void | Promise<void>): this {
        this._boot = fn;
        return this;
    }

    /**
     * Ready phase hook
     */
    ready(fn: (ctx: PluginContext<TConfig>) => void | Promise<void>): this {
        this._ready = fn;
        return this;
    }

    /**
     * Shutdown phase hook
     */
    shutdown(fn: (ctx: PluginContext<TConfig>) => void | Promise<void>): this {
        this._shutdown = fn;
        return this;
    }

    /**
     * Define exports for other plugins
     */
    export<T>(fn: (ctx: PluginContext<TConfig>) => T): PluginBuilder<TConfig, T> {
        this._exports = fn as any;
        return this as unknown as PluginBuilder<TConfig, T>;
    }

    /**
     * Add global middleware
     */
    middleware(middleware: Middleware | ((ctx: PluginContext<TConfig>) => Middleware)): this {
        if (!this._middlewares) {
            this._middlewares = [];
        }
        if (typeof middleware === 'function' && middleware.length === 1) {
            // It's a factory function
            const existing = this._middlewares;
            this._middlewares = (ctx: PluginContext<TConfig>) => {
                const base = typeof existing === 'function' ? existing(ctx) : existing;
                return [...base, (middleware as (ctx: PluginContext<TConfig>) => Middleware)(ctx)];
            };
        } else {
            if (Array.isArray(this._middlewares)) {
                this._middlewares.push(middleware as Middleware);
            }
        }
        return this;
    }

    /**
     * Add multiple middlewares
     */
    middlewares(middlewares: Middleware[] | ((ctx: PluginContext<TConfig>) => Middleware[])): this {
        this._middlewares = middlewares;
        return this;
    }

    /**
     * Add a route
     */
    route(
        method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
        path: string,
        handler: Handler,
        options?: { middlewares?: Middleware[]; meta?: PluginRouteExtension['meta'] }
    ): this {
        if (!this._routes) {
            this._routes = [];
        }
        if (Array.isArray(this._routes)) {
            this._routes.push({
                method,
                path,
                handler,
                middlewares: options?.middlewares,
                meta: options?.meta
            });
        }
        return this;
    }

    /**
     * Add routes dynamically
     */
    routes(routes: PluginRouteExtension[] | ((ctx: PluginContext<TConfig>) => PluginRouteExtension[])): this {
        this._routes = routes;
        return this;
    }

    /**
     * Decorate request context
     */
    decorate(decorator: (ctx: Context) => void): this {
        this._decorateContext = decorator;
        return this;
    }

    /**
     * Decorate application
     */
    decorateApp(decorator: (app: any) => void): this {
        this._decorateApp = decorator;
        return this;
    }

    /**
     * Build the plugin
     */
    build(): NexusPlugin<TConfig, TExports> {
        return {
            meta: this._meta,
            defaults: this._defaults,
            validateConfig: this._validateConfig,
            configure: this._configure,
            register: this._register,
            boot: this._boot,
            ready: this._ready,
            shutdown: this._shutdown,
            exports: this._exports,
            middlewares: this._middlewares,
            routes: this._routes,
            decorateContext: this._decorateContext,
            decorateApp: this._decorateApp
        };
    }

    /**
     * Build as factory function (accepts config at runtime)
     */
    factory(): PluginFactory<TConfig> {
        return (config?: TConfig) => {
            const plugin = this.build();
            // Config will be merged by PluginManager
            return plugin;
        };
    }
}

/**
 * Create a new plugin using fluent builder
 * 
 * @example
 * ```typescript
 * const myPlugin = definePlugin('my-plugin')
 *   .version('1.0.0')
 *   .register(async (ctx) => {
 *     ctx.log.info('Hello from my plugin!');
 *   })
 *   .build();
 * 
 * app.plugin(myPlugin);
 * ```
 */
export function definePlugin(name: string): PluginBuilder {
    return new PluginBuilder(name);
}

/**
 * Create a simple plugin quickly
 * 
 * @example
 * ```typescript
 * const loggerPlugin = createPlugin({
 *   name: 'logger',
 *   version: '1.0.0',
 *   register: (ctx) => {
 *     ctx.app.use(loggerMiddleware);
 *   }
 * });
 * ```
 */
export function createPlugin<TConfig = any, TExports = any>(
    options: Partial<NexusPlugin<TConfig, TExports>> & { name: string }
): NexusPlugin<TConfig, TExports> {
    return {
        meta: {
            name: options.name,
            version: options.meta?.version ?? '1.0.0',
            ...options.meta
        },
        ...options
    } as NexusPlugin<TConfig, TExports>;
}

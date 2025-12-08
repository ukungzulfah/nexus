/**
 * Core type definitions for the Nexus Framework
 * Provides type-safe interfaces for requests, responses, middleware, and routing
 */

import { IncomingMessage, ServerResponse } from 'http';
import { ZodSchema } from 'zod';
import { Application } from './application';
import { ContextStore, StoreConstructor, StoreRegistry, RequestStore, RequestStoreConstructor } from './store';
import { JSONSchema, ResponseSchemaConfig, SerializerFunction } from './serializer';

/**
 * Template engine interface for render() method
 */
export interface TemplateEngine {
    /** Engine name (e.g., 'handlebars', 'ejs', 'pug') */
    name: string;
    
    /** File extensions this engine handles (e.g., ['.hbs', '.handlebars']) */
    extensions: string[];
    
    /** 
     * Compile and render template with data
     * @param template - Template string content
     * @param data - Data to inject
     * @returns Rendered string
     */
    render(template: string, data: Record<string, any>): string | Promise<string>;
}

/**
 * Options for render() method
 */
export interface RenderOptions {
    /** Template engine to use (default: auto-detect from extension or 'simple') */
    engine?: string;
    
    /** Status code for response (default: 200) */
    status?: number;
    
    /** Additional headers */
    headers?: Record<string, string>;
}

/**
 * HTTP methods supported by the framework
 */
export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * HTTP headers type-safe wrapper
 */
export interface Headers {
    [key: string]: string | string[] | undefined;
}

/**
 * Cookie parser and manager
 */
export interface Cookies {
    get(name: string): string | undefined;
    set(name: string, value: string, options?: CookieOptions): void;
    delete(name: string): void;
}

/**
 * Cookie configuration options
 */
export interface CookieOptions {
    maxAge?: number;
    expires?: Date;
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
}

/**
 * Response builder for fluent API
 */
export interface ResponseBuilder {
    status(code: number): ResponseBuilder;
    header(name: string, value: string): ResponseBuilder;
    json<T>(data: T): Response;
    html(content: string): Response;
    text(content: string): Response;
    redirect(url: string, status?: number): Response;
    stream(readable: NodeJS.ReadableStream): Response;
}

/**
 * Framework response object
 */
export interface Response {
    statusCode: number;
    headers: Headers;
    body: any;
    stream?: NodeJS.ReadableStream;
}

/**
 * Unified context object containing request and response data
 * This replaces the traditional req/res pattern with an immutable context
 */
export interface Context {
    // Request metadata
    method: HTTPMethod;
    path: string;
    url: URL;

    // Request data
    params: Record<string, string>;
    query: Record<string, any>;
    body: any;
    headers: Headers;
    cookies: Cookies;

    // Raw Node.js objects for advanced use cases
    raw: {
        req: IncomingMessage;
        res: ServerResponse;
    };

    // Response builder
    response: ResponseBuilder;

    // Store access
    /** Access a registered global store by its class (singleton, persist across requests) */
    store<T extends ContextStore<any>>(StoreClass: StoreConstructor<T>): T;
    
    /** Access a request-scoped store by its class (per-request, disposed after response) */
    requestStore<T extends RequestStore<any>>(StoreClass: RequestStoreConstructor<T>): T;

    // Request-scoped data (simple key-value storage)
    /** Set a value in request-scoped storage */
    set<T = any>(key: string, value: T): void;
    
    /** Get a value from request-scoped storage */
    get<T = any>(key: string): T | undefined;

    // Body methods (for sync access after pre-parsing)
    /** Check if body is ready for sync access (no await needed) */
    isBodyReady: boolean;
    
    /** Wait for body to be parsed (internal use, rarely needed by user) */
    waitForBody(): Promise<any>;
    
    /** Async body getter - use for POST/PUT/PATCH if body might not be ready */
    getBody<T = any>(): Promise<T>;

    // Utility methods
    json<T>(data: T, status?: number): Response;
    html(content: string, status?: number): Response;
    text(content: string, status?: number): Response;
    redirect(url: string, status?: number): Response;
    stream(readable: NodeJS.ReadableStream): Response;

    // Custom properties added by middleware
    [key: string]: any;
}

/**
 * Next function for middleware chain
 */
export type Next<TContext = Context> = (ctx: TContext) => Promise<Response>;

/**
 * Middleware function signature
 * Middleware can transform the context and pass it to the next handler
 * Now supports optional dependency injection as the third parameter.
 * 
 * @template TIn - Input context type
 * @template TOut - Output context type (after transformation)
 * @template TDeps - Dependencies type (injected from app.provide())
 * 
 * @example
 * ```typescript
 * // Simple middleware (no deps)
 * const loggerMiddleware: Middleware = async (ctx, next) => {
 *   console.log(`${ctx.method} ${ctx.path}`);
 *   return next(ctx);
 * };
 * 
 * // Middleware with dependencies
 * const authMiddleware: Middleware<Context, Context, { jwt: JWTService; db: Database }> = 
 *   async (ctx, next, { jwt, db }) => {
 *     const token = ctx.headers.authorization?.replace('Bearer ', '');
 *     const payload = await jwt.verify(token);
 *     ctx.user = await db.findUser(payload.userId);
 *     return next(ctx);
 *   };
 * ```
 */
export type Middleware<TIn = Context, TOut = Context, TDeps = any> = (
    ctx: TIn,
    next: Next<TOut>,
    deps: TDeps
) => Promise<Response>;

/**
 * Route handler function signature
 * Handlers can return data directly or a Response object
 * Supports both sync and async handlers
 */
export type Handler<TContext = Context, TDeps = any> = (
    ctx: TContext,
    deps: TDeps
) => Response | any | Promise<Response | any>;

/**
 * Dependency container type
 * Maps dependency names to their instances
 */
export type DependencyContainer = Record<string, any>;

/**
 * Extract dependency types from container
 */
export type ExtractDeps<T extends DependencyContainer, K extends keyof T> = {
    [P in K]: T[P];
};

/**
 * Route configuration with dependency injection
 */
export interface InjectedRouteConfig<
    TContext = Context,
    TDeps extends DependencyContainer = DependencyContainer,
    TKeys extends keyof TDeps = keyof TDeps
> {
    /** Dependencies to inject into handler */
    inject?: TKeys[];
    /** Route handler with injected dependencies */
    handler: (ctx: TContext, deps: Pick<TDeps, TKeys>) => Promise<Response | any>;
    /** Middleware chain */
    middlewares?: Middleware<any, any>[];
    /** Schema validation */
    schema?: SchemaConfig;
    /** Route metadata */
    meta?: RouteMeta;
}

/**
 * Validation error detail from Zod
 */
export interface ValidationErrorDetail {
    path: (string | number)[];
    message: string;
    code: string;
}

/**
 * Custom validation error handler
 */
export type ValidationErrorHandler = (
    errors: ValidationErrorDetail[],
    ctx: Context
) => Response | any;

/**
 * Schema validation configuration
 */
export interface SchemaConfig {
    params?: ZodSchema;
    query?: ZodSchema;
    body?: ZodSchema;
    headers?: ZodSchema;
    /** 
     * Response schema for fast JSON serialization 
     * When provided, uses fast-json-stringify for 2-3x faster serialization
     * 
     * @example
     * ```typescript
     * app.get('/users', {
     *   schema: {
     *     response: {
     *       200: {
     *         type: 'array',
     *         items: {
     *           type: 'object',
     *           properties: {
     *             id: { type: 'number' },
     *             name: { type: 'string' }
     *           }
     *         }
     *       }
     *     }
     *   },
     *   handler: async (ctx) => users
     * });
     * ```
     */
    response?: ResponseSchemaConfig;
    onValidationError?: ValidationErrorHandler;
}

/**
 * Route metadata for documentation and API generation
 */
export interface RouteMeta {
    description?: string;
    tags?: string[];
    responses?: Record<number, string>;
    deprecated?: boolean;
    summary?: string;
    example?: string;
    fileLocation?: string;
}

/**
 * Route configuration object
 */
export interface RouteConfig<TContext = Context> {
    method: HTTPMethod;
    path: string;
    handler: Handler<TContext>;
    middlewares?: Middleware<any, any>[];
    schema?: SchemaConfig;
    meta?: RouteMeta;
    /** Pre-compiled serializer function (internal use) */
    _serializer?: Map<number | string, SerializerFunction>;
}

/**
 * Route match result from router
 */
export interface RouteMatch {
    handler: Handler;
    params: Record<string, string>;
    middlewares: Middleware[];
    schema?: SchemaConfig;
    /** Pre-compiled serializer for response (internal use) */
    _serializer?: Map<number | string, SerializerFunction>;
}

/**
 * Error handler function signature
 */
export type ErrorHandler = (
    error: Error,
    ctx: Context
) => Response | Promise<Response>;

/**
 * Application configuration options
 */
export interface AppConfig {
    // Performance options
    contextPoolSize?: number;
    enableJIT?: boolean;

    // Router options
    /** Enable regex patterns in route params, e.g. /users/:id(\\d+) */
    enableRegexRoutes?: boolean;

    // Error handling
    onError?: ErrorHandler;

    // Development options
    debug?: boolean;
    logRequests?: boolean;
    
    // Template engines (built-in, lazy-loaded)
    /** Enable Handlebars template engine (zero overhead if not used) */
    handlebars?: boolean;
    /** Enable EJS template engine (zero overhead if not used) */
    ejs?: boolean;
    /** Enable Pug template engine (zero overhead if not used) */
    pug?: boolean;
    /** Enable Mustache template engine (zero overhead if not used) */
    mustache?: boolean;
}

/**
 * Plugin interface for extensibility
 */
export interface Plugin {
    name: string;
    version: string;
    install: (app: Application) => void | Promise<void>;
}

/**
 * Base interface for class-based route definitions
 * 
 * @example
 * ```typescript
 * class UserRegister implements RouteBase {
 *   pathName = '/api/users/register';
 *   
 *   schema() {
 *     return { body: z.object({ email: z.string().email() }) };
 *   }
 *   
 *   meta() {
 *     return { summary: 'Register user', tags: ['Users'] };
 *   }
 *   
 *   async handler(ctx: Context) {
 *     return { success: true };
 *   }
 * }
 * 
 * app.post(new UserRegister());
 * ```
 */
export interface RouteBase<TContext = Context> {
    /** The route path (e.g., '/api/users/:id') - Optional for file-based routing */
    pathName?: string;
    
    /** 
     * HTTP method(s) this route handles - Optional for file-based routing
     * When using file-based routing, you can define method handlers (GET, POST, etc.) as methods
     */
    method?: HTTPMethod | HTTPMethod[];
    
    /** Optional schema validation */
    schema?: () => SchemaConfig;
    
    /** Optional route metadata for documentation */
    meta?: () => RouteMeta;
    
    /** Optional route-specific middlewares */
    middlewares?: () => Middleware<any, any>[];
    
    /** The route handler (can be omitted if using method-named handlers like GET, POST, etc.) */
    handler?: Handler<TContext>;
    
    /** Method-specific handlers for file-based routing */
    GET?: Handler<TContext>;
    POST?: Handler<TContext>;
    PUT?: Handler<TContext>;
    DELETE?: Handler<TContext>;
    PATCH?: Handler<TContext>;
    HEAD?: Handler<TContext>;
    OPTIONS?: Handler<TContext>;
}

/**
 * Abstract base class for class-based routes with REQUIRED handler implementation.
 * Use this when you want TypeScript to enforce that the handler method is implemented.
 * Also provides lifecycle hooks for request processing and dependency injection.
 * 
 * @example
 * ```typescript
 * // With dependency injection
 * class UserRegister extends Route<Context, { db: Database; cache: Redis }> {
 *   pathName = '/api/users/register';
 *   
 *   // Optional: run before handler (with deps)
 *   async onBefore(ctx: Context, { db }: { db: Database }) {
 *     console.log('Before handler, db connected:', db.isConnected);
 *   }
 *   
 *   // Optional: transform response after handler (with deps)
 *   async onAfter(ctx: Context, result: any, { cache }: { cache: Redis }) {
 *     await cache.set('last-register', JSON.stringify(result));
 *     return { ...result, timestamp: Date.now() };
 *   }
 *   
 *   // Optional: custom error handling (with deps)
 *   async onError(ctx: Context, error: Error, deps) {
 *     return { error: error.message, code: 'CUSTOM_ERROR' };
 *   }
 *   
 *   // REQUIRED: handler with dependencies
 *   async handler(ctx: Context, { db, cache }) {
 *     const user = await db.query('INSERT INTO users...');
 *     await cache.set(`user:${user.id}`, user);
 *     return { success: true, user };
 *   }
 * }
 * 
 * app.provide({ db, cache }).post(new UserRegister());
 * ```
 */
export abstract class Route<TContext = Context, TDeps = any> {
    pathName?: string;
    
    /** 
     * Template engines registry (static, shared across all routes)
     * @private
     */
    private static templateEngines: Map<string, TemplateEngine> = new Map();
    
    /**
     * Register a custom template engine
     * @param engine - Template engine implementation
     * 
     * @example
     * ```typescript
     * import Handlebars from 'handlebars';
     * 
     * Route.registerEngine({
     *   name: 'handlebars',
     *   extensions: ['.hbs', '.handlebars'],
     *   render: (template, data) => {
     *     const compiled = Handlebars.compile(template);
     *     return compiled(data);
     *   }
     * });
     * ```
     */
    static registerEngine(engine: TemplateEngine): void {
        Route.templateEngines.set(engine.name, engine);
        // Also register by file extensions for auto-detection
        for (const ext of engine.extensions) {
            Route.templateEngines.set(ext, engine);
        }
    }
    
    /**
     * Get registered template engine by name or extension
     * @private
     */
    private static getEngine(nameOrExt: string): TemplateEngine | undefined {
        return Route.templateEngines.get(nameOrExt);
    }
    
    /** 
     * The main route handler - REQUIRED!
     * TypeScript will enforce this is implemented.
     * @param ctx - Request context
     * @param deps - Injected dependencies from app.provide()
     */
    abstract handler(ctx: TContext, deps: TDeps): Promise<any> | any;
    
    // ─────────────────────────────────────────────────────────────────────────
    // Helper Methods for cleaner response handling
    // ─────────────────────────────────────────────────────────────────────────
    
    /**
     * Return a successful JSON response
     * @param data - The response data to send
     * @returns Object with success: true merged with data
     * 
     * @example
     * ```typescript
     * return this.ok({ user: { id: 1, name: 'John' } });
     * // Returns: { success: true, user: { id: 1, name: 'John' } }
     * ```
     */
    protected ok<T extends Record<string, any>>(data: T): { success: true } & T {
        return { success: true, ...data };
    }
    
    /**
     * Return a failed JSON response with status code
     * @param ctx - The request context
     * @param status - HTTP status code (e.g., 400, 404, 500)
     * @param message - Error message
     * @param data - Optional additional error data
     * @returns Response object with error details
     * 
     * @example
     * ```typescript
     * return this.fail(ctx, 404, 'User not found');
     * // Returns 404 with: { success: false, message: 'User not found' }
     * 
     * return this.fail(ctx, 400, 'Validation failed', { errors: [...] });
     * // Returns 400 with: { success: false, message: 'Validation failed', data: { errors: [...] } }
     * ```
     */
    protected fail(ctx: TContext, status: number, message: string, data?: any): Response {
        return (ctx as Context).response
            .status(status)
            .json({ success: false, message, ...(data !== undefined ? { data } : {}) });
    }
    
    /**
     * Render a file template with data injection
     * Supports multiple template engines via plugins or simple placeholder syntax by default
     * @param filePath - Path to the template file (relative to project root or absolute)
     * @param data - Data object to inject into template
     * @param options - Render options (engine, status, headers)
     * @returns Response object with rendered HTML/text
     * 
     * @example
     * ```typescript
     * // Simple placeholder (default): {{ variableName }}
     * return this.render('./views/welcome.html', { name: 'John' });
     * 
     * // With Handlebars (auto-detect from .hbs extension)
     * return this.render('./views/profile.hbs', { user });
     * 
     * // Force specific engine
     * return this.render('./views/page.html', { data }, { engine: 'ejs' });
     * 
     * // With custom status and headers
     * return this.render('./views/error.html', { message }, { 
     *   status: 500,
     *   headers: { 'X-Custom': 'value' }
     * });
     * ```
     */
    protected async render(
        filePath: string, 
        data?: Record<string, any>,
        options?: RenderOptions
    ): Promise<Response> {
        const fs = await import('fs');
        const path = await import('path');
        
        // Resolve file path (support both relative and absolute paths)
        const resolvedPath = path.isAbsolute(filePath) 
            ? filePath 
            : path.resolve(process.cwd(), filePath);
        
        // Check if file exists
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Template file not found: ${filePath}`);
        }
        
        // Read file content
        let content = fs.readFileSync(resolvedPath, 'utf-8');
        
        // Determine which engine to use
        const ext = path.extname(filePath).toLowerCase();
        let engine: TemplateEngine | undefined;
        
        if (options?.engine) {
            // Explicit engine specified
            engine = Route.getEngine(options.engine);
            if (!engine) {
                throw new Error(
                    `Template engine '${options.engine}' not registered. ` +
                    `Register it using Route.registerEngine()`
                );
            }
        } else {
            // Auto-detect from file extension
            engine = Route.getEngine(ext);
        }
        
        // Render with appropriate engine
        if (engine) {
            // Use registered template engine
            content = await engine.render(content, data || {});
        } else if (data && Object.keys(data).length > 0) {
            // Fallback to simple placeholder engine (default)
            content = this.injectTemplateData(content, data);
        }
        
        // Determine content type from file extension
        const contentType = this.getContentTypeFromExtension(ext);
        
        // Build response headers
        const headers: Record<string, string> = {
            'Content-Type': contentType,
            ...(options?.headers || {})
        };
        
        return {
            statusCode: options?.status || 200,
            headers,
            body: content
        };
    }
    
    /**
     * Inject data into template string
     * Supports {{ variable }} and {{ object.property }} syntax
     * Automatically JSON.stringify() objects and arrays for use in JavaScript
     * @private
     */
    private injectTemplateData(template: string, data: Record<string, any>): string {
        return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
            // Support nested properties: user.name, user.email, etc.
            const value = key.split('.').reduce((obj: any, prop: string) => {
                return obj && obj[prop] !== undefined ? obj[prop] : '';
            }, data);
            
            if (value === undefined || value === null) {
                return '';
            }
            
            // If value is object or array, JSON.stringify it for JavaScript usage
            if (typeof value === 'object') {
                return JSON.stringify(value);
            }
            
            // Primitive values: convert to string
            return String(value);
        });
    }
    
    /**
     * Get content type from file extension
     * @private
     */
    private getContentTypeFromExtension(ext: string): string {
        const mimeTypes: Record<string, string> = {
            '.html': 'text/html; charset=utf-8',
            '.htm': 'text/html; charset=utf-8',
            '.xml': 'application/xml; charset=utf-8',
            '.txt': 'text/plain; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.svg': 'image/svg+xml',
        };
        
        return mimeTypes[ext] || 'text/plain; charset=utf-8';
    }
    
    /** 
     * HTTP method(s) this route handles - Optional
     * When using file-based routing, you can also define method handlers (GET, POST, etc.)
     */
    method?: HTTPMethod | HTTPMethod[];
    
    /** 
     * Hook: Called BEFORE the handler.
     * - Return undefined/void to continue to handler
     * - Return a value to skip handler and use that as response
     * - Throw an error to trigger onError
     * @param ctx - Request context
     * @param deps - Injected dependencies from app.provide()
     */
    onBefore?(ctx: TContext, deps: TDeps): Promise<any | void> | any | void;
    
    /** 
     * Hook: Called AFTER the handler completes successfully.
     * - Receives the handler result
     * - Can transform/modify the response
     * - Return the (modified) result
     * @param ctx - Request context
     * @param result - Handler result
     * @param deps - Injected dependencies from app.provide()
     */
    onAfter?(ctx: TContext, result: any, deps: TDeps): Promise<any> | any;
    
    /** 
     * Hook: Called when handler or onBefore throws an error.
     * - Can return a custom error response
     * - If not defined, error propagates to global error handler
     * @param ctx - Request context
     * @param error - Error thrown
     * @param deps - Injected dependencies from app.provide()
     */
    onError?(ctx: TContext, error: Error, deps: TDeps): Promise<any> | any;
    
    /** Optional schema validation */
    schema?(): SchemaConfig;
    
    /** Optional route metadata for documentation */
    meta?(): RouteMeta;
    
    /** Optional route-specific middlewares */
    middlewares?(): Middleware<any, any>[];
}

/**
 * Type guard to check if a route is a Route class instance (with hooks support)
 */
export function isRouteClass(route: RouteBase | Route): route is Route {
    return route instanceof Route || 
           (typeof (route as Route).handler === 'function' && 
            'pathName' in route &&
            (typeof (route as Route).onBefore === 'function' ||
             typeof (route as Route).onAfter === 'function' ||
             typeof (route as Route).onError === 'function'));
}

/**
 * Lifecycle hooks for request processing
 * 
 * @example
 * ```typescript
 * app.hooks({
 *   onRequest: async (ctx) => {
 *     ctx.requestId = crypto.randomUUID();
 *   },
 *   beforeHandler: async (ctx) => {
 *     ctx.user = await getUser(ctx.headers.authorization);
 *   },
 *   afterHandler: async (ctx, result) => {
 *     return { ...result, timestamp: Date.now() };
 *   },
 *   onError: async (ctx, error) => {
 *     await logToSentry(error);
 *   }
 * });
 * ```
 */
export interface LifecycleHooks {
    /** Called when request is received, before any processing */
    onRequest?: (ctx: Context) => Promise<void | Response> | void | Response;
    
    /** Called before schema validation */
    beforeValidation?: (ctx: Context) => Promise<void | Response> | void | Response;
    
    /** Called after schema validation succeeds (ctx.body, ctx.query, ctx.params are validated) */
    afterValidation?: (ctx: Context) => Promise<void | Response> | void | Response;
    
    /** Called before route handler executes */
    beforeHandler?: (ctx: Context) => Promise<void | Response> | void | Response;
    
    /** Called after handler, can transform result. Return new result to override */
    afterHandler?: (ctx: Context, result: any) => Promise<any> | any;
    
    /** Called when an error occurs. Can return Response to handle error */
    onError?: (ctx: Context, error: Error) => Promise<void | Response> | void | Response;
    
    /** Called before response is sent (after all processing) */
    onResponse?: (ctx: Context, response: Response) => Promise<void | Response> | void | Response;
}

/**
 * Versioning strategy types
 */
export type VersioningStrategy = 'path' | 'header' | 'query';

/**
 * Versioning configuration for API versioning
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
 * ```
 */
export interface VersioningConfig {
    /** Versioning strategies to use */
    strategies: VersioningStrategy[];
    /** Header name for version (default: 'api-version') */
    header?: string;
    /** Query param name for version (default: 'v') */
    queryParam?: string;
    /** Default version when not specified */
    defaultVersion: string;
    /** List of versions to register */
    register: string[];
}

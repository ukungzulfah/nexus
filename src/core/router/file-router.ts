/**
 * File-Based Router for Nexus Framework
 * 
 * Automatically scans a directory and registers routes based on file/folder structure.
 * Designed for class-based routing: 1 file = 1 class = 1 route.
 * 
 * Smart filename conventions (only if no body schema):
 * - `index.ts`  → GET (default), maps to parent path
 * - `create.ts` → POST, maps to parent path (not /create)
 * - `update.ts` → PUT, maps to parent path (not /update)
 * - `delete.ts` → DELETE, maps to parent path (not /delete)
 * - `patch.ts`  → PATCH, maps to parent path (not /patch)
 * - Other files → GET (default)
 * 
 * Smart body detection (HIGHEST PRIORITY after explicit method):
 * - If schema() returns object with `body` property → POST
 * - Works with inheritance (parent class schema is checked too)
 * - Overrides smart filename detection!
 * - Override by explicitly setting `method` property in class
 * 
 * @example
 * ```
 * routes/
 *   api/
 *     auth/
 *       register.ts       → POST /api/auth/register (auto-detected via ctx.body!)
 *       login.ts          → POST /api/auth/login
 *     users/
 *       index.ts          → GET /api/users
 *       create.ts         → POST /api/users (auto!)
 *       [id]/
 *         index.ts        → GET /api/users/:id
 *         update.ts       → PUT /api/users/:id (auto!)
 *         delete.ts       → DELETE /api/users/:id (auto!)
 * ```
 * 
 * Each file exports a class:
 * ```typescript
 * export default class RegisterRoute {
 *   // No need to specify method = 'POST' if schema has body!
 *   
 *   schema() {
 *     return {
 *       body: z.object({ ... })  // ← auto-detects POST!
 *     };
 *   }
 *   
 *   async handler(ctx: Context) {
 *     const data = ctx.body;
 *     ...
 *   }
 * }
 * ```
 */

import { readdir, stat } from 'fs/promises';
import { join, parse, extname } from 'path';
import { pathToFileURL } from 'url';
import { Application } from '../application';
import { 
    HTTPMethod, 
    Handler, 
    Context, 
    SchemaConfig, 
    RouteMeta, 
    Middleware,
    RouteBase,
    Route
} from '../types';

/**
 * Supported HTTP methods for file-based routing
 */
const HTTP_METHODS: HTTPMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

/**
 * Default HTTP method when not specified
 */
const DEFAULT_METHOD: HTTPMethod = 'GET';

/**
 * Smart filename to HTTP method mapping
 * These filenames auto-set the method AND don't become part of the route path
 */
const SMART_FILENAME_METHODS: Record<string, HTTPMethod> = {
    'create': 'POST',
    'update': 'PUT', 
    'delete': 'DELETE',
    'patch': 'PATCH',
    'index': 'GET'
};

/**
 * Check if filename is a "smart" filename that implies method
 */
function isSmartFilename(filename: string): boolean {
    return filename in SMART_FILENAME_METHODS;
}

/**
 * Get implied method from smart filename
 */
function getSmartMethod(filename: string): HTTPMethod {
    return SMART_FILENAME_METHODS[filename] || DEFAULT_METHOD;
}

/**
 * Options for file-based routing
 */
export interface FileRouterOptions {
    /** Root directory for routes (relative to project root or absolute) */
    dir: string;
    /** Optional prefix for all routes (e.g., '/api/v1') */
    prefix?: string;
    /** File extensions to scan (default: ['.ts', '.js']) */
    extensions?: string[];
    /** Enable debug logging */
    debug?: boolean;
    /** Custom middleware file name (default: '_middleware') */
    middlewareFileName?: string;
    /** Custom error handler file name (default: '_error') */
    errorFileName?: string;
}

/**
 * Class-based route export (1 file = 1 class = 1 route)
 */
export interface FileRouteClass {
    /** HTTP method for this route (default: 'GET') */
    method?: HTTPMethod;
    /** Optional schema validation */
    schema?: () => SchemaConfig;
    /** Optional route metadata for documentation */
    meta?: () => RouteMeta;
    /** Optional route-specific middlewares */
    middlewares?: () => Middleware[];
    /** The route handler */
    handler: Handler;
}

/**
 * Route file module export
 */
export interface RouteModule {
    /** Default export: the route class */
    default?: FileRouteClass | (new () => FileRouteClass);
}

/**
 * Parsed route information
 */
interface ParsedRoute {
    path: string;
    method: HTTPMethod;
    handler: Handler;
    middlewares: Middleware[];
    schema?: SchemaConfig;
    meta?: RouteMeta;
    filePath: string;
}

/**
 * Middleware stack for directory hierarchy
 */
interface MiddlewareStack {
    path: string;
    middleware: Middleware;
}

/**
 * File-based router implementation
 * 
 * Philosophy:
 * - 1 file = 1 class = 1 route
 * - Folder structure determines the path (pathName in class is IGNORED)
 * - HTTP method is defined via `method` property (default: GET)
 * - Clean, scalable, easy to navigate
 */
export class FileRouter {
    private options: Required<FileRouterOptions>;
    private routes: ParsedRoute[] = [];
    private middlewareStack: MiddlewareStack[] = [];

    constructor(options: FileRouterOptions) {
        this.options = {
            dir: options.dir,
            prefix: options.prefix || '',
            extensions: options.extensions || ['.ts', '.js'],
            debug: options.debug || false,
            middlewareFileName: options.middlewareFileName || '_middleware',
            errorFileName: options.errorFileName || '_error'
        };
    }

    /**
     * Scan directory and collect all routes
     */
    async scan(): Promise<ParsedRoute[]> {
        this.routes = [];
        this.middlewareStack = [];
        
        await this.scanDirectory(this.options.dir, '');
        
        if (this.options.debug) {
            console.log('\n📁 File-Based Routes Discovered:');
            console.log('─'.repeat(60));
            for (const route of this.routes) {
                console.log(`  ${route.method.padEnd(7)} ${route.path}`);
                console.log(`          └─ ${route.filePath}`);
            }
            console.log('─'.repeat(60));
            console.log(`  Total: ${this.routes.length} routes\n`);
        }
        
        return this.routes;
    }

    /**
     * Register all discovered routes to the application
     */
    async register(app: Application): Promise<void> {
        const routes = await this.scan();
        
        // Get dependencies from app for injection
        const deps = (app as any).getDeps?.() || {};
        
        // Get router directly to avoid double-wrapping
        const router = (app as any).router;
        
        for (const route of routes) {
            // Wrap handler to inject dependencies
            const originalHandler = route.handler;
            const wrappedHandler: Handler = async (ctx) => originalHandler(ctx, deps);
            
            // Register directly to router to avoid double-wrapping by app methods
            router.addRoute({
                method: route.method,
                path: route.path,
                handler: wrappedHandler,
                middlewares: route.middlewares,
                schema: route.schema,
                meta: route.meta
            });
            
            if (this.options.debug) {
                console.log(`✅ Registered: ${route.method} ${route.path}`);
            }
        }
    }

    /**
     * Recursively scan a directory for route files
     */
    private async scanDirectory(dirPath: string, routePath: string): Promise<void> {
        let entries;
        
        try {
            entries = await readdir(dirPath, { withFileTypes: true });
        } catch (error) {
            if (this.options.debug) {
                console.warn(`⚠️  Cannot read directory: ${dirPath}`);
            }
            return;
        }

        // Sort entries: directories first, then files
        entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        // First, check for _middleware file
        const middlewareFile = entries.find(e => 
            e.isFile() && this.isMiddlewareFile(e.name)
        );
        
        if (middlewareFile) {
            await this.loadMiddleware(join(dirPath, middlewareFile.name), routePath);
        }

        // Process all entries
        for (const entry of entries) {
            const fullPath = join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                // Handle directory (potential route segment or dynamic param)
                const segment = this.parseSegment(entry.name);
                const newRoutePath = routePath + segment;
                await this.scanDirectory(fullPath, newRoutePath);
            } else if (entry.isFile() && this.isRouteFile(entry.name)) {
                // Handle route file
                await this.loadRouteFile(fullPath, routePath, entry.name);
            }
        }
    }

    /**
     * Check if file is a route file (has valid extension and not special file)
     */
    private isRouteFile(fileName: string): boolean {
        const ext = extname(fileName);
        if (!this.options.extensions.includes(ext)) return false;
        
        const nameWithoutExt = parse(fileName).name;
        
        // Skip special files
        if (nameWithoutExt.startsWith('_')) return false;
        
        return true;
    }

    /**
     * Check if file is a middleware file
     */
    private isMiddlewareFile(fileName: string): boolean {
        const ext = extname(fileName);
        if (!this.options.extensions.includes(ext)) return false;
        
        const nameWithoutExt = parse(fileName).name;
        return nameWithoutExt === this.options.middlewareFileName;
    }

    /**
     * Parse directory/file name to route segment
     */
    private parseSegment(name: string): string {
        // Remove file extension if present
        const nameWithoutExt = parse(name).name;
        
        // Catch-all parameter: [...slug] → /*slug
        if (nameWithoutExt.startsWith('[...') && nameWithoutExt.endsWith(']')) {
            const paramName = nameWithoutExt.slice(4, -1);
            return `/*${paramName}`;
        }
        
        // Optional catch-all: [[...slug]] → /*slug?
        if (nameWithoutExt.startsWith('[[...') && nameWithoutExt.endsWith(']]')) {
            const paramName = nameWithoutExt.slice(5, -2);
            return `/*${paramName}?`;
        }
        
        // Dynamic parameter: [id] → /:id
        if (nameWithoutExt.startsWith('[') && nameWithoutExt.endsWith(']')) {
            const paramName = nameWithoutExt.slice(1, -1);
            return `/:${paramName}`;
        }
        
        // Optional parameter: [[id]] → /:id?
        if (nameWithoutExt.startsWith('[[') && nameWithoutExt.endsWith(']]')) {
            const paramName = nameWithoutExt.slice(2, -2);
            return `/:${paramName}?`;
        }
        
        // Regular segment
        return `/${nameWithoutExt}`;
    }

    /**
     * Build the final route path from folder structure
     */
    private buildRoutePath(basePath: string, fileName: string): string {
        const nameWithoutExt = parse(fileName).name;
        
        // Build final route path
        // Smart filenames (index, create, update, delete, patch) don't add to path
        let routePath = basePath;
        if (!isSmartFilename(nameWithoutExt)) {
            routePath += this.parseSegment(fileName);
        }
        
        // Apply prefix
        if (this.options.prefix) {
            routePath = this.options.prefix + routePath;
        }
        
        // Ensure path starts with /
        if (!routePath.startsWith('/')) {
            routePath = '/' + routePath;
        }
        
        // Normalize double slashes
        routePath = routePath.replace(/\/+/g, '/');
        
        // Remove trailing slash (except for root)
        if (routePath.length > 1 && routePath.endsWith('/')) {
            routePath = routePath.slice(0, -1);
        }
        
        return routePath;
    }

    /**
     * Load a route file and extract the route class
     */
    private async loadRouteFile(filePath: string, basePath: string, fileName: string): Promise<void> {
        // Build route path from folder structure (this is the ONLY source of truth)
        const routePath = this.buildRoutePath(basePath, fileName);
        const nameWithoutExt = parse(fileName).name;

        try {
            // Import the file
            const fileUrl = pathToFileURL(filePath).href;
            const module = await import(fileUrl) as RouteModule;
            
            // Must have a default export
            if (!module.default) {
                if (this.options.debug) {
                    console.warn(`⚠️  No default export in: ${filePath}`);
                }
                return;
            }
            
            // Instantiate if it's a class constructor
            let route: Route | FileRouteClass;
            if (typeof module.default === 'function' && module.default.prototype) {
                route = new (module.default as new () => Route)();
            } else {
                route = module.default as Route;
            }
            
            // ⚠️ ENFORCE: Route class MUST extend Route abstract class
            if (!(route instanceof Route)) {
                const className = (route as any).constructor?.name || 'Unknown';
                throw new Error(
                    `Route class "${className}" in ${filePath} must extend the Route abstract class.\n` +
                    `Example:\n` +
                    `  import { Route } from 'nexus';\n` +
                    `  export default class ${className} extends Route {\n` +
                    `    async handler(ctx) { ... }\n` +
                    `  }`
                );
            }
            
            // Must have a handler (guaranteed by Route abstract class, but double-check)
            if (typeof route.handler !== 'function') {
                if (this.options.debug) {
                    console.warn(`⚠️  No handler method in: ${filePath}`);
                }
                return;
            }
            
            // Determine HTTP method:
            // 1. If class explicitly defines method → use it
            // 2. If schema has body definition → auto-detect as POST (highest priority for body!)
            // 3. If filename is smart (create/update/delete/patch/index) → auto-detect from filename
            // 4. Otherwise → default GET
            let method: HTTPMethod;
            
            if (route.method) {
                // Handle both single method and array of methods (use first one for file-based routing)
                method = Array.isArray(route.method) ? route.method[0] : route.method;
            } else {
                // Check schema for body definition first (works with inheritance!)
                const schema = route.schema?.();
                if (this.options.debug) {
                    console.log(`🔍 Smart detection for ${filePath}:`);
                    console.log(`   - schema:`, schema);
                    console.log(`   - has body:`, !!schema?.body);
                }
                
                if (schema?.body) {
                    // Schema has body → POST (overrides smart filename!)
                    method = 'POST';
                } else if (isSmartFilename(nameWithoutExt)) {
                    // Smart filename detection (create→POST, update→PUT, etc.)
                    method = getSmartMethod(nameWithoutExt);
                } else {
                    method = DEFAULT_METHOD;
                }
            }
            
            // Validate method
            if (!HTTP_METHODS.includes(method)) {
                if (this.options.debug) {
                    console.warn(`⚠️  Invalid method "${method}" in: ${filePath}`);
                }
                return;
            }
            
            // Get middlewares that apply to this route
            const applicableMiddlewares = this.getApplicableMiddlewares(basePath);
            
            // Add route-specific middlewares
            const routeMiddlewares = route.middlewares?.() || [];
            const allMiddlewares = [...applicableMiddlewares, ...routeMiddlewares];
            
            // Wrap handler with lifecycle hooks support
            // Note: Dependencies will be injected in register() method
            const routeInstance = route as Route;
            const hasHooks = typeof routeInstance.onBefore === 'function' || 
                             typeof routeInstance.onAfter === 'function' || 
                             typeof routeInstance.onError === 'function';

            let finalHandler: Handler;

            if (hasHooks) {
                const boundOriginalHandler = route.handler.bind(route);
                const onBefore = routeInstance.onBefore?.bind(route);
                const onAfter = routeInstance.onAfter?.bind(route);
                const onError = routeInstance.onError?.bind(route);

                // Handler receives (ctx, deps) - deps passed from register()
                finalHandler = async (ctx: Context, deps: any) => {
                    try {
                        // Run onBefore hook with deps
                        if (onBefore) {
                            const beforeResult = await onBefore(ctx, deps);
                            // If onBefore returns a value (not undefined), skip handler
                            if (beforeResult !== undefined) {
                                return beforeResult;
                            }
                        }

                        // Run the main handler with deps
                        let result = await boundOriginalHandler(ctx, deps);

                        // Run onAfter hook with deps
                        if (onAfter) {
                            result = await onAfter(ctx, result, deps);
                        }

                        return result;
                    } catch (error) {
                        // Run onError hook if defined with deps
                        if (onError) {
                            return await onError(ctx, error as Error, deps);
                        }
                        // Re-throw if no onError handler
                        throw error;
                    }
                };
            } else {
                // No hooks - just bind handler (deps will be passed in register())
                finalHandler = route.handler.bind(route);
            }
            
            // Register the route
            this.routes.push({
                path: routePath,
                method,
                handler: finalHandler,
                middlewares: allMiddlewares,
                schema: route.schema?.(),
                meta: route.meta?.(),
                filePath
            });
            
        } catch (error) {
            if (this.options.debug) {
                console.error(`❌ Failed to load route: ${filePath}`, error);
            }
        }
    }

    /**
     * Load middleware from a _middleware file
     */
    private async loadMiddleware(filePath: string, routePath: string): Promise<void> {
        try {
            const fileUrl = pathToFileURL(filePath).href;
            const module = await import(fileUrl);
            
            const middleware = module.default || module.middleware;
            
            if (typeof middleware === 'function') {
                this.middlewareStack.push({
                    path: routePath,
                    middleware
                });
                
                if (this.options.debug) {
                    console.log(`📦 Loaded middleware for: ${routePath || '/'}`);
                }
            }
        } catch (error) {
            if (this.options.debug) {
                console.error(`❌ Failed to load middleware: ${filePath}`, error);
            }
        }
    }

    /**
     * Get middlewares that apply to a given route path
     */
    private getApplicableMiddlewares(routePath: string): Middleware[] {
        return this.middlewareStack
            .filter(m => routePath.startsWith(m.path))
            .map(m => m.middleware);
    }
}

/**
 * Create a file router instance
 */
export function createFileRouter(options: FileRouterOptions): FileRouter {
    return new FileRouter(options);
}

/**
 * Extension method for Application to use file-based routing
 * This will be called to register routes from a directory
 * 
 * @example
 * ```typescript
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
 */
export async function useFileRoutes(
    app: Application,
    options: FileRouterOptions
): Promise<void> {
    const router = new FileRouter(options);
    await router.register(app);
}

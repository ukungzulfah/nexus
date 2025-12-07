/**
 * Router implementation with schema validation
 */

import { RadixTree } from './radix-tree';
import {
    HTTPMethod,
    Handler,
    Middleware,
    RouteConfig,
    RouteMatch,
    SchemaConfig,
    RouteMeta,
    Context
} from '../types';

/**
 * Route with validation schema and metadata
 */
interface RouteEntry {
    handler: Handler;
    middlewares: Middleware[];
    schema?: SchemaConfig;
    meta?: RouteMeta;
}

/**
 * Router class
 */
export class Router {
    private trees: Map<HTTPMethod, RadixTree> = new Map();
    private routes: Array<{ method: HTTPMethod; path: string; config: RouteEntry }> = [];

    constructor() {
        // Initialize trees for each HTTP method
        const methods: HTTPMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
        for (const method of methods) {
            this.trees.set(method, new RadixTree());
        }
    }

    /**
     * Register a route
     */
    addRoute(config: RouteConfig): void {
        const { method, path, handler, middlewares = [], schema, meta } = config;

        const tree = this.trees.get(method);
        if (!tree) {
            throw new Error(`Unsupported HTTP method: ${method}`);
        }

        // Wrap handler with schema validation if provided
        const wrappedHandler = schema ? this.wrapWithValidation(handler, schema) : handler;

        tree.insert(path, wrappedHandler, middlewares);

        // Store for introspection (including schema and meta for documentation)
        this.routes.push({
            method,
            path,
            config: { handler: wrappedHandler, middlewares, schema, meta }
        });
    }

    /**
     * Find a matching route
     */
    match(method: string, path: string): RouteMatch | null {
        const tree = this.trees.get(method as HTTPMethod);
        if (!tree) {
            return null;
        }

        const result = tree.search(path);
        if (!result) {
            return null;
        }

        return {
            handler: result.handler,
            params: result.params,
            middlewares: result.middlewares,
            schema: undefined // Schema already applied in wrapped handler
        };
    }

    /**
     * Get all registered routes with full metadata
     */
    getRoutes(): Array<{ method: string; path: string; schema?: SchemaConfig; meta?: RouteMeta }> {
        return this.routes.map(r => ({ 
            method: r.method, 
            path: r.path,
            schema: r.config.schema,
            meta: r.config.meta
        }));
    }

    /**
     * Convenience methods for HTTP verbs
     */
    get(path: string, handler: Handler, options?: Partial<RouteConfig>): void {
        this.addRoute({ method: 'GET', path, handler, ...options });
    }

    post(path: string, handler: Handler, options?: Partial<RouteConfig>): void {
        this.addRoute({ method: 'POST', path, handler, ...options });
    }

    put(path: string, handler: Handler, options?: Partial<RouteConfig>): void {
        this.addRoute({ method: 'PUT', path, handler, ...options });
    }

    delete(path: string, handler: Handler, options?: Partial<RouteConfig>): void {
        this.addRoute({ method: 'DELETE', path, handler, ...options });
    }

    patch(path: string, handler: Handler, options?: Partial<RouteConfig>): void {
        this.addRoute({ method: 'PATCH', path, handler, ...options });
    }

    /**
     * Wrap handler with schema validation
     */
    private wrapWithValidation(handler: Handler, schema: SchemaConfig): Handler {
        return async (ctx: Context) => {
            try {
                // Validate params
                if (schema.params) {
                    ctx.params = await schema.params.parseAsync(ctx.params);
                }

                // Validate query
                if (schema.query) {
                    ctx.query = await schema.query.parseAsync(ctx.query);
                }

                // Validate body
                if (schema.body) {
                    ctx.body = await schema.body.parseAsync(ctx.body);
                }

                // Validate headers
                if (schema.headers) {
                    ctx.headers = await schema.headers.parseAsync(ctx.headers);
                }

                // Call original handler with validated data
                return handler(ctx, {});
            } catch (error: any) {
                // Zod validation error
                if (error.name === 'ZodError') {
                    // Use custom error handler if provided
                    if (schema.onValidationError) {
                        const customResponse = schema.onValidationError(error.errors, ctx);
                        // If it's already a Response object, return it
                        if (customResponse?.statusCode) {
                            return customResponse;
                        }
                        // Otherwise wrap it as JSON response
                        return ctx.json(customResponse, 400);
                    }
                    
                    // Default error response - extract first error message
                    const firstError = error.errors[0];
                    const message = firstError?.message || 'Validation failed';
                    
                    return ctx.json({
                        success: false,
                        message
                    }, 400);
                }
                throw error;
            }
        };
    }
}

// Re-export file router
export { FileRouter, createFileRouter, useFileRoutes } from './file-router';
export type { FileRouterOptions, FileRouteClass, RouteModule } from './file-router';

/**
 * Type-safe middleware system
 * Provides composable middleware with automatic error handling
 */

import { Context, Middleware, Handler, Response, Next, LifecycleHooks } from './types';

/**
 * Middleware executor
 * Executes a chain of middleware and the final handler
 */
export class MiddlewareExecutor {
    /**
     * Execute middleware chain with a final handler
     * Optimized: skip recursion when no middleware
     */
    async execute(
        ctx: Context,
        middlewares: Middleware[],
        handler: Handler,
        deps: any = {}
    ): Promise<Response> {
        const len = middlewares.length;
        
        // Fast path: no middleware - call handler directly
        if (len === 0) {
            return this.executeHandler(ctx, handler, deps);
        }
        
        // Single middleware - no recursion needed
        if (len === 1) {
            return middlewares[0](ctx, async (c) => this.executeHandler(c, handler, deps), deps);
        }
        
        // Multiple middleware - use optimized loop
        let index = 0;

        const next: Next = async (currentCtx: Context): Promise<Response> => {
            if (index < len) {
                const middleware = middlewares[index++];
                return middleware(currentCtx, next, deps);
            }
            return this.executeHandler(currentCtx, handler, deps);
        };

        return next(ctx);
    }
    
    /**
     * Execute handler and normalize response - inlined for performance
     */
    private async executeHandler(ctx: Context, handler: Handler, deps: any): Promise<Response> {
        const result = await handler(ctx, deps);

        // If handler returns an Error, throw it
        if (result instanceof Error) {
            (result as any)._isIntentional = true;
            throw result;
        }

        // Fast path: already a Response
        if (result && typeof result === 'object' && 'statusCode' in result && 'body' in result) {
            return result as Response;
        }

        // Wrap in JSON response
        return ctx.json(result);
    }

    /**
     * Execute middleware chain with lifecycle hooks
     * This method integrates hooks at the appropriate points in the request lifecycle
     * Optimized to check hooks existence only once
     */
    async executeWithHooks(
        ctx: Context,
        middlewares: Middleware[],
        handler: Handler,
        hooks: LifecycleHooks,
        deps: any = {}
    ): Promise<Response> {
        // Check if we have any hooks at all (optimization)
        const hasHooks = hooks.beforeValidation || hooks.afterValidation || 
                         hooks.beforeHandler || hooks.afterHandler;
        
        // Fast path: no hooks and no middleware
        if (!hasHooks && middlewares.length === 0) {
            return this.executeHandler(ctx, handler, deps);
        }

        // Fast path: no hooks but has middleware
        if (!hasHooks) {
            return this.execute(ctx, middlewares, handler, deps);
        }

        let index = 0;
        const len = middlewares.length;

        const next: Next = async (currentCtx: Context): Promise<Response> => {
            if (index < len) {
                const middleware = middlewares[index++];
                return middleware(currentCtx, next, deps);
            }
            
            // All middleware executed, now run handler with hooks
            
            // === HOOK: beforeValidation ===
            if (hooks.beforeValidation) {
                const hookResult = await hooks.beforeValidation(currentCtx);
                if (hookResult && typeof hookResult === 'object' && 'statusCode' in hookResult) {
                    return hookResult as Response;
                }
            }

            // === HOOK: afterValidation ===
            if (hooks.afterValidation) {
                const hookResult = await hooks.afterValidation(currentCtx);
                if (hookResult && typeof hookResult === 'object' && 'statusCode' in hookResult) {
                    return hookResult as Response;
                }
            }

            // === HOOK: beforeHandler ===
            if (hooks.beforeHandler) {
                const hookResult = await hooks.beforeHandler(currentCtx);
                if (hookResult && typeof hookResult === 'object' && 'statusCode' in hookResult) {
                    return hookResult as Response;
                }
            }

            // Execute the handler with dependencies
            let result = await handler(currentCtx, deps);

            // If handler returns an Error, throw it
            if (result instanceof Error) {
                (result as any)._isIntentional = true;
                throw result;
            }

            // === HOOK: afterHandler ===
            if (hooks.afterHandler) {
                const transformedResult = await hooks.afterHandler(currentCtx, result);
                if (transformedResult !== undefined) {
                    result = transformedResult;
                }
            }

            // If result is a Response, return it
            if (result && typeof result === 'object' && 'statusCode' in result && 'body' in result) {
                return result as Response;
            }

            // Otherwise, wrap in JSON response
            return currentCtx.json(result);
        };

        return next(ctx);
    }

    /**
     * Compose multiple middleware into a single middleware function
     */
    compose(middlewares: Middleware[]): Middleware {
        return async (ctx: Context, next: Next, deps: any): Promise<Response> => {
            let index = 0;

            const dispatch = async (i: number, currentCtx: Context): Promise<Response> => {
                if (i >= middlewares.length) {
                    return next(currentCtx);
                }

                const middleware = middlewares[i];
                index = i + 1;

                return middleware(currentCtx, (nextCtx) => dispatch(index, nextCtx), deps);
            };

            return dispatch(0, ctx);
        };
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
}

/**
 * Built-in middleware utilities
 */

/**
 * Logger middleware
 */
export function logger(): Middleware {
    return async (ctx, next, _deps) => {
        const start = Date.now();
        console.log(`--> ${ctx.method} ${ctx.path}`);

        try {
            const response = await next(ctx);
            const duration = Date.now() - start;
            console.log(`<-- ${ctx.method} ${ctx.path} ${response.statusCode} ${duration}ms`);
            return response;
        } catch (error) {
            const duration = Date.now() - start;
            console.error(`<-- ${ctx.method} ${ctx.path} ERROR ${duration}ms`);
            throw error;
        }
    };
}

/**
 * CORS middleware
 */
export function cors(options: {
    origin?: string | string[];
    methods?: string[];
    credentials?: boolean;
    maxAge?: number;
} = {}): Middleware {
    const {
        origin = '*',
        methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        credentials = false,
        maxAge = 86400
    } = options;

    return async (ctx, next, _deps) => {
        const response = await next(ctx);

        // Set CORS headers
        response.headers['Access-Control-Allow-Origin'] = Array.isArray(origin) ? origin.join(',') : origin;
        response.headers['Access-Control-Allow-Methods'] = methods.join(',');
        response.headers['Access-Control-Max-Age'] = maxAge.toString();

        if (credentials) {
            response.headers['Access-Control-Allow-Credentials'] = 'true';
        }

        // Handle preflight
        if (ctx.method === 'OPTIONS') {
            response.statusCode = 204;
            response.body = '';
        }

        return response;
    };
}

/**
 * Error handling middleware wrapper
 */
export function errorHandler(
    handler: (error: Error, ctx: Context) => Response | Promise<Response>
): Middleware {
    return async (ctx, next, _deps) => {
        try {
            return await next(ctx);
        } catch (error) {
            return handler(error as Error, ctx);
        }
    };
}

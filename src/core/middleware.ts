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
     */
    async execute(
        ctx: Context,
        middlewares: Middleware[],
        handler: Handler,
        deps: any = {}
    ): Promise<Response> {
        let index = 0;

        const next: Next = async (currentCtx: Context): Promise<Response> => {
            if (index < middlewares.length) {
                const middleware = middlewares[index++];

                try {
                    // Execute middleware with next function and dependencies
                    return await middleware(currentCtx, next, deps);
                } catch (error) {
                    // Propagate error to be caught by error handler
                    throw error;
                }
            } else {
                // All middleware executed, call final handler
                try {
                    const result = await handler(currentCtx, deps);

                    // If handler returns an Error, throw it to be caught by error handler
                    if (result instanceof Error) {
                        // Mark as intentional (returned, not thrown)
                        (result as any)._isIntentional = true;
                        throw result;
                    }

                    // If handler returns a Response, use it
                    if (this.isResponse(result)) {
                        return result;
                    }

                    // Otherwise, wrap in JSON response
                    return currentCtx.json(result);
                } catch (error) {
                    throw error;
                }
            }
        };

        return next(ctx);
    }

    /**
     * Execute middleware chain with lifecycle hooks
     * This method integrates hooks at the appropriate points in the request lifecycle
     */
    async executeWithHooks(
        ctx: Context,
        middlewares: Middleware[],
        handler: Handler,
        hooks: LifecycleHooks,
        deps: any = {}
    ): Promise<Response> {
        let index = 0;

        const next: Next = async (currentCtx: Context): Promise<Response> => {
            if (index < middlewares.length) {
                const middleware = middlewares[index++];

                try {
                    // Execute middleware with next function and dependencies
                    return await middleware(currentCtx, next, deps);
                } catch (error) {
                    throw error;
                }
            } else {
                // All middleware executed, now run handler with hooks
                
                // === HOOK: beforeValidation ===
                if (hooks.beforeValidation) {
                    const hookResult = await hooks.beforeValidation(currentCtx);
                    if (this.isResponse(hookResult)) {
                        return hookResult;
                    }
                }

                // TODO: Schema validation happens here (if route has schema)
                // For now, validation is handled in middleware or by the handler itself

                // === HOOK: afterValidation ===
                if (hooks.afterValidation) {
                    const hookResult = await hooks.afterValidation(currentCtx);
                    if (this.isResponse(hookResult)) {
                        return hookResult;
                    }
                }

                // === HOOK: beforeHandler ===
                if (hooks.beforeHandler) {
                    const hookResult = await hooks.beforeHandler(currentCtx);
                    if (this.isResponse(hookResult)) {
                        return hookResult;
                    }
                }

                // Execute the handler with dependencies
                try {
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
                    if (this.isResponse(result)) {
                        return result;
                    }

                    // Otherwise, wrap in JSON response
                    return currentCtx.json(result);
                } catch (error) {
                    throw error;
                }
            }
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

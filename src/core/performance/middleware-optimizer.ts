/**
 * Middleware Optimizer
 * Provides utilities for composing and optimizing middleware chains
 */

import { Handler, Middleware } from '../types';

/**
 * Optimization statistics
 */
interface OptimizationStats {
    cachedHandlers: number;
    cachedMiddlewares: number;
    composedChains: number;
}

/**
 * Middleware Optimizer
 * Caches and composes middleware chains for better performance
 */
export class MiddlewareOptimizer {
    private handlerCache: WeakMap<Handler, Handler> = new WeakMap();
    private middlewareCache: WeakMap<Middleware, Middleware> = new WeakMap();
    private stats: OptimizationStats = {
        cachedHandlers: 0,
        cachedMiddlewares: 0,
        composedChains: 0
    };

    /**
     * Cache a handler to avoid repeated wrapping
     */
    cacheHandler(handler: Handler): Handler {
        const cached = this.handlerCache.get(handler);
        if (cached) return cached;

        // Store reference for caching
        this.handlerCache.set(handler, handler);
        this.stats.cachedHandlers++;

        return handler;
    }

    /**
     * Cache middleware functions
     */
    cacheMiddleware(middlewares: Middleware[]): Middleware[] {
        return middlewares.map(mw => {
            const cached = this.middlewareCache.get(mw);
            if (cached) return cached;

            this.middlewareCache.set(mw, mw);
            this.stats.cachedMiddlewares++;

            return mw;
        });
    }

    /**
     * Compose middleware chain into single function
     * Reduces function call overhead for frequently used routes
     */
    compose(middlewares: Middleware[]): Middleware {
        if (middlewares.length === 0) {
            return async (ctx, next, _deps) => next(ctx);
        }

        if (middlewares.length === 1) {
            return middlewares[0];
        }

        this.stats.composedChains++;

        // Create composed middleware that reduces call stack depth
        return async (ctx, next, deps) => {
            let index = 0;

            const dispatch = async (currentCtx: any): Promise<any> => {
                if (index >= middlewares.length) {
                    return next(currentCtx);
                }

                const mw = middlewares[index++];
                return mw(currentCtx, dispatch, deps);
            };

            return dispatch(ctx);
        };
    }

    /**
     * Get optimization statistics
     */
    getStats(): OptimizationStats {
        return { ...this.stats };
    }

    /**
     * Clear caches
     */
    clearCache(): void {
        this.handlerCache = new WeakMap();
        this.middlewareCache = new WeakMap();
        this.stats.cachedHandlers = 0;
        this.stats.cachedMiddlewares = 0;
        this.stats.composedChains = 0;
    }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
    private metrics: Map<string, { count: number; totalTime: number; avgTime: number }> = new Map();

    /**
     * Measure execution time of a function
     */
    async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const start = performance.now();

        try {
            return await fn();
        } finally {
            const duration = performance.now() - start;
            this.recordMetric(name, duration);
        }
    }

    /**
     * Record a metric
     */
    private recordMetric(name: string, duration: number): void {
        const existing = this.metrics.get(name);

        if (existing) {
            existing.count++;
            existing.totalTime += duration;
            existing.avgTime = existing.totalTime / existing.count;
        } else {
            this.metrics.set(name, {
                count: 1,
                totalTime: duration,
                avgTime: duration
            });
        }
    }

    /**
     * Get all metrics
     */
    getMetrics() {
        return Object.fromEntries(this.metrics);
    }

    /**
     * Clear metrics
     */
    clearMetrics(): void {
        this.metrics.clear();
    }
}

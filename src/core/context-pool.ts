/**
 * Context pooling for performance optimization
 * Reuses context objects to reduce garbage collection pressure
 */

import { IncomingMessage, ServerResponse } from 'http';
import { ContextImpl, parseBody } from './context';
import { Context } from './types';

/**
 * Context pool implementation
 * Maintains a pool of reusable context objects
 */
export class ContextPool {
    private pool: ContextImpl[] = [];
    private maxSize: number;
    private created: number = 0;
    private reused: number = 0;

    constructor(maxSize: number = 100) {
        this.maxSize = maxSize;
    }

    /**
     * Acquire a context from the pool or create a new one
     */
    async acquire(req: IncomingMessage, res: ServerResponse): Promise<Context> {
        let ctx: ContextImpl;

        // Try to reuse from pool
        if (this.pool.length > 0) {
            ctx = this.pool.pop()!;
            this.reused++;
            await this.reset(ctx, req, res);
        } else {
            // Create new context
            ctx = new ContextImpl(req, res);
            this.created++;
        }

        // Parse body if applicable
        if (this.hasBody(req)) {
            const body = await parseBody(req);
            ctx.setBody(body);
        }

        return ctx;
    }

    /**
     * Release a context back to the pool
     */
    release(ctx: Context): void {
        if (this.pool.length < this.maxSize) {
            // Clear sensitive data before pooling
            this.clearContext(ctx as ContextImpl);
            this.pool.push(ctx as ContextImpl);
        }
        // If pool is full, let GC handle it
    }

    /**
     * Reset context for reuse  
     */
    private async reset(
        ctx: ContextImpl,
        req: IncomingMessage,
        res: ServerResponse
    ): Promise<void> {
        // Recreate the context with new request/response
        const newCtx = new ContextImpl(req, res);

        // Copy properties
        Object.assign(ctx, newCtx);
    }

    /**
     * Clear sensitive data from context
     */
    private clearContext(ctx: ContextImpl): void {
        ctx.params = {};
        ctx.query = {};
        ctx.body = null;

        // Clear custom properties added by middleware
        const knownProps = new Set([
            'method', 'path', 'url', 'params', 'query', 'body',
            'headers', 'cookies', 'raw', 'response',
            'json', 'html', 'text', 'redirect', 'stream',
            'setParams', 'setBody', 'getSetCookieHeaders'
        ]);

        for (const key in ctx) {
            if (!knownProps.has(key)) {
                delete (ctx as any)[key];
            }
        }
    }

    /**
     * Check if request has a body
     */
    private hasBody(req: IncomingMessage): boolean {
        const method = req.method?.toUpperCase();
        return method === 'POST' || method === 'PUT' || method === 'PATCH';
    }

    /**
     * Get pool statistics
     */
    getStats() {
        return {
            poolSize: this.pool.length,
            maxSize: this.maxSize,
            created: this.created,
            reused: this.reused,
            hitRate: this.created > 0 ? this.reused / (this.created + this.reused) : 0
        };
    }

    /**
     * Clear the entire pool
     */
    clear(): void {
        this.pool = [];
    }
}

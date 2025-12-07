/**
 * Context pooling for performance optimization
 * Reuses context objects to reduce garbage collection pressure
 */

import { IncomingMessage, ServerResponse } from 'http';
import { ContextImpl } from './context';
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
     * Body parsing is now lazy - handlers should use ctx.getBody() for POST/PUT/PATCH
     */
    acquire(req: IncomingMessage, res: ServerResponse): Context {
        let ctx: ContextImpl;

        // Try to reuse from pool
        if (this.pool.length > 0) {
            ctx = this.pool.pop()!;
            this.reused++;
            // Use reinitialize instead of creating new object
            ctx.reinitialize(req, res);
        } else {
            // Create new context
            ctx = new ContextImpl(req, res);
            this.created++;
        }

        // Body parsing removed - now lazy via ctx.getBody()
        // This matches Fastify's architecture for optimal POST performance

        return ctx;
    }

    /**
     * Release a context back to the pool
     */
    release(ctx: Context): void {
        if (this.pool.length < this.maxSize) {
            // Just push back - reinitialize will handle reset
            this.pool.push(ctx as ContextImpl);
        }
        // If pool is full, let GC handle it
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

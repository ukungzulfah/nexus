/**
 * In-Memory Rate Limiter
 * 
 * Simple in-memory rate limiting implementation
 */

import type { RateLimitAdapter } from '../adapter';
import type { RateLimitInfo } from '../types';

interface RateLimitEntry {
    count: number;
    resetTime: number;
    firstRequest: number;
}

/**
 * In-memory rate limit storage
 * Uses sliding window algorithm
 */
export class MemoryRateLimiter implements RateLimitAdapter {
    private store = new Map<string, RateLimitEntry>();
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(cleanupIntervalMs: number = 60000) {
        // Periodic cleanup of expired entries
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, cleanupIntervalMs);
    }

    async increment(key: string, windowMs: number): Promise<{
        count: number;
        resetTime: number;
    }> {
        const now = Date.now();
        const entry = this.store.get(key);

        // No existing entry or expired
        if (!entry || now >= entry.resetTime) {
            const newEntry: RateLimitEntry = {
                count: 1,
                resetTime: now + windowMs,
                firstRequest: now
            };
            this.store.set(key, newEntry);

            return {
                count: 1,
                resetTime: newEntry.resetTime
            };
        }

        // Increment existing entry
        entry.count++;

        return {
            count: entry.count,
            resetTime: entry.resetTime
        };
    }

    async get(key: string): Promise<RateLimitInfo | null> {
        const entry = this.store.get(key);

        if (!entry) {
            return null;
        }

        const now = Date.now();

        // Expired
        if (now >= entry.resetTime) {
            this.store.delete(key);
            return null;
        }

        return {
            limit: -1, // Will be set by middleware
            remaining: -1, // Will be calculated by middleware
            reset: Math.floor(entry.resetTime / 1000),
            retryAfter: Math.ceil((entry.resetTime - now) / 1000)
        };
    }

    async reset(key: string): Promise<void> {
        this.store.delete(key);
    }

    async cleanup(): Promise<void> {
        const now = Date.now();

        for (const [key, entry] of this.store.entries()) {
            if (now >= entry.resetTime) {
                this.store.delete(key);
            }
        }
    }

    /**
     * Stop cleanup interval
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

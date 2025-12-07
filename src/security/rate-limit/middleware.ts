/**
 * Rate Limiting Middleware
 * 
 * Adaptive rate limiting with various strategies
 */

import type { Context, Next, Middleware } from '../../core/types';
import type { RateLimitConfig, RateLimitInfo } from '../types';
import type { RateLimitAdapter } from '../adapter';
import { MemoryRateLimiter } from './memory';

/**
 * Parse time window string to milliseconds
 */
function parseWindow(window: number | string): number {
    if (typeof window === 'number') {
        return window;
    }

    const match = window.match(/^(\d+)([smhd])$/);
    if (!match) {
        throw new Error('Invalid window format');
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
        s: 1000,
        m: 60000,
        h: 3600000,
        d: 86400000
    };

    return value * multipliers[unit];
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(ctx: Context): string {
    // Try to get real IP from headers
    const forwardedRaw = ctx.headers['x-forwarded-for'] || ctx.headers['X-Forwarded-For'];
    if (forwardedRaw) {
        const forwarded = Array.isArray(forwardedRaw) ? forwardedRaw[0] : forwardedRaw;
        if (forwarded) {
            return forwarded.split(',')[0].trim();
        }
    }

    const realIpRaw = ctx.headers['x-real-ip'] || ctx.headers['X-Real-IP'];
    if (realIpRaw) {
        const realIp = Array.isArray(realIpRaw) ? realIpRaw[0] : realIpRaw;
        if (realIp) {
            return realIp;
        }
    }

    // Fallback to generic key
    return 'unknown';
}

/**
 * Create rate limiting middleware
 * 
 * @example
 * ```ts
 * app.use(rateLimit({
 *   window: '15m',
 *   max: 100,
 *   routes: {
 *     'POST /api/login': { max: 5, window: '5m' }
 *   }
 * }));
 * ```
 */
export function rateLimit(
    config: RateLimitConfig,
    adapter?: RateLimitAdapter
): Middleware {
    const store = adapter || new MemoryRateLimiter();
    const keyGenerator = config.keyGenerator || defaultKeyGenerator;
    const message = config.message || 'Too many requests';
    const statusCode = config.statusCode || 429;

    return async (ctx: Context, next: Next, _deps: any) => {
        // Generate rate limit key
        const baseKey = keyGenerator(ctx);

        // Check for route-specific limits
        let routeConfig = config;
        if (config.routes) {
            const routeKey = `${ctx.method} ${ctx.path}`;

            // Try exact match
            if (config.routes[routeKey]) {
                routeConfig = {
                    ...config,
                    ...config.routes[routeKey]
                };
            } else {
                // Try wildcard match
                for (const [pattern, limits] of Object.entries(config.routes)) {
                    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
                    if (regex.test(routeKey)) {
                        routeConfig = {
                            ...config,
                            ...limits
                        };
                        break;
                    }
                }
            }
        }

        const finalWindowMs = parseWindow(routeConfig.window);
        const finalMax = routeConfig.max;
        const key = `ratelimit:${baseKey}:${ctx.path}`;

        // Increment counter
        const { count, resetTime } = await store.increment(key, finalWindowMs);

        // Attach rate limit info to context
        const rateLimitInfo: RateLimitInfo = {
            limit: finalMax,
            remaining: Math.max(0, finalMax - count),
            reset: Math.floor(resetTime / 1000),
            retryAfter: count > finalMax ? Math.ceil((resetTime - Date.now()) / 1000) : undefined
        };

        (ctx as any).rateLimit = rateLimitInfo;

        // Check if limit exceeded
        if (count > finalMax) {
            return {
                statusCode,
                headers: {
                    'Content-Type': 'application/json',
                    'X-RateLimit-Limit': finalMax.toString(),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': rateLimitInfo.reset.toString(),
                    'Retry-After': rateLimitInfo.retryAfter?.toString() || '60'
                },
                body: JSON.stringify({
                    error: message,
                    retryAfter: rateLimitInfo.retryAfter
                })
            };
        }

        // Add rate limit headers
        const response = await next(ctx);

        response.headers['X-RateLimit-Limit'] = finalMax.toString();
        response.headers['X-RateLimit-Remaining'] = rateLimitInfo.remaining.toString();
        response.headers['X-RateLimit-Reset'] = rateLimitInfo.reset.toString();

        return response;
    };
}

/**
 * Strict rate limiting for sensitive endpoints
 */
export function strictRateLimit(max: number = 5, window: string | number = '5m'): Middleware {
    return rateLimit({
        window,
        max,
        message: 'Too many attempts, please try again later'
    });
}

/**
 * Lenient rate limiting for public endpoints
 */
export function lenientRateLimit(max: number = 1000, window: string | number = '15m'): Middleware {
    return rateLimit({
        window,
        max
    });
}

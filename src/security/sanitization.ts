/**
 * Input Sanitization Middleware
 * 
 * Automatically sanitizes request inputs to prevent common attacks
 */

import type { Context, Next, Middleware } from '../core/types';
import type { SanitizationConfig } from './types';
import type { SanitizationAdapter } from './adapter';
import { DefaultSanitizationAdapter } from './adapter';

/**
 * Create input sanitization middleware
 * 
 * @example
 * ```ts
 * app.use(sanitizeInput({
 *   fields: ['body', 'query', 'params'],
 *   strict: false
 * }));
 * ```
 */
export function sanitizeInput(
    config: SanitizationConfig = {},
    adapter?: SanitizationAdapter
): Middleware {
    const adapterInstance = adapter || new DefaultSanitizationAdapter();
    const fields = config.fields || ['body', 'query', 'params'];
    const enabled = config.enabled !== false;

    return async (ctx: Context, next: Next) => {
        if (!enabled) {
            return next(ctx);
        }

        // Sanitize specified fields
        for (const field of fields) {
            if (field in ctx && ctx[field]) {
                try {
                    (ctx as any)[field] = adapterInstance.sanitize(
                        ctx[field],
                        config
                    );
                } catch (error) {
                    // In strict mode, adapter throws on malicious input
                    throw new Error(`Malicious input detected in ${field}`);
                }
            }
        }

        return next(ctx);
    };
}

/**
 * Strict sanitization - throws on malicious input
 */
export function strictSanitization(customConfig: Partial<SanitizationConfig> = {}): Middleware {
    return sanitizeInput({
        fields: ['body', 'query', 'params'],
        strict: true,
        ...customConfig
    });
}

/**
 * Lenient sanitization - silently removes malicious content
 */
export function lenientSanitization(customConfig: Partial<SanitizationConfig> = {}): Middleware {
    return sanitizeInput({
        fields: ['body', 'query', 'params'],
        strict: false,
        ...customConfig
    });
}

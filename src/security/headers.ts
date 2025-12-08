/**
 * Security Headers Middleware
 * 
 * Automatically applies security headers to responses
 */

import type { Context, Next, Middleware } from '../core/types';
import type { SecurityHeadersConfig } from './types';
import type { SecurityHeadersAdapter } from './adapter';
import { DefaultSecurityHeadersAdapter } from './adapter';

/**
 * Create security headers middleware
 * 
 * @example
 * ```ts
 * app.use(securityHeaders({
 *   mode: 'strict',
 *   csp: {
 *     directives: {
 *       'default-src': ["'self'"],
 *       'script-src': ["'self'", "'nonce'"]
 *     }
 *   }
 * }));
 * ```
 */
export function securityHeaders(
    config: SecurityHeadersConfig = {},
    adapter?: SecurityHeadersAdapter
): Middleware {
    const adapterInstance = adapter || new DefaultSecurityHeadersAdapter();
    const nonces = new WeakMap<Context, string>();

    return async (ctx: Context, next: Next, _deps: any) => {
        // Generate nonce if CSP uses it
        if (config.autoNonce && config.csp) {
            const nonce = adapterInstance.generateNonce?.() || crypto.randomUUID();
            nonces.set(ctx, nonce);

            // Replace 'nonce' placeholder in CSP directives
            if (config.csp.directives) {
                for (const [key, values] of Object.entries(config.csp.directives)) {
                    config.csp.directives[key] = values.map(v =>
                        v === "'nonce'" ? `'nonce-${nonce}'` : v
                    );
                }
            }

            // Attach nonce to context for use in templates
            (ctx as any).nonce = nonce;
        }

        // Generate headers
        const headers = adapterInstance.generateHeaders(ctx, config);

        // Execute handler
        const response = await next(ctx);

        // Apply headers to response (don't override if already set)
        for (const [name, value] of Object.entries(headers)) {
            // Skip if response already has this header (e.g., playground sets its own CSP)
            if (!response.headers[name]) {
                response.headers[name] = value;
            }
        }

        return response;
    };
}

/**
 * Strict security headers preset
 */
export function strictSecurityHeaders(customConfig: Partial<SecurityHeadersConfig> = {}): Middleware {
    return securityHeaders({
        mode: 'strict',
        csp: {
            directives: {
                'default-src': ["'self'"],
                'script-src': ["'self'"],
                'style-src': ["'self'"],
                'img-src': ["'self'", 'data:', 'https:'],
                'font-src': ["'self'"],
                'connect-src': ["'self'"],
                'frame-ancestors': ["'none'"],
                'base-uri': ["'self'"],
                'form-action': ["'self'"]
            }
        },
        ...customConfig
    });
}

/**
 * Moderate security headers preset
 */
export function moderateSecurityHeaders(customConfig: Partial<SecurityHeadersConfig> = {}): Middleware {
    return securityHeaders({
        mode: 'moderate',
        csp: {
            directives: {
                'default-src': ["'self'"],
                'script-src': ["'self'", "'unsafe-inline'"],
                'style-src': ["'self'", "'unsafe-inline'"],
                'img-src': ["'self'", 'data:', 'https:']
            }
        },
        ...customConfig
    });
}

/**
 * CSRF Protection Middleware
 * 
 * Implements Cross-Site Request Forgery protection
 */

import type { Context, Next, Middleware } from '../core/types';
import type { CSRFConfig } from './types';
import type { CSRFAdapter } from './adapter';

/**
 * Default CSRF token adapter
 * Uses double-submit cookie pattern
 */
class DefaultCSRFAdapter implements CSRFAdapter {
    private readonly tokenLength: number;

    constructor(tokenLength: number = 32) {
        this.tokenLength = tokenLength;
    }

    generateToken(_ctx: Context): string {
        // Generate random token
        const bytes = crypto.getRandomValues(new Uint8Array(this.tokenLength));
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    validateToken(ctx: Context, token: string): boolean {
        // In double-submit cookie pattern, token in cookie should match token in header/body
        const cookieToken = this.extractTokenFromCookie(ctx);

        if (!cookieToken) {
            return false;
        }

        // Constant-time comparison to prevent timing attacks
        return this.constantTimeCompare(token, cookieToken);
    }

    extractToken(ctx: Context): string | null {
        // Try header first
        const csrfHeader = ctx.headers['x-csrf-token'] || ctx.headers['X-CSRF-Token'];
        if (csrfHeader) {
            return Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
        }

        const csrfTokenHeader = ctx.headers['csrf-token'] || ctx.headers['CSRF-Token'];
        if (csrfTokenHeader) {
            return Array.isArray(csrfTokenHeader) ? csrfTokenHeader[0] : csrfTokenHeader;
        }

        // Try body
        if (ctx.body && typeof ctx.body === 'object') {
            return (ctx.body as any)._csrf || (ctx.body as any).csrf_token || null;
        }

        return null;
    }

    private extractTokenFromCookie(ctx: Context): string | null {
        const cookieHeaderRaw = ctx.headers['cookie'] || ctx.headers['Cookie'];
        if (!cookieHeaderRaw) {
            return null;
        }

        const cookieHeader = Array.isArray(cookieHeaderRaw) ? cookieHeaderRaw[0] : cookieHeaderRaw;

        const match = cookieHeader.match(/_csrf=([^;]+)/);
        return match ? match[1] : null;
    }

    private constantTimeCompare(a: string, b: string): boolean {
        if (a.length !== b.length) {
            return false;
        }

        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }

        return result === 0;
    }
}

/**
 * CSRF protection middleware
 * 
 * @example
 * ```ts
 * app.use(csrf({
 *   cookie: { sameSite: 'strict' },
 *   excludeRoutes: ['/api/webhook/*']
 * }));
 * ```
 */
export function csrf(
    config: CSRFConfig = {},
    adapter?: CSRFAdapter
): Middleware {
    const csrfAdapter = adapter || new DefaultCSRFAdapter(config.tokenLength);
    const auto = config.auto !== false;
    const excludeMethods = config.excludeMethods || ['GET', 'HEAD', 'OPTIONS'];
    const excludeRoutes = config.excludeRoutes || [];

    return async (ctx: Context, next: Next, _deps: any) => {
        // Skip safe methods
        if (excludeMethods.includes(ctx.method)) {
            return next(ctx);
        }

        // Skip excluded routes
        for (const pattern of excludeRoutes) {
            const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
            if (regex.test(ctx.path)) {
                return next(ctx);
            }
        }

        // Validate CSRF token
        if (auto) {
            const token = csrfAdapter.extractToken(ctx);

            if (!token) {
                return {
                    statusCode: 403,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        error: 'CSRF token missing'
                    })
                };
            }

            const valid = csrfAdapter.validateToken(ctx, token);

            if (!valid) {
                return {
                    statusCode: 403,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        error: 'CSRF token invalid'
                    })
                };
            }
        }

        return next(ctx);
    };
}

/**
 * Generate CSRF token middleware
 * Attaches token to context and sets cookie
 * 
 * @example
 * ```ts
 * app.use(generateCSRFToken());
 * 
 * // In handler
 * app.get('/form', async (ctx) => {
 *   const token = ctx.csrfToken;
 *   return ctx.html(`<input type="hidden" name="_csrf" value="${token}">`);
 * });
 * ```
 */
export function generateCSRFToken(
    config: CSRFConfig = {},
    adapter?: CSRFAdapter
): Middleware {
    const csrfAdapter = adapter || new DefaultCSRFAdapter(config.tokenLength);
    const cookieName = config.cookie?.name || '_csrf';
    const cookieOptions = {
        sameSite: config.cookie?.sameSite || 'strict',
        secure: config.cookie?.secure !== false,
        httpOnly: config.cookie?.httpOnly !== false
    };

    return async (ctx: Context, next: Next, _deps: any) => {
        // Generate token
        const token = csrfAdapter.generateToken(ctx);

        // Attach to context
        (ctx as any).csrfToken = token;

        // Execute handler
        const response = await next(ctx);

        // Set cookie
        const cookieValue = `${cookieName}=${token}; SameSite=${cookieOptions.sameSite}${cookieOptions.secure ? '; Secure' : ''}${cookieOptions.httpOnly ? '; HttpOnly' : ''}; Path=/`;

        // Append cookie to response headers
        if (!response.headers['Set-Cookie']) {
            response.headers['Set-Cookie'] = cookieValue;
        } else if (Array.isArray(response.headers['Set-Cookie'])) {
            response.headers['Set-Cookie'].push(cookieValue);
        } else {
            response.headers['Set-Cookie'] = [response.headers['Set-Cookie'], cookieValue];
        }

        return response;
    };
}

/**
 * Combined CSRF middleware - generates and validates tokens
 */
export function csrfProtection(config: CSRFConfig = {}): Middleware {
    const generateMiddleware = generateCSRFToken(config);
    const validateMiddleware = csrf(config);

    return async (ctx: Context, next: Next, deps: any) => {
        // First generate token
        return generateMiddleware(ctx, async (ctxWithToken: Context) => {
            // Then validate on unsafe methods
            return validateMiddleware(ctxWithToken, next, deps);
        }, deps);
    };
}

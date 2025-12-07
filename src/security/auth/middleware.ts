/**
 * Authentication Middleware
 * 
 * Provides authentication and authorization middleware
 */

import type { Context, Next, Middleware } from '../../core/types';
import type { User, AuthContext, AuthStrategies } from '../types';
import type { AuthAdapter, PermissionAdapter } from '../adapter';
import { DefaultPermissionAdapter } from '../adapter';
import { JWTAuthAdapter } from './jwt';

/**
 * Authentication middleware factory
 * 
 * @example
 * ```ts
 * // JWT authentication
 * app.use(authenticate({
 *   jwt: {
 *     secret: process.env.JWT_SECRET,
 *     expiresIn: '15m'
 *   }
 * }));
 * 
 * // Optional authentication
 * app.use(authenticate({ jwt: config }, { required: false }));
 * ```
 */
export function authenticate(
    strategies: AuthStrategies,
    options: {
        required?: boolean;
        strategies?: ('jwt' | 'oauth' | 'session')[];
    } = {}
): Middleware<Context, AuthContext> {
    const adapters = new Map<string, AuthAdapter>();
    const required = options.required !== false;
    const strategyOrder = options.strategies || ['jwt', 'oauth', 'session'];

    // Initialize adapters
    if (strategies.jwt) {
        adapters.set('jwt', new JWTAuthAdapter());
    }
    // OAuth and Session will be added in future
    // if (strategies.oauth) adapters.set('oauth', new OAuthAdapter());
    // if (strategies.session) adapters.set('session', new SessionAdapter());

    return (async (ctx: Context, next: Next, _deps: any) => {
        let user: User | null = null;

        // Try each strategy in order
        for (const strategyName of strategyOrder) {
            const adapter = adapters.get(strategyName);
            const config = (strategies as any)[strategyName];

            if (adapter && config) {
                try {
                    user = await adapter.verify(ctx, config);
                    if (user) {
                        break;
                    }
                } catch (error) {
                    // Try next strategy
                    continue;
                }
            }
        }

        // If no user found and auth is required
        if (!user && required) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        // Attach user to context
        (ctx as unknown as AuthContext).user = user!;

        return next(ctx as unknown as AuthContext);
    }) as Middleware<Context, AuthContext>;
}

/**
 * Optional authentication - doesn't throw if no auth provided
 */
export function optionalAuth(strategies: AuthStrategies): Middleware<Context, Partial<AuthContext>> {
    return authenticate(strategies, { required: false }) as any;
}

/**
 * Require authentication - throws 401 if not authenticated
 */
export function requireAuth(strategies: AuthStrategies): Middleware<Context, AuthContext> {
    return authenticate(strategies, { required: true });
}

/**
 * Permission-based authorization middleware
 * 
 * @example
 * ```ts
 * app.post('/admin/users', 
 *   authenticate({ jwt: config }),
 *   requirePermissions(['admin', 'write:users']),
 *   handler
 * );
 * ```
 */
export function requirePermissions(
    permissions: string[],
    adapter?: PermissionAdapter
): Middleware<AuthContext, AuthContext> {
    const permissionChecker = adapter || new DefaultPermissionAdapter();

    return (async (ctx: AuthContext, next: Next, _deps: any) => {
        if (!ctx.user) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        const result = permissionChecker.checkPermissions(ctx.user, permissions);

        if (!result.allowed) {
            return {
                statusCode: 403,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Forbidden',
                    message: 'Insufficient permissions',
                    missing: result.missing
                })
            };
        }

        return next(ctx);
    }) as Middleware<AuthContext, AuthContext>;
}

/**
 * Role-based authorization middleware
 * 
 * @example
 * ```ts
 * app.get('/admin/*', 
 *   authenticate({ jwt: config }),
 *   requireRoles(['admin']),
 *   handler
 * );
 * ```
 */
export function requireRoles(
    roles: string[],
    adapter?: PermissionAdapter
): Middleware<AuthContext, AuthContext> {
    const permissionChecker = adapter || new DefaultPermissionAdapter();

    return (async (ctx: AuthContext, next: Next, _deps: any) => {
        if (!ctx.user) {
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Unauthorized' })
            };
        }

        const hasRole = permissionChecker.checkRoles(ctx.user, roles);

        if (!hasRole) {
            return {
                statusCode: 403,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Forbidden',
                    message: 'Insufficient roles',
                    required: roles
                })
            };
        }

        return next(ctx);
    }) as Middleware<AuthContext, AuthContext>;
}

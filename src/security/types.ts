/**
 * Security Layer Type Definitions
 * 
 * Core types for security features including auth, RBAC, rate limiting
 */

import type { Context } from '../core/types';

/**
 * User type for authenticated contexts
 */
export interface User {
    id: string | number;
    email?: string;
    username?: string;
    roles?: string[];
    permissions?: string[];
    [key: string]: any;
}

/**
 * Context with authenticated user
 */
export interface AuthContext extends Context {
    user: User;
}

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
    /** Preset mode: 'strict' | 'moderate' | 'loose' */
    mode?: 'strict' | 'moderate' | 'loose';

    /** Custom headers to add/override */
    customHeaders?: Record<string, string>;

    /** Content Security Policy configuration */
    csp?: {
        directives?: Record<string, string[]>;
        reportUri?: string;
        reportOnly?: boolean;
    };

    /** Enable auto-nonce generation for CSP */
    autoNonce?: boolean;
}

/**
 * Sanitization pattern configuration
 */
export interface SanitizationPattern {
    name: string;
    pattern: RegExp;
    replacement?: string;
}

/**
 * Input sanitization configuration
 */
export interface SanitizationConfig {
    /** Enable auto-sanitization */
    enabled?: boolean;

    /** Custom patterns to detect */
    patterns?: SanitizationPattern[];

    /** Fields to sanitize (body, query, params) */
    fields?: ('body' | 'query' | 'params')[];

    /** Throw error on detection vs silent sanitization */
    strict?: boolean;
}

/**
 * JWT authentication configuration
 */
export interface JWTConfig {
    /** Secret key for signing */
    secret: string;

    /** Algorithm (default: HS256) */
    algorithm?: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';

    /** Token expiration */
    expiresIn?: string | number;

    /** Refresh token configuration */
    refresh?: {
        enabled: boolean;
        expiresIn?: string | number;
        rotateSecret?: boolean;
    };

    /** Token extraction strategy */
    getToken?: (ctx: Context) => string | null;
}

/**
 * OAuth configuration (placeholder for future implementation)
 */
export interface OAuthConfig {
    provider: 'google' | 'github' | 'facebook' | string;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
    scope?: string[];
}

/**
 * Session configuration (placeholder for future implementation)
 */
export interface SessionConfig {
    store: 'memory' | 'redis' | string;
    secret: string;
    cookie?: {
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: 'strict' | 'lax' | 'none';
        maxAge?: number;
    };
}

/**
 * Authentication strategies
 */
export interface AuthStrategies {
    jwt?: JWTConfig;
    oauth?: OAuthConfig;
    session?: SessionConfig;
}

/**
 * Role definition for RBAC
 */
export interface RoleDefinition {
    name: string;
    permissions: string[];
    inherits?: string[];
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
    allowed: boolean;
    missing?: string[];
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
    /** Time window in milliseconds or string format (e.g., '15m', '1h') */
    window: number | string;

    /** Maximum requests per window */
    max: number;

    /** Storage backend */
    store?: 'memory' | 'redis' | string;

    /** Key generator function */
    keyGenerator?: (ctx: Context) => string;

    /** Per-route limits */
    routes?: Record<string, { max: number; window: number | string }>;

    /** Suspicious behavior detection */
    suspicious?: {
        failedLogins?: {
            max: number;
            window: number | string;
            action: 'captcha' | 'block' | 'throttle';
        };
        rapidRequests?: {
            threshold: number;
            window: number | string;
            action: 'throttle' | 'block';
        };
    };

    /** Message to send when rate limited */
    message?: string;

    /** Status code to send when rate limited */
    statusCode?: number;
}

/**
 * Rate limit info attached to context
 */
export interface RateLimitInfo {
    limit: number;
    remaining: number;
    reset: number; // timestamp
    retryAfter?: number; // seconds
}

/**
 * CSRF protection configuration
 */
export interface CSRFConfig {
    /** Enable automatic token generation and validation */
    auto?: boolean;

    /** Cookie configuration */
    cookie?: {
        name?: string;
        sameSite?: 'strict' | 'lax' | 'none';
        secure?: boolean;
        httpOnly?: boolean;
    };

    /** Token field name in body */
    tokenField?: string;

    /** Header field name */
    headerField?: string;

    /** Methods to exclude from CSRF check */
    excludeMethods?: string[];

    /** Routes to exclude from CSRF check */
    excludeRoutes?: string[];

    /** Token length */
    tokenLength?: number;
}

/**
 * Security event for logging/monitoring
 */
export interface SecurityEvent {
    type: 'auth_failed' | 'rate_limit' | 'csrf_failed' | 'xss_detected' | 'sql_injection_detected';
    timestamp: number;
    ip: string;
    path: string;
    details?: any;
}

/**
 * Security Adapter Interfaces
 * 
 * Extensible adapter system for security components
 */

import type { Context } from '../core/types';
import type {
    User,
    SecurityHeadersConfig,
    SanitizationConfig,
    RateLimitInfo,
    PermissionCheckResult
} from './types';

/**
 * Security headers adapter interface
 * Allows custom security headers implementation
 */
export interface SecurityHeadersAdapter {
    /**
     * Generate security headers for response
     */
    generateHeaders(ctx: Context, config: SecurityHeadersConfig): Record<string, string>;

    /**
     * Generate CSP nonce if needed
     */
    generateNonce?(): string;
}

/**
 * Input sanitization adapter interface
 * Allows custom sanitization logic
 */
export interface SanitizationAdapter {
    /**
     * Sanitize input value
     * @returns Sanitized value or throws if in strict mode
     */
    sanitize(value: any, config: SanitizationConfig): any;

    /**
     * Check if value contains malicious patterns
     */
    isMalicious(value: any, config: SanitizationConfig): boolean;
}

/**
 * Base authentication adapter interface
 */
export interface AuthAdapter<TConfig = any> {
    /**
     * Verify credentials and return user
     * @returns User object if valid, null otherwise
     */
    verify(ctx: Context, config: TConfig): Promise<User | null>;

    /**
     * Generate authentication token/session
     */
    generateToken?(user: User, config: TConfig): Promise<string>;

    /**
     * Refresh authentication token
     */
    refreshToken?(token: string, config: TConfig): Promise<string | null>;
}

/**
 * Rate limiting storage adapter interface
 */
export interface RateLimitAdapter {
    /**
     * Increment request count for key
     * @returns Current count and reset time
     */
    increment(key: string, windowMs: number): Promise<{
        count: number;
        resetTime: number;
    }>;

    /**
     * Get current rate limit info for key
     */
    get(key: string): Promise<RateLimitInfo | null>;

    /**
     * Reset rate limit for key
     */
    reset(key: string): Promise<void>;

    /**
     * Clean up expired entries
     */
    cleanup?(): Promise<void>;
}

/**
 * CSRF token adapter interface
 */
export interface CSRFAdapter {
    /**
     * Generate CSRF token
     */
    generateToken(ctx: Context): string;

    /**
     * Validate CSRF token
     */
    validateToken(ctx: Context, token: string): boolean;

    /**
     * Extract token from request
     */
    extractToken(ctx: Context): string | null;
}

/**
 * Permission checker adapter interface
 * Allows custom RBAC logic
 */
export interface PermissionAdapter {
    /**
     * Check if user has required permissions
     */
    checkPermissions(user: User, required: string[]): PermissionCheckResult;

    /**
     * Check if user has required roles
     */
    checkRoles(user: User, required: string[]): boolean;

    /**
     * Expand role to permissions
     */
    expandRole?(role: string): string[] | undefined;
}

/**
 * Default security headers adapter
 */
export class DefaultSecurityHeadersAdapter implements SecurityHeadersAdapter {
    generateHeaders(_ctx: Context, config: SecurityHeadersConfig): Record<string, string> {
        const mode = config.mode || 'moderate';
        const headers: Record<string, string> = {};

        // Base headers
        headers['X-Content-Type-Options'] = 'nosniff';
        headers['X-Frame-Options'] = mode === 'strict' ? 'DENY' : 'SAMEORIGIN';
        headers['X-XSS-Protection'] = '1; mode=block';

        if (mode === 'strict' || mode === 'moderate') {
            headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
            headers['Referrer-Policy'] = 'no-referrer';
        }

        // CSP
        if (config.csp) {
            let cspValue = '';
            const directives = config.csp.directives || {
                'default-src': ["'self'"]
            };

            for (const [directive, values] of Object.entries(directives)) {
                cspValue += `${directive} ${values.join(' ')}; `;
            }

            if (config.csp.reportUri) {
                cspValue += `report-uri ${config.csp.reportUri}; `;
            }

            const headerName = config.csp.reportOnly
                ? 'Content-Security-Policy-Report-Only'
                : 'Content-Security-Policy';
            headers[headerName] = cspValue.trim();
        }

        // Custom headers override
        if (config.customHeaders) {
            Object.assign(headers, config.customHeaders);
        }

        return headers;
    }

    generateNonce?(): string {
        return crypto.randomUUID().replace(/-/g, '');
    }
}

/**
 * Default input sanitization adapter
 */
export class DefaultSanitizationAdapter implements SanitizationAdapter {
    private readonly defaultPatterns = {
        sql: /((\bUNION\b)|(\bSELECT\b)|(\bINSERT\b)|(\bUPDATE\b)|(\bDELETE\b)|(\bDROP\b)|(\bCREATE\b)|(\bALTER\b))/gi,
        xss: /(<script|javascript:|onerror=|onload=|<iframe|<object|<embed)/gi,
        pathTraversal: /(\.\.[\/\\])/g,
        noSqlInjection: /(\$where|\$ne|\$gt|\$lt|\$regex)/gi
    };

    sanitize(value: any, config: SanitizationConfig): any {
        if (value === null || value === undefined) {
            return value;
        }

        if (typeof value === 'string') {
            return this.sanitizeString(value, config);
        }

        if (Array.isArray(value)) {
            return value.map(item => this.sanitize(item, config));
        }

        if (typeof value === 'object') {
            const sanitized: any = {};
            for (const [key, val] of Object.entries(value)) {
                sanitized[key] = this.sanitize(val, config);
            }
            return sanitized;
        }

        return value;
    }

    private sanitizeString(value: string, config: SanitizationConfig): string {
        const patterns = config.patterns || [];
        const allPatterns = [...Object.values(this.defaultPatterns), ...patterns.map(p => p.pattern)];

        for (const pattern of allPatterns) {
            if (pattern.test(value)) {
                if (config.strict) {
                    throw new Error('Malicious input detected');
                }
                // Remove malicious content
                value = value.replace(pattern, '');
            }
        }

        return value;
    }

    isMalicious(value: any, config: SanitizationConfig): boolean {
        if (typeof value !== 'string') {
            return false;
        }

        const patterns = config.patterns || [];
        const allPatterns = [...Object.values(this.defaultPatterns), ...patterns.map(p => p.pattern)];

        return allPatterns.some(pattern => pattern.test(value));
    }
}

/**
 * Default permission checker adapter
 */
export class DefaultPermissionAdapter implements PermissionAdapter {
    private roleHierarchy: Map<string, string[]> = new Map();

    checkPermissions(user: User, required: string[]): PermissionCheckResult {
        const userPermissions = new Set(user.permissions || []);

        // Check for wildcard permission
        if (userPermissions.has('*')) {
            return { allowed: true };
        }

        // Expand roles to permissions
        if (user.roles) {
            for (const role of user.roles) {
                const rolePerms = this.expandRole?.(role);
                if (rolePerms) {
                    rolePerms.forEach(p => userPermissions.add(p));
                }
            }
        }

        // Check required permissions
        const missing = required.filter(perm => {
            // Check for wildcard match (e.g., 'read:*' matches 'read:users')
            const hasWildcard = Array.from(userPermissions).some(userPerm => {
                if (userPerm.endsWith('*')) {
                    const prefix = userPerm.slice(0, -1);
                    return perm.startsWith(prefix);
                }
                return userPerm === perm;
            });

            return !hasWildcard && !userPermissions.has(perm);
        });

        return {
            allowed: missing.length === 0,
            missing: missing.length > 0 ? missing : undefined
        };
    }

    checkRoles(user: User, required: string[]): boolean {
        if (!user.roles || user.roles.length === 0) {
            return false;
        }

        return required.some(role => user.roles!.includes(role));
    }

    expandRole?(role: string): string[] | undefined {
        return this.roleHierarchy.get(role);
    }

    /**
     * Define role permissions
     */
    defineRole(role: string, permissions: string[]): void {
        this.roleHierarchy.set(role, permissions);
    }
}

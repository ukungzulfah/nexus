/**
 * JWT Authentication Adapter
 * 
 * Implements JWT-based authentication
 */

import type { Context } from '../../core/types';
import type { User, JWTConfig } from '../types';
import type { AuthAdapter } from '../adapter';

/**
 * Simple JWT implementation (in production, use a library like jsonwebtoken)
 * This is a basic implementation for demonstration
 */
export class JWTAuthAdapter implements AuthAdapter<JWTConfig> {
    /**
     * Verify JWT token and extract user
     */
    async verify(ctx: Context, config: JWTConfig): Promise<User | null> {
        const token = this.extractToken(ctx, config);

        if (!token) {
            return null;
        }

        try {
            const payload = this.decodeToken(token, config.secret);

            // Check expiration
            if (payload.exp && payload.exp < Date.now() / 1000) {
                return null;
            }

            // Extract user from payload
            // Destructure known fields and spread the rest to preserve custom fields like 'type'
            const { sub, id, email, username, roles, permissions, user: nestedUser, iat, exp, ...rest } = payload;
            
            const user: User = {
                id: sub || id,
                email,
                username,
                roles,
                permissions,
                ...nestedUser,  // Spread nested user object if exists
                ...rest         // Spread remaining custom fields (e.g., type)
            };

            return user;
        } catch (error) {
            return null;
        }
    }

    /**
     * Generate JWT token for user
     */
    async generateToken(user: User, config: JWTConfig): Promise<string> {
        const payload: any = {
            sub: user.id,
            email: user.email,
            username: user.username,
            roles: user.roles,
            permissions: user.permissions,
            iat: Math.floor(Date.now() / 1000)
        };

        // Add expiration
        if (config.expiresIn) {
            const expiresIn = typeof config.expiresIn === 'string'
                ? this.parseExpiration(config.expiresIn)
                : config.expiresIn;
            payload.exp = payload.iat + expiresIn;
        }

        return this.encodeToken(payload, config.secret);
    }

    /**
     * Refresh JWT token (placeholder for future implementation)
     */
    async refreshToken(token: string, config: JWTConfig): Promise<string | null> {
        if (!config.refresh?.enabled) {
            return null;
        }

        try {
            const payload = this.decodeToken(token, config.secret);

            // Re-generate with new exp
            const newPayload = {
                ...payload,
                iat: Math.floor(Date.now() / 1000)
            };

            if (config.refresh.expiresIn) {
                const expiresIn = typeof config.refresh.expiresIn === 'string'
                    ? this.parseExpiration(config.refresh.expiresIn)
                    : config.refresh.expiresIn;
                newPayload.exp = newPayload.iat + expiresIn;
            }

            return this.encodeToken(newPayload, config.secret);
        } catch (error) {
            return null;
        }
    }

    /**
     * Extract token from request
     */
    private extractToken(ctx: Context, config: JWTConfig): string | null {
        // Use custom extractor if provided
        if (config.getToken) {
            return config.getToken(ctx);
        }

        // Try Authorization header
        const authHeader = ctx.headers['authorization'] || ctx.headers['Authorization'];
        if (authHeader) {
            const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
            if (headerValue?.startsWith('Bearer ')) {
                return headerValue.substring(7);
            }
        }

        // Try cookie
        const cookieHeader = ctx.headers['cookie'] || ctx.headers['Cookie'];
        if (cookieHeader) {
            const cookieValue = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
            if (cookieValue) {
                const match = cookieValue.match(/token=([^;]+)/);
                if (match) {
                    return match[1];
                }
            }
        }

        return null;
    }

    /**
     * Encode JWT token (simplified HMAC-SHA256)
     */
    private encodeToken(payload: any, secret: string): string {
        const header = { alg: 'HS256', typ: 'JWT' };

        const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
        const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

        const signature = this.sign(`${encodedHeader}.${encodedPayload}`, secret);

        return `${encodedHeader}.${encodedPayload}.${signature}`;
    }

    /**
     * Decode and verify JWT token
     */
    private decodeToken(token: string, secret: string): any {
        const parts = token.split('.');

        if (parts.length !== 3) {
            throw new Error('Invalid token format');
        }

        const [encodedHeader, encodedPayload, signature] = parts;

        // Verify signature
        const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`, secret);
        if (signature !== expectedSignature) {
            throw new Error('Invalid signature');
        }

        // Decode payload
        const payload = JSON.parse(this.base64UrlDecode(encodedPayload));

        return payload;
    }

    /**
     * Base64 URL encode
     */
    private base64UrlEncode(str: string): string {
        const base64 = Buffer.from(str).toString('base64');
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    /**
     * Base64 URL decode
     */
    private base64UrlDecode(str: string): string {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

        // Add padding
        while (base64.length % 4) {
            base64 += '=';
        }

        return Buffer.from(base64, 'base64').toString('utf-8');
    }

    /**
     * Sign data with HMAC-SHA256
     */
    private sign(data: string, secret: string): string {
        const crypto = require('crypto');
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(data);
        const signature = hmac.digest('base64');
        return signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    /**
     * Parse expiration string to seconds
     */
    private parseExpiration(exp: string): number {
        const match = exp.match(/^(\d+)([smhd])$/);

        if (!match) {
            throw new Error('Invalid expiration format');
        }

        const value = parseInt(match[1]);
        const unit = match[2];

        const multipliers: Record<string, number> = {
            s: 1,
            m: 60,
            h: 3600,
            d: 86400
        };

        return value * multipliers[unit];
    }
}

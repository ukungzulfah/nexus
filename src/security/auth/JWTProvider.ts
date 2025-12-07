/**
 * JWT Provider
 * 
 * Provider untuk JWT authentication yang bisa di-inject via DI system.
 * Mudah digunakan di route handler tanpa perlu setup middleware manual.
 */

import { Context } from '../../core';
import type { User, JWTConfig } from '../types';

export interface JWTProviderConfig {
  secret: string;
  expiresIn?: string | number;  // '1h', '7d', 3600, etc.
  issuer?: string;
  audience?: string;
}

export interface TokenPayload {
  id: string | number;
  email?: string;
  username?: string;
  roles?: string[];
  permissions?: string[];
  [key: string]: any;
}

export interface VerifyResult {
  valid: boolean;
  user: User | null;
  error?: string;
  expired?: boolean;
}

/**
 * JWT Provider Class
 * 
 * @example
 * ```typescript
 * // Setup di app
 * const jwt = new JWTProvider({
 *   secret: process.env.JWT_SECRET!,
 *   expiresIn: '1h'
 * });
 * 
 * const app = createApp().provide({ jwt });
 * 
 * // Gunakan di route
 * app.post('/login', async (ctx, { jwt }) => {
 *   const token = await jwt.sign({ id: user.id, email: user.email });
 *   return { token };
 * });
 * 
 * app.get('/profile', async (ctx, { jwt }) => {
 *   const result = await jwt.verify(ctx);
 *   if (!result.valid) return ctx.response.status(401).json({ error: 'Unauthorized' });
 *   return { user: result.user };
 * });
 * ```
 */
export class JWTProvider {
  private config: JWTProviderConfig;

  constructor(config: JWTProviderConfig) {
    if (!config.secret) {
      throw new Error('JWT secret is required');
    }
    this.config = {
      expiresIn: '1h',
      ...config
    };
  }

  /**
   * Generate JWT token dari user/payload
   */
  async sign(payload: TokenPayload, options?: Partial<JWTProviderConfig>): Promise<string> {
    const config = { ...this.config, ...options };
    
    const header = { alg: 'HS256', typ: 'JWT' };
    
    // Calculate expiry
    let exp: number;
    const expiresIn = config.expiresIn || '1h';
    if (typeof expiresIn === 'number') {
      exp = Math.floor(Date.now() / 1000) + expiresIn;
    } else {
      exp = Math.floor(Date.now() / 1000) + this.parseExpiry(expiresIn);
    }
    
    const tokenPayload = {
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp,
      ...(config.issuer && { iss: config.issuer }),
      ...(config.audience && { aud: config.audience })
    };
    
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(tokenPayload));
    const signature = await this.createSignature(`${encodedHeader}.${encodedPayload}`, config.secret);
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }

  /**
   * Verify token dari Authorization header atau cookie
   */
  async verify(ctx: Context, options?: { cookieName?: string }): Promise<VerifyResult> {
    const token = this.extractToken(ctx, options?.cookieName);
    
    if (!token) {
      return { valid: false, user: null, error: 'No token provided' };
    }
    
    return this.verifyToken(token);
  }

  /**
   * Verify token string langsung
   */
  async verifyToken(token: string): Promise<VerifyResult> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, user: null, error: 'Invalid token format' };
      }
      
      const [encodedHeader, encodedPayload, signature] = parts;
      
      // Verify signature
      const expectedSignature = await this.createSignature(
        `${encodedHeader}.${encodedPayload}`,
        this.config.secret
      );
      
      if (signature !== expectedSignature) {
        return { valid: false, user: null, error: 'Invalid signature' };
      }
      
      // Decode payload
      const payload = JSON.parse(this.base64UrlDecode(encodedPayload));
      
      // Check expiry
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, user: null, error: 'Token expired', expired: true };
      }
      
      // Check issuer
      if (this.config.issuer && payload.iss !== this.config.issuer) {
        return { valid: false, user: null, error: 'Invalid issuer' };
      }
      
      // Check audience
      if (this.config.audience && payload.aud !== this.config.audience) {
        return { valid: false, user: null, error: 'Invalid audience' };
      }
      
      const user: User = {
        id: payload.id,
        email: payload.email,
        username: payload.username,
        roles: payload.roles || [],
        permissions: payload.permissions || []
      };
      
      return { valid: true, user };
      
    } catch (error) {
      return { valid: false, user: null, error: 'Token verification failed' };
    }
  }

  /**
   * Decode token tanpa verify (untuk debugging)
   */
  decode(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(this.base64UrlDecode(parts[1]));
      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Refresh token (generate token baru dengan expiry baru)
   */
  async refresh(token: string, options?: Partial<JWTProviderConfig>): Promise<string | null> {
    const result = await this.verifyToken(token);
    
    if (!result.valid || !result.user) {
      return null;
    }
    
    // Generate new token with same user data
    return this.sign({
      id: result.user.id,
      email: result.user.email,
      username: result.user.username,
      roles: result.user.roles,
      permissions: result.user.permissions
    }, options);
  }

  /**
   * Create middleware untuk protect route
   */
  middleware(options?: { cookieName?: string }) {
    return async (ctx: Context, next: (ctx: Context) => Promise<any>) => {
      const result = await this.verify(ctx, options);
      
      if (!result.valid) {
        return ctx.response.status(401).json({
          error: 'Unauthorized',
          message: result.error
        });
      }
      
      // Attach user ke context
      (ctx as any).user = result.user;
      
      return next(ctx);
    };
  }

  /**
   * Check apakah user punya role tertentu
   */
  hasRole(user: User, role: string | string[]): boolean {
    const roles = Array.isArray(role) ? role : [role];
    return roles.some(r => user.roles?.includes(r));
  }

  /**
   * Check apakah user punya permission tertentu
   */
  hasPermission(user: User, permission: string | string[]): boolean {
    const permissions = Array.isArray(permission) ? permission : [permission];
    return permissions.some(p => user.permissions?.includes(p));
  }

  // === Private Methods ===

  private extractToken(ctx: Context, cookieName?: string): string | null {
    // 1. Check Authorization header
    const authHeader = ctx.headers?.authorization || ctx.headers?.Authorization;
    if (authHeader) {
      const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
      if (header.startsWith('Bearer ')) {
        return header.slice(7);
      }
    }
    
    // 2. Check cookie
    if (cookieName) {
      const cookieHeader = ctx.headers?.cookie;
      if (cookieHeader) {
        const cookies = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
        const match = cookies.match(new RegExp(`${cookieName}=([^;]+)`));
        if (match) return match[1];
      }
    }
    
    // 3. Check query parameter (for websocket atau special cases)
    if (ctx.query?.token) {
      return ctx.query.token as string;
    }
    
    return null;
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // default 1h
    
    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value;
      case 'm': return value * 60;
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      default: return 3600;
    }
  }

  private base64UrlEncode(str: string): string {
    const base64 = Buffer.from(str).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private base64UrlDecode(str: string): string {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return Buffer.from(base64, 'base64').toString('utf-8');
  }

  private async createSignature(data: string, secret: string): Promise<string> {
    const crypto = await import('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data);
    const signature = hmac.digest('base64');
    return signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

/**
 * Factory function untuk create JWTProvider
 */
export function createJWTProvider(config: JWTProviderConfig): JWTProvider {
  return new JWTProvider(config);
}

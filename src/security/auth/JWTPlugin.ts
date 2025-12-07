/**
 * JWT Authentication Plugin
 * 
 * Plugin untuk JWT authentication yang otomatis:
 * - Menambahkan jwt provider ke dependencies
 * - Menambahkan auth middleware (opsional)
 * - Mendekorasi context dengan user property
 * - Export API untuk plugin lain
 */

import { definePlugin } from '../../core/plugin';
import { JWTProvider, JWTProviderConfig, VerifyResult } from './JWTProvider';
import type { User } from '../types';
import type { Context } from '../../core';

export interface JWTPluginConfig extends JWTProviderConfig {
  /**
   * Auto-protect semua route (default: false)
   * Jika true, semua route akan butuh auth kecuali yang ada di `publicPaths`
   */
  autoProtect?: boolean;
  
  /**
   * Path yang tidak perlu auth (hanya berlaku jika autoProtect: true)
   */
  publicPaths?: string[];
  
  /**
   * Nama cookie untuk menyimpan token (opsional)
   */
  cookieName?: string;
  
  /**
   * Custom handler ketika unauthorized
   */
  onUnauthorized?: (ctx: Context, error: string) => any;
}

export interface JWTPluginExports {
  /**
   * JWT Provider instance
   */
  provider: JWTProvider;
  
  /**
   * Sign token dari payload
   */
  sign: (payload: { id: string | number; [key: string]: any }) => Promise<string>;
  
  /**
   * Verify token dari context
   */
  verify: (ctx: Context) => Promise<VerifyResult>;
  
  /**
   * Verify token string
   */
  verifyToken: (token: string) => Promise<VerifyResult>;
  
  /**
   * Decode token tanpa verify
   */
  decode: (token: string) => any;
  
  /**
   * Refresh token
   */
  refresh: (token: string) => Promise<string | null>;
  
  /**
   * Check role
   */
  hasRole: (user: User, role: string | string[]) => boolean;
  
  /**
   * Check permission
   */
  hasPermission: (user: User, permission: string | string[]) => boolean;
  
  /**
   * Get middleware for protecting routes
   */
  middleware: () => (ctx: Context, next: any) => Promise<any>;
}

/**
 * Create JWT Plugin
 * 
 * @example
 * ```typescript
 * import { createApp } from 'nexus';
 * import { jwtPlugin } from 'nexus/security';
 * 
 * const app = createApp()
 *   .plugin(jwtPlugin, {
 *     secret: process.env.JWT_SECRET!,
 *     expiresIn: '7d',
 *     autoProtect: false
 *   });
 * 
 * // Akses JWT via plugin exports
 * app.post('/login', async (ctx) => {
 *   const jwt = app.getPluginExports<JWTPluginExports>('jwt');
 *   const token = await jwt.sign({ id: user.id, email: user.email });
 *   return { token };
 * });
 * 
 * // Atau via context decorator
 * app.get('/profile', async (ctx) => {
 *   const result = await ctx.jwt.verify(ctx);
 *   if (!result.valid) return ctx.response.status(401).json({ error: 'Unauthorized' });
 *   return { user: result.user };
 * });
 * ```
 */
export const jwtPlugin = definePlugin('jwt')
  .version('1.0.0')
  .description('JWT Authentication Plugin')
  .author('Nexus Team')
  .tags('security', 'authentication', 'jwt')
  .priority('high')
  
  // Type-safe configuration
  .config<JWTPluginConfig>()
  .defaults({
    expiresIn: '1h',
    autoProtect: false,
    publicPaths: ['/health', '/api/auth/login', '/api/auth/register']
  })
  .validate((config) => {
    if (!config.secret) {
      return 'JWT secret is required. Set it via config or JWT_SECRET environment variable.';
    }
    if (config.secret.length < 32) {
      return 'JWT secret should be at least 32 characters for security.';
    }
    return true;
  })
  
  // Configure phase - create provider early
  .configure((ctx) => {
    const provider = new JWTProvider({
      secret: ctx.config.secret,
      expiresIn: ctx.config.expiresIn,
      issuer: ctx.config.issuer,
      audience: ctx.config.audience
    });
    
    ctx.storage.set('provider', provider);
    ctx.log.debug('JWT Provider initialized');
  })
  
  // Register phase - add middleware if autoProtect
  .register((ctx) => {
    const provider = ctx.storage.get('provider') as JWTProvider;
    
    if (ctx.config.autoProtect) {
      ctx.app.use(async (reqCtx: Context, next: any) => {
        // Check if path is public
        const publicPaths = ctx.config.publicPaths || [];
        const isPublic = publicPaths.some(p => {
          if (p.endsWith('*')) {
            return reqCtx.path.startsWith(p.slice(0, -1));
          }
          return reqCtx.path === p;
        });
        
        if (isPublic) {
          return next(reqCtx);
        }
        
        // Verify token
        const result = await provider.verify(reqCtx, {
          cookieName: ctx.config.cookieName
        });
        
        if (!result.valid) {
          if (ctx.config.onUnauthorized) {
            return ctx.config.onUnauthorized(reqCtx, result.error || 'Unauthorized');
          }
          return reqCtx.response.status(401).json({
            error: 'Unauthorized',
            message: result.error
          });
        }
        
        // Attach user to context
        (reqCtx as any).user = result.user;
        
        return next(reqCtx);
      });
      
      ctx.log.info('JWT auto-protection enabled');
    }
  })
  
  // Decorate context dengan jwt helper
  .decorate((ctx) => {
    const provider = ctx.storage.get('provider') as JWTProvider;
    
    (ctx as any).jwt = {
      sign: (payload: any) => provider.sign(payload),
      verify: (reqCtx: Context) => provider.verify(reqCtx),
      decode: (token: string) => provider.decode(token),
      hasRole: (user: User, role: string | string[]) => provider.hasRole(user, role),
      hasPermission: (user: User, perm: string | string[]) => provider.hasPermission(user, perm)
    };
  })
  
  // Export API untuk plugin lain
  .export<JWTPluginExports>((ctx) => {
    const provider = ctx.storage.get('provider') as JWTProvider;
    
    return {
      provider,
      sign: (payload) => provider.sign(payload),
      verify: (reqCtx) => provider.verify(reqCtx),
      verifyToken: (token) => provider.verifyToken(token),
      decode: (token) => provider.decode(token),
      refresh: (token) => provider.refresh(token),
      hasRole: (user, role) => provider.hasRole(user, role),
      hasPermission: (user, perm) => provider.hasPermission(user, perm),
      middleware: () => provider.middleware({ cookieName: ctx.config.cookieName })
    };
  })
  
  // Ready phase
  .ready((ctx) => {
    ctx.log.info(`JWT Plugin ready (autoProtect: ${ctx.config.autoProtect})`);
  })
  
  .build();

export default jwtPlugin;

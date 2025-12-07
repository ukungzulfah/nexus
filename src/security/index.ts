/**
 * Security Module Entry Point
 * 
 * Exports all security features
 */

// Types
export * from './types';

// Adapters
export * from './adapter';

// Security Headers
export {
    securityHeaders,
    strictSecurityHeaders,
    moderateSecurityHeaders
} from './headers';

// Input Sanitization
export {
    sanitizeInput,
    strictSanitization,
    lenientSanitization
} from './sanitization';

// Authentication
export {
    authenticate,
    optionalAuth,
    requireAuth,
    requirePermissions,
    requireRoles
} from './auth/middleware';

export { JWTAuthAdapter } from './auth/jwt';

// JWT Provider (for DI)
export { JWTProvider, createJWTProvider } from './auth/JWTProvider';
export type { JWTProviderConfig, TokenPayload, VerifyResult } from './auth/JWTProvider';

// JWT Plugin
export { jwtPlugin } from './auth/JWTPlugin';
export type { JWTPluginConfig, JWTPluginExports } from './auth/JWTPlugin';

// Rate Limiting
export {
    rateLimit,
    strictRateLimit,
    lenientRateLimit
} from './rate-limit/middleware';

export { MemoryRateLimiter } from './rate-limit/memory';

// CSRF Protection
export {
    csrf,
    generateCSRFToken,
    csrfProtection
} from './csrf';

import { Plugin } from '../../core/types';
import { serveStatic } from './serveStatic';

/**
 * Create SPA (Single Page Application) static serving
 * Falls back to index.html for client-side routing
 *
 * @example
 * ```typescript
 * app.feature(spa());           // SPA from ./public
 * app.feature(spa('./dist'));   // SPA from ./dist
 * ```
 */

export function spa(root = './public'): Plugin {
    return serveStatic({
        root,
        fallback: 'index.html',
        maxAge: 0, // No cache for HTML
        etag: true
    });
}

export type { Plugin };
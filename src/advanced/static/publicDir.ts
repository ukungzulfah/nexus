import { Plugin } from '../../core/types';
import { serveStatic } from './serveStatic';

/**
 * Create a public directory feature with sensible defaults
 *
 * @example
 * ```typescript
 * app.plugin(publicDir());           // ./public
 * app.plugin(publicDir('./assets')); // ./assets
 * ```
 */

export function publicDir(root = './public'): Plugin {
    return serveStatic({
        root,
        maxAge: 86400,
        etag: true,
        lastModified: true
    });
}

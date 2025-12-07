/**
 * Static File Serving Feature
 * 
 * Serve static files from a directory (public folder)
 * 
 * @example
 * ```typescript
 * import { createApp, serveStatic } from 'nexus';
 * 
 * const app = createApp();
 * 
 * // Basic usage - serve from ./public
 * app.plugin(serveStatic());
 * 
 * // Custom directory
 * app.plugin(serveStatic({ root: './assets' }));
 * 
 * // With prefix
 * app.plugin(serveStatic({ 
 *   root: './public',
 *   prefix: '/static'  // /static/image.png → ./public/image.png
 * }));
 * ```
 */

import { serveStatic } from './serveStatic';
import { publicDir } from './publicDir';

/**
 * Alias for serveStatic
 */
export const staticFiles = serveStatic;

export { serveStatic, publicDir };


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
 * app.feature(serveStatic());
 * 
 * // Custom directory
 * app.feature(serveStatic({ root: './assets' }));
 * 
 * // With prefix
 * app.feature(serveStatic({ 
 *   root: './public',
 *   prefix: '/static'  // /static/image.png → ./public/image.png
 * }));
 * ```
 */

import { serveStatic } from './serveStatic';

/**
 * Alias for serveStatic
 */
export const staticFiles = serveStatic;


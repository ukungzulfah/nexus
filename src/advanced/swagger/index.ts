/**
 * Swagger/OpenAPI Integration for Nexus Framework
 * Smart auto-detection of routes with zero configuration
 * 
 * @example
 * ```typescript
 * import { createApp, swagger } from 'nexus';
 * 
 * const app = createApp();
 * 
 * // Zero config - just works!
 * app.plugin(swagger());
 * 
 * // With config
 * app.plugin(swagger({
 *   path: '/docs',
 *   info: { title: 'My API', version: '1.0.0' }
 * }));
 * ```
 */

import { swagger } from './swagger';

// Default export
export default swagger;

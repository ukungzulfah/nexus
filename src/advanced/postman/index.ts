/**
 * Postman Collection Generator for Nexus Framework
 * Auto-generate Postman collection & environment from routes
 * 
 * @example
 * ```typescript
 * import { createApp, postman } from 'nexus';
 * 
 * const app = createApp();
 * 
 * // Zero config
 * app.feature(postman());
 * 
 * // With config
 * app.feature(postman({
 *   path: '/postman',
 *   name: 'My API',
 *   baseUrl: 'http://localhost:3000'
 * }));
 * 
 * // Access:
 * // GET /postman → Download collection.json
 * // GET /postman/environment → Download environment.json
 * ```
 */

import { postman } from './postman';
export default postman;

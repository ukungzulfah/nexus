import { Application } from '../../core/application';
import { RouteConfig, HTTPMethod, Context, Plugin } from '../../core/types';
import { generateCollection } from './generateCollection';
import { generateEnvironment } from './generateEnvironment';
import { slugify } from './slugify';
import { PostmanConfig, StoredRoute } from './types';

// ============================================
// POSTMAN FEATURE (PLUGIN)
// ============================================
/**
 * Create Postman feature plugin for Nexus
 */

export function postman(config: PostmanConfig = {}): Plugin {
  const resolvedConfig: PostmanConfig = {
    path: '/postman',
    name: 'API Collection',
    description: 'Auto-generated Postman collection',
    environmentName: 'API Environment',
    includeExamples: true,
    ...config
  };

  const routes: StoredRoute[] = [];
  let detectedBaseUrl = '';

  return {
    name: 'postman',
    version: '1.0.0',

    install(app: Application) {
      // Hook into route registration
      const originalRoute = app.route.bind(app);
      const originalGet = app.get.bind(app);
      const originalPost = app.post.bind(app);
      const originalPut = app.put.bind(app);
      const originalDelete = app.delete.bind(app);
      const originalPatch = app.patch.bind(app);

      app.route = function (routeConfig: RouteConfig) {
        routes.push({
          method: routeConfig.method,
          path: routeConfig.path,
          schema: routeConfig.schema,
          meta: routeConfig.meta
        });
        return originalRoute(routeConfig);
      };

      const wrapMethod = (method: HTTPMethod, original: Function) => {
        return function (pathOrRoute: string | any, handlerOrConfig?: any) {
          // Class-based routing
          if (typeof pathOrRoute === 'object' && 'pathName' in pathOrRoute) {
            const route = pathOrRoute;
            routes.push({
              method,
              path: route.pathName,
              schema: route.schema?.(),
              meta: route.meta?.()
            });
            return original(pathOrRoute);
          }

          const path = pathOrRoute;
          if (typeof handlerOrConfig !== 'function' && handlerOrConfig) {
            routes.push({
              method,
              path,
              schema: handlerOrConfig.schema,
              meta: handlerOrConfig.meta
            });
          } else {
            routes.push({ method, path });
          }
          return original(path, handlerOrConfig);
        };
      };

      app.get = wrapMethod('GET', originalGet);
      app.post = wrapMethod('POST', originalPost);
      app.put = wrapMethod('PUT', originalPut);
      app.delete = wrapMethod('DELETE', originalDelete);
      app.patch = wrapMethod('PATCH', originalPatch);

      const basePath = resolvedConfig.path!;

      // GET /postman → Download collection
      originalGet(basePath, async (ctx: Context) => {
        // Auto-detect base URL
        if (!detectedBaseUrl && ctx.raw?.req) {
          const req = ctx.raw.req;
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers.host || 'localhost:3000';
          detectedBaseUrl = `${protocol}://${host}`;
        }

        const baseUrl = resolvedConfig.baseUrl || detectedBaseUrl || 'http://localhost:3000';
        const collection = generateCollection(routes, resolvedConfig, baseUrl);
        const filename = `${slugify(resolvedConfig.name!)}_collection.json`;

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`
          },
          body: JSON.stringify(collection, null, 2)
        };
      });

      // GET /postman/environment → Download environment
      originalGet(basePath + '/environment', async (ctx: Context) => {
        if (!detectedBaseUrl && ctx.raw?.req) {
          const req = ctx.raw.req;
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers.host || 'localhost:3000';
          detectedBaseUrl = `${protocol}://${host}`;
        }

        const baseUrl = resolvedConfig.baseUrl || detectedBaseUrl || 'http://localhost:3000';
        const environment = generateEnvironment(resolvedConfig, baseUrl);
        const filename = `${slugify(resolvedConfig.environmentName!)}_environment.json`;

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${filename}"`
          },
          body: JSON.stringify(environment, null, 2)
        };
      });

      // GET /postman/preview → Preview collection (no download)
      originalGet(basePath + '/preview', async (ctx: Context) => {
        if (!detectedBaseUrl && ctx.raw?.req) {
          const req = ctx.raw.req;
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers.host || 'localhost:3000';
          detectedBaseUrl = `${protocol}://${host}`;
        }

        const baseUrl = resolvedConfig.baseUrl || detectedBaseUrl || 'http://localhost:3000';
        const collection = generateCollection(routes, resolvedConfig, baseUrl);

        return ctx.json(collection);
      });

      if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
        console.log(`📦 Postman Collection: ${basePath}`);
        console.log(`🌍 Postman Environment: ${basePath}/environment`);
      }
    }
  };
}

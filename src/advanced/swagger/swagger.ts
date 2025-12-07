import { generateSwaggerUI } from './generateSwaggerUI';
import { generateSpec } from './generateSpec';
import { Application } from '../../core/application';
import { RouteConfig, HTTPMethod, Context, SchemaConfig, RouteMeta } from '../../core/types';
import { Plugin } from '../static/spa';
import { SwaggerConfig, StoredRoute, OpenAPISchema, SwaggerApplication } from './types';

// ============================================
// SWAGGER FEATURE (PLUGIN)
// ============================================
/**
 * Create Swagger feature plugin for Nexus
 *
 * @example
 * ```typescript
 * // Minimal setup - auto-detects everything
 * app.feature(swagger());
 *
 * // With custom info
 * app.feature(swagger({
 *   info: {
 *     title: 'My Awesome API',
 *     version: '2.0.0',
 *     description: 'API documentation'
 *   }
 * }));
 *
 * // Full configuration
 * app.feature(swagger({
 *   path: '/api-docs',
 *   specPath: '/swagger.json',
 *   theme: 'dark',
 *   securitySchemes: {
 *     bearerAuth: {
 *       type: 'http',
 *       scheme: 'bearer',
 *       bearerFormat: 'JWT'
 *     }
 *   }
 * }));
 * ```
 */


export function swagger(config: SwaggerConfig = {}): Plugin {
  const resolvedConfig: SwaggerConfig = {
    path: '/docs',
    specPath: '/openapi.json',
    docExpansion: 'list',
    filter: true,
    tryItOutEnabled: true,
    persistAuthorization: true,
    ...config,
    info: {
      title: 'API Documentation',
      version: '1.0.0',
      ...config.info
    }
  };

  // Storage for routes - will be populated when app registers routes
  const routes: StoredRoute[] = [];
  const schemas: Map<string, OpenAPISchema> = new Map();
  let serverUrl = '';
  let appInstance: Application | null = null;

  return {
    name: 'swagger',
    version: '1.0.0',

    install(app: Application) {
      appInstance = app;
      // Cast to extended interface for swagger-specific properties
      const swaggerApp = app as SwaggerApplication;
      // Hook into route registration to capture routes with metadata
      const originalRoute = app.route.bind(app);
      const originalGet = app.get.bind(app);
      const originalPost = app.post.bind(app);
      const originalPut = app.put.bind(app);
      const originalDelete = app.delete.bind(app);
      const originalPatch = app.patch.bind(app);

      // Override route method to capture metadata
      app.route = function (routeConfig: RouteConfig) {
        routes.push({
          method: routeConfig.method,
          path: routeConfig.path,
          schema: routeConfig.schema,
          meta: routeConfig.meta
        });
        return originalRoute(routeConfig);
      };

      // Override HTTP method shortcuts
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

      // Add swagger endpoints
      const docsPath = resolvedConfig.path!;
      const specPath = resolvedConfig.specPath!;

      // Serve OpenAPI JSON spec
      originalGet(specPath, async (ctx: Context) => {
        // Auto-detect server URL from request
        if (!serverUrl && ctx.raw?.req) {
          const req = ctx.raw.req;
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers.host || 'localhost:3000';
          serverUrl = `${protocol}://${host}`;
        }

        // Combine intercepted routes with routes from router (for file-based routing)
        const allRoutes = getAllRoutes(routes, appInstance, docsPath, specPath);
        const spec = generateSpec(allRoutes, schemas, resolvedConfig, serverUrl);
        return ctx.json(spec);
      });

      // Serve Swagger UI
      originalGet(docsPath, async (_ctx: Context) => {
        const html = generateSwaggerUI(resolvedConfig);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          body: html
        };
      });

      // Also serve at /docs/ (with trailing slash)
      originalGet(docsPath + '/', async (_ctx: Context) => {
        const html = generateSwaggerUI(resolvedConfig);
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          body: html
        };
      });

      // Add schema registration method to app
      swaggerApp.swaggerSchema = (name: string, schema: OpenAPISchema) => {
        schemas.set(name, schema);
        return swaggerApp;
      };

      // Log swagger is enabled (check via environment or resolvedConfig)
      if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
        console.log(`📚 Swagger UI: ${docsPath}`);
        console.log(`📄 OpenAPI Spec: ${specPath}`);
      }
    }
  };
}

/**
 * Get all routes by combining intercepted routes with routes from the router
 * This ensures file-based routes are also included in Swagger docs
 */
function getAllRoutes(
  interceptedRoutes: StoredRoute[],
  app: Application | null,
  docsPath: string,
  specPath: string
): StoredRoute[] {
  // Create a Set of already tracked route keys (method + path)
  const trackedKeys = new Set(
    interceptedRoutes.map(r => `${r.method}:${r.path}`)
  );

  // Start with intercepted routes (filtered to exclude swagger routes)
  const allRoutes: StoredRoute[] = interceptedRoutes.filter(
    r => !r.path.startsWith(docsPath) && r.path !== specPath
  );

  // Get routes from router (includes file-based routes)
  if (app) {
    const routerRoutes = app.getRoutes() as Array<{
      method: string;
      path: string;
      schema?: SchemaConfig;
      meta?: RouteMeta;
    }>;

    for (const route of routerRoutes) {
      const key = `${route.method}:${route.path}`;

      // Skip if already tracked or is swagger route
      if (
        trackedKeys.has(key) ||
        route.path.startsWith(docsPath) ||
        route.path === specPath
      ) {
        continue;
      }

      allRoutes.push({
        method: route.method as HTTPMethod,
        path: route.path,
        schema: route.schema,
        meta: route.meta
      });
    }
  }

  // Sort routes by path for consistent ordering
  return allRoutes.sort((a, b) => a.path.localeCompare(b.path));
}

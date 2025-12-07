import { extractPathParams } from './extractPathParams';
import { zodToParams } from './zodToParams';
import { zodToExample } from './zodToExample';
import { getTagFromPath } from './getTagFromPath';
import { generateSummary } from './generateSummary';
import { generatePlaygroundHTML } from './generatePlaygroundHTML';
import { Application } from '../../core/application';
import { RouteConfig, HTTPMethod, Context, Plugin, SchemaConfig, RouteMeta } from '../../core/types';
import { PlaygroundConfig, StoredRoute } from './types';


/**
 * API Playground Plugin
 * Provides an interactive API explorer with authentication and development-mode security
 * 
 * @param config - Configuration options for the playground
 * @returns Plugin instance
 * 
 * @example
 * ```typescript
 * app.use(playground({
 *   path: '/playground',
 *   developmentOnly: true,
 *   auth: {
 *     username: 'admin',
 *     password: 'secret123'
 *   }
 * }));
 * ```
 */
export function playground(config: PlaygroundConfig = {}): Plugin {
  const resolvedConfig: PlaygroundConfig = {
    path: '/playground',
    title: 'API Playground',
    theme: 'dark',
    enableHistory: true,
    maxHistory: 50,
    enableVariables: true,
    developmentOnly: true,
    defaultHeaders: { 'Content-Type': 'application/json' },
    variables: { baseUrl: 'http://localhost:3000', token: '' },
    ...config
  };

  const routes: StoredRoute[] = [];
  let detectedBaseUrl = '';
  let appInstance: Application | null = null;

  return {
    name: 'playground',
    version: '1.0.0',

    install(app: Application) {
      // Check if playground should be disabled in production
      if (resolvedConfig.developmentOnly && process.env.NODE_ENV === 'production') {
        console.warn('⚠️  API Playground is disabled in production mode');
        return;
      }

      appInstance = app;
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
            routes.push({ method, path, schema: handlerOrConfig.schema, meta: handlerOrConfig.meta });
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

      /**
       * Authentication middleware for playground routes
       * Implements HTTP Basic Authentication when auth config is provided
       */
      const authMiddleware = (ctx: any) => {
        if (!resolvedConfig.auth) {
          return true; // No auth required
        }

        const authHeader = ctx.raw?.req?.headers?.authorization || ctx.headers?.get?.('authorization');

        if (!authHeader || !authHeader.startsWith('Basic ')) {
          return false;
        }

        try {
          const base64Credentials = authHeader.substring(6);
          const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
          const [username, password] = credentials.split(':');

          return (
            username === resolvedConfig.auth.username &&
            password === resolvedConfig.auth.password
          );
        } catch (error) {
          return false;
        }
      };

      /**
       * Returns 401 Unauthorized response with WWW-Authenticate header
       * This triggers the browser's native authentication dialog
       */
      const unauthorizedResponse = () => {
        return {
          statusCode: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="API Playground"',
            'Content-Type': 'text/plain'
          },
          body: 'Unauthorized'
        };
      };

      originalGet(basePath, async (ctx: any) => {
        // Check authentication
        if (!authMiddleware(ctx)) {
          return unauthorizedResponse();
        }

        if (!detectedBaseUrl && ctx.raw?.req) {
          const req = ctx.raw.req;
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          const host = req.headers.host || 'localhost:3000';
          detectedBaseUrl = `${protocol}://${host}`;
        }
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          body: generatePlaygroundHTML(resolvedConfig, detectedBaseUrl)
        };
      });

      originalGet(basePath + '/api/routes', async (ctx: Context) => {
        // Check authentication
        if (!authMiddleware(ctx)) {
          return unauthorizedResponse();
        }

        // Combine intercepted routes with routes from router (for file-based routing)
        const allRoutes = getAllRoutes(routes, appInstance, basePath);

        const routesData = allRoutes.map(r => ({
          method: r.method,
          path: r.path,
          summary: r.meta?.summary || generateSummary(r.method as HTTPMethod, r.path),
          description: r.meta?.description,
          tags: r.meta?.tags || [getTagFromPath(r.path)],
          deprecated: r.meta?.deprecated,
          responses: r.meta?.responses,
          example: r.meta?.example,
          schema: {
            body: r.schema?.body ? zodToExample(r.schema.body) : null,
            query: r.schema?.query ? zodToParams(r.schema.query) : null,
            params: extractPathParams(r.path)
          }
        }));
        return ctx.json(routesData);
      });
    }
  };
}

/**
 * Get all routes by combining intercepted routes with routes from the router
 * This ensures file-based routes are also included
 */
function getAllRoutes(
  interceptedRoutes: StoredRoute[],
  app: Application | null,
  basePath: string
): StoredRoute[] {
  // Create a Set of already tracked route keys (method + path)
  const trackedKeys = new Set(
    interceptedRoutes.map(r => `${r.method}:${r.path}`)
  );

  // Start with intercepted routes (filtered)
  const allRoutes: StoredRoute[] = interceptedRoutes.filter(
    r => !r.path.startsWith(basePath)
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

      // Skip if already tracked or is playground route
      if (trackedKeys.has(key) || route.path.startsWith(basePath)) {
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

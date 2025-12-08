/**
 * Router implementation with schema validation
 */

import { RadixTree } from './radix-tree';
import {
  HTTPMethod,
  Handler,
  Middleware,
  RouteConfig,
  RouteMatch,
  SchemaConfig,
  RouteMeta,
  Context
} from '../types';
import { SerializerFunction, createSerializer, JSONSchema } from '../serializer';

/**
 * Route with validation schema and metadata
 */
export interface RouteEntry {
  handler: Handler;
  middlewares: Middleware[];
  schema?: SchemaConfig;
  meta?: RouteMeta;
  serializers?: Map<number | string, SerializerFunction>;
}

/**
 * Router options
 */
export interface RouterOptions {
  prefix?: string;
  enableRegexRoutes?: boolean;
}

/**
 * Router class
 */
export class Router {
  private trees: Map<HTTPMethod, RadixTree> = new Map();
  private routes: Array<{ method: HTTPMethod; path: string; config: RouteEntry }> = [];
  private prefix: string = '';
  private enableRegexRoutes: boolean = false;

  constructor(options: RouterOptions | string = '') {
    // Support legacy string prefix or new options object
    if (typeof options === 'string') {
      this.prefix = options;
    } else {
      this.prefix = options.prefix || '';
      this.enableRegexRoutes = options.enableRegexRoutes || false;
    }
    
    // Initialize trees for each HTTP method
    const methods: HTTPMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    for (const method of methods) {
      this.trees.set(method, new RadixTree(this.enableRegexRoutes));
    }
  }

  /**
   * Register a route
   */
  addRoute(config: RouteConfig): void {
    const { method, path, handler, middlewares = [], schema, meta } = config;
    const fullPath = this.prefix ? `${this.prefix}${path}` : path;

    const tree = this.trees.get(method);
    if (!tree) {
      throw new Error(`Unsupported HTTP method: ${method}`);
    }

    // Wrap handler with schema validation if provided
    const wrappedHandler = schema ? this.wrapWithValidation(handler, schema) : handler;

    // Compile response serializers if response schema is provided
    let serializers: Map<number | string, SerializerFunction> | undefined;
    if (schema?.response) {
      serializers = this.compileResponseSerializers(schema.response);
    }

    tree.insert(fullPath, wrappedHandler, middlewares, serializers);

    // Store for introspection (including schema, meta, and serializers for documentation)
    this.routes.push({
      method,
      path: fullPath,
      config: { handler: wrappedHandler, middlewares, schema, meta, serializers }
    });
  }

  /**
   * Compile response schemas into fast serializers
   */
  private compileResponseSerializers(
    responseSchema: Record<string | number, any>
  ): Map<number | string, SerializerFunction> {
    const serializers = new Map<number | string, SerializerFunction>();

    for (const [statusKey, schema] of Object.entries(responseSchema)) {
      if (schema && typeof schema === 'object') {
        try {
          const serializer = createSerializer(schema as JSONSchema);
          serializers.set(statusKey, serializer);
        } catch (e) {
          // If compilation fails, skip this serializer (will fall back to JSON.stringify)
          console.warn(`[Router] Failed to compile serializer for status ${statusKey}:`, e);
        }
      }
    }

    return serializers;
  }

  /**
   * Find a matching route
   */
  match(method: string, path: string): RouteMatch | null {
    const tree = this.trees.get(method as HTTPMethod);
    if (!tree) {
      return null;
    }

    const result = tree.search(path);
    if (!result) {
      return null;
    }

    return {
      handler: result.handler,
      params: result.params,
      middlewares: result.middlewares,
      schema: undefined, // Schema already applied in wrapped handler
      _serializer: result.serializers || undefined
    };
  }

  /**
   * Get all registered routes with full metadata
   */
  getRoutes(): Array<{ method: string; path: string; schema?: SchemaConfig; meta?: RouteMeta }> {
    return this.routes.map(r => ({
      method: r.method,
      path: r.path,
      schema: r.config.schema,
      meta: r.config.meta
    }));
  }

  /**
   * Get raw route configs for merging into Application
   */
  getRawRoutes(): Array<{ method: HTTPMethod; path: string; config: RouteEntry }> {
    return this.routes;
  }

  /**
   * Get internal radix trees for merging
   */
  getTrees(): Map<HTTPMethod, RadixTree> {
    return this.trees;
  }

  /**
   * Mount another router with a prefix (group routes)
   * 
   * @example
   * ```typescript
   * const userRoutes = new Router();
   * userRoutes.get('/', getAllUsers);
   * userRoutes.get('/:id', getUserById);
   * 
   * const router = new Router();
   * router.group('/api/users', userRoutes);
   * ```
   */
  group(prefix: string, router: Router): void {
    const routes = router.getRawRoutes();
    for (const route of routes) {
      const fullPath = `${prefix}${route.path}`;
      this.addRoute({
        method: route.method,
        path: fullPath,
        handler: route.config.handler,
        middlewares: route.config.middlewares,
        schema: route.config.schema,
        meta: route.config.meta
      });
    }
  }

  /**
   * Convenience methods for HTTP verbs
   */
  get(path: string, handler: Handler, options?: Partial<RouteConfig>): void {
    this.addRoute({ method: 'GET', path, handler, ...options });
  }

  post(path: string, handler: Handler, options?: Partial<RouteConfig>): void {
    this.addRoute({ method: 'POST', path, handler, ...options });
  }

  put(path: string, handler: Handler, options?: Partial<RouteConfig>): void {
    this.addRoute({ method: 'PUT', path, handler, ...options });
  }

  delete(path: string, handler: Handler, options?: Partial<RouteConfig>): void {
    this.addRoute({ method: 'DELETE', path, handler, ...options });
  }

  patch(path: string, handler: Handler, options?: Partial<RouteConfig>): void {
    this.addRoute({ method: 'PATCH', path, handler, ...options });
  }

  /**
   * Wrap handler with schema validation
   */
  private wrapWithValidation(handler: Handler, schema: SchemaConfig): Handler {
    return async (ctx: Context) => {
      try {
        // Validate params
        if (schema.params) {
          ctx.params = await schema.params.parseAsync(ctx.params);
        }

        // Validate query
        if (schema.query) {
          ctx.query = await schema.query.parseAsync(ctx.query);
        }

        // Validate body - MUST await getBody() first to parse the request body
        if (schema.body) {
          const rawBody = await ctx.getBody();
          ctx.body = await schema.body.parseAsync(rawBody);
        }

        // Validate headers
        if (schema.headers) {
          ctx.headers = await schema.headers.parseAsync(ctx.headers);
        }

        // Call original handler with validated data
        return handler(ctx, {});
      } catch (error: any) {
        // Zod validation error
        if (error.name === 'ZodError') {
          // Use custom error handler if provided
          if (schema.onValidationError) {
            const customResponse = schema.onValidationError(error.errors, ctx);
            // If it's already a Response object, return it
            if (customResponse?.statusCode) {
              return customResponse;
            }
            // Otherwise wrap it as JSON response
            return ctx.json(customResponse, 400);
          }

          // Default error response - extract first error message
          const firstError = error.errors[0];
          const message = firstError?.message || 'Validation failed';

          return ctx.json({
            success: false,
            message
          }, 400);
        }
        throw error;
      }
    };
  }
}

// Re-export file router
export { FileRouter, createFileRouter, useFileRoutes } from './file-router';
export type { FileRouterOptions, FileRouteClass, RouteModule } from './file-router';

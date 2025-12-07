import { RouteConfig } from '../../core/types';
import { generateSpec } from './generateSpec';
import { generateSwaggerUI } from './generateSwaggerUI';
import { SwaggerConfig, StoredRoute, OpenAPISchema, OpenAPISpec } from './types';

// ============================================
// LEGACY EXPORTS (backward compatibility)
// ============================================
/**
 * SwaggerGenerator class for advanced/manual usage
 * @deprecated Use swagger() plugin instead
 */


export class SwaggerGenerator {
  private config: SwaggerConfig;
  private routes: StoredRoute[] = [];
  private schemas: Map<string, OpenAPISchema> = new Map();

  constructor(config: SwaggerConfig = {}) {
    this.config = {
      path: '/docs',
      specPath: '/openapi.json',
      ...config,
      info: {
        title: 'API Documentation',
        version: '1.0.0',
        ...config.info
      }
    };
  }

  registerRoutes(routes: RouteConfig[]): void {
    this.routes.push(...routes.map(r => ({
      method: r.method,
      path: r.path,
      schema: r.schema,
      meta: r.meta
    })));
  }

  registerRoute(route: RouteConfig): void {
    this.routes.push({
      method: route.method,
      path: route.path,
      schema: route.schema,
      meta: route.meta
    });
  }

  registerSchema(name: string, schema: OpenAPISchema): void {
    this.schemas.set(name, schema);
  }

  generateSpec(): OpenAPISpec {
    return generateSpec(this.routes, this.schemas, this.config, '');
  }

  generateSwaggerUI(): string {
    return generateSwaggerUI(this.config);
  }

  getConfig(): SwaggerConfig {
    return this.config;
  }
}

import { buildOperation } from './buildOperation';
import { convertPath } from './convertPath';
import { StoredRoute, OpenAPISchema, SwaggerConfig, OpenAPISpec, OpenAPIOperation } from './types';

// ============================================
// SPEC GENERATION
// ============================================
/**
 * Generate OpenAPI specification from routes
 */


export function generateSpec(
  routes: StoredRoute[],
  schemas: Map<string, OpenAPISchema>,
  config: SwaggerConfig,
  serverUrl: string
): OpenAPISpec {
  const paths: Record<string, Record<string, OpenAPIOperation>> = {};
  const tags = new Map<string, { name: string; description?: string; }>();

  // Add predefined tags
  if (config.tags) {
    config.tags.forEach(tag => tags.set(tag.name, tag));
  }

  for (const route of routes) {
    // Skip swagger's own endpoints
    if (route.path === config.path || route.path === config.specPath) {
      continue;
    }

    // Skip untagged routes if configured
    if (config.hideUntagged && (!route.meta?.tags || route.meta.tags.length === 0)) {
      continue;
    }

    const openApiPath = convertPath(route.path);

    if (!paths[openApiPath]) {
      paths[openApiPath] = {};
    }

    const operation = buildOperation(route, config);
    paths[openApiPath][route.method.toLowerCase()] = operation;

    // Collect tags
    if (route.meta?.tags) {
      route.meta.tags.forEach(tag => {
        if (!tags.has(tag)) {
          tags.set(tag, { name: tag });
        }
      });
    }
  }

  // Sort tags if configured
  let tagList = Array.from(tags.values());
  if (config.sortTags) {
    tagList = tagList.sort((a, b) => a.name.localeCompare(b.name));
  }

  const spec: OpenAPISpec = {
    openapi: '3.0.3',
    info: {
      title: config.info?.title || 'API Documentation',
      version: config.info?.version || '1.0.0',
      ...config.info
    },
    paths,
    tags: tagList
  };

  // Add servers
  if (config.servers && config.servers.length > 0) {
    spec.servers = config.servers;
  } else if (serverUrl) {
    spec.servers = [{ url: serverUrl, description: 'Current server' }];
  }

  // Add components
  if (schemas.size > 0 || config.securitySchemes) {
    spec.components = {};

    if (schemas.size > 0) {
      spec.components.schemas = Object.fromEntries(schemas);
    }

    if (config.securitySchemes) {
      spec.components.securitySchemes = config.securitySchemes;
    }
  }

  // Add global security
  if (config.security) {
    spec.security = config.security;
  }

  // Add external docs
  if (config.externalDocs) {
    spec.externalDocs = config.externalDocs;
  }

  return spec;
}

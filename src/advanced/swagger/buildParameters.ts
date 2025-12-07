import { zodToOpenAPI } from './zodToOpenAPI';
import { zodSchemaToOpenAPI } from './zodSchemaToOpenAPI';
import { capitalize } from './capitalize';
import { StoredRoute, OpenAPIParameter, OpenAPISchema } from './types';

/**
 * Build parameters from route schema
 */


export function buildParameters(route: StoredRoute): OpenAPIParameter[] {
  const parameters: OpenAPIParameter[] = [];

  // Extract path parameters
  const pathParams = route.path.match(/:(\w+)/g);
  if (pathParams) {
    for (const param of pathParams) {
      const name = param.slice(1);
      const schemaFromZod = zodToOpenAPI(route.schema?.params, name);
      parameters.push({
        name,
        in: 'path',
        required: true,
        description: `${capitalize(name)} parameter`,
        schema: schemaFromZod || { type: 'string' }
      });
    }
  }

  // Add query parameters from schema
  if (route.schema?.query) {
    const querySchema = zodSchemaToOpenAPI(route.schema.query);
    if (querySchema.properties) {
      for (const [name, schema] of Object.entries(querySchema.properties)) {
        parameters.push({
          name,
          in: 'query',
          required: querySchema.required?.includes(name) || false,
          schema: schema as OpenAPISchema
        });
      }
    }
  }

  // Add header parameters from schema
  if (route.schema?.headers) {
    const headerSchema = zodSchemaToOpenAPI(route.schema.headers);
    if (headerSchema.properties) {
      for (const [name, schema] of Object.entries(headerSchema.properties)) {
        parameters.push({
          name,
          in: 'header',
          required: headerSchema.required?.includes(name) || false,
          schema: schema as OpenAPISchema
        });
      }
    }
  }

  return parameters;
}

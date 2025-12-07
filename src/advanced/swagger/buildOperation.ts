import { buildRequestBody } from './buildRequestBody';
import { buildParameters } from './buildParameters';
import { buildResponses } from './buildResponses';
import { capitalize } from './capitalize';
import { generateOperationId } from './generateOperationId';
import { generateSummary } from './generateSummary';
import { StoredRoute, SwaggerConfig, OpenAPIOperation } from './types';

/**
 * Build OpenAPI operation from route
 */


export function buildOperation(route: StoredRoute, config: SwaggerConfig): OpenAPIOperation {
  const meta = route.meta || {};

  const operation: OpenAPIOperation = {
    responses: buildResponses(meta.responses, route.method)
  };

  // Auto-generate summary from path if not provided
  if (meta.summary) {
    operation.summary = meta.summary;
  } else {
    operation.summary = generateSummary(route.method, route.path);
  }

  if (meta.description) {
    operation.description = meta.description;
  }

  if (meta.tags && meta.tags.length > 0) {
    operation.tags = meta.tags;
  } else if (!config.hideUntagged) {
    // Auto-tag based on first path segment
    const firstSegment = route.path.split('/').filter(Boolean)[0];
    if (firstSegment && !firstSegment.startsWith(':')) {
      operation.tags = [capitalize(firstSegment)];
    }
  }

  if (meta.deprecated) {
    operation.deprecated = true;
  }

  // Generate operation ID
  operation.operationId = generateOperationId(route.method, route.path);

  // Build parameters from schema
  const parameters = buildParameters(route);
  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  // Build request body for POST/PUT/PATCH
  if (route.schema?.body && ['POST', 'PUT', 'PATCH'].includes(route.method)) {
    operation.requestBody = buildRequestBody(route.schema);
  }

  return operation;
}

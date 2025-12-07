import { zodSchemaToOpenAPI } from './zodSchemaToOpenAPI';
import { SchemaConfig } from '../../core/types';
import { OpenAPIRequestBody, OpenAPISchema } from './types';

/**
 * Build request body from schema
 */


export function buildRequestBody(schema: SchemaConfig): OpenAPIRequestBody {
  const bodySchema = schema.body ? zodSchemaToOpenAPI(schema.body) : { type: 'object' };

  return {
    required: true,
    content: {
      'application/json': {
        schema: bodySchema as OpenAPISchema
      }
    }
  };
}

import { HTTPMethod } from '../../core/types';
import { OpenAPIResponse } from './types';

/**
 * Build response objects
 */


export function buildResponses(
  responses?: Record<number, string>,
  method?: HTTPMethod
): Record<string, OpenAPIResponse> {
  const result: Record<string, OpenAPIResponse> = {};

  if (responses) {
    for (const [code, description] of Object.entries(responses)) {
      result[code] = {
        description,
        content: {
          'application/json': {
            schema: { type: 'object' }
          }
        }
      };
    }
  }

  // Add default responses based on method
  if (!result['200'] && !result['201'] && !result['204']) {
    if (method === 'POST') {
      result['201'] = {
        description: 'Created successfully',
        content: { 'application/json': { schema: { type: 'object' } } }
      };
    } else if (method === 'DELETE') {
      result['204'] = { description: 'Deleted successfully' };
    } else {
      result['200'] = {
        description: 'Successful response',
        content: { 'application/json': { schema: { type: 'object' } } }
      };
    }
  }

  // Add common error responses
  if (!result['400']) {
    result['400'] = { description: 'Bad request' };
  }
  if (!result['500']) {
    result['500'] = { description: 'Internal server error' };
  }

  return result;
}

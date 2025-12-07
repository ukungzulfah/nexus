import { HTTPMethod } from '../../core/types';

/**
 * Auto-generate summary from method and path
 */


export function generateSummary(method: HTTPMethod, path: string): string {
  const parts = path.split('/').filter(Boolean);
  const resource = parts.find(p => !p.startsWith(':')) || 'resource';
  const hasId = parts.some(p => p.startsWith(':'));

  const actions: Record<HTTPMethod, string> = {
    'GET': hasId ? `Get ${resource} by ID` : `List all ${resource}`,
    'POST': `Create ${resource}`,
    'PUT': `Update ${resource}`,
    'PATCH': `Partial update ${resource}`,
    'DELETE': `Delete ${resource}`,
    'HEAD': `Check ${resource}`,
    'OPTIONS': `Options for ${resource}`
  };

  return actions[method] || `${method} ${path}`;
}

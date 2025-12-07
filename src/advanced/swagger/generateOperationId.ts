import { capitalize } from './capitalize';
import { HTTPMethod } from '../../core/types';

/**
 * Generate operation ID from method and path
 */


export function generateOperationId(method: HTTPMethod, path: string): string {
  const parts = path
    .split('/')
    .filter(Boolean)
    .map(part => {
      if (part.startsWith(':')) {
        return 'By' + capitalize(part.slice(1));
      }
      return capitalize(part);
    });

  return method.toLowerCase() + parts.join('');
}

import { OpenAPISchema } from './types';
import { zodFieldToOpenAPI } from './zodFieldToOpenAPI';

/**
 * Extract specific field from Zod schema
 */


export function zodToOpenAPI(zodSchema: any, fieldName: string): OpenAPISchema | null {
  if (!zodSchema) return null;

  try {
    const shape = zodSchema._def?.shape?.() || zodSchema.shape;
    if (shape && shape[fieldName]) {
      return zodFieldToOpenAPI(shape[fieldName]);
    }
  } catch {
    // Fall through
  }

  return null;
}

import { zodFieldToOpenAPI } from './zodFieldToOpenAPI';
import { OpenAPISchema } from './types';

// ============================================
// ZOD TO OPENAPI CONVERSION
// ============================================
/**
 * Convert Zod schema to OpenAPI schema
 */


export function zodSchemaToOpenAPI(zodSchema: any): OpenAPISchema {
  if (!zodSchema) {
    return { type: 'object' };
  }

  // If it's already an OpenAPI schema
  if (zodSchema.type || zodSchema.$ref) {
    return zodSchema;
  }

  try {
    const shape = zodSchema._def?.shape?.() || zodSchema.shape;

    if (shape) {
      const properties: Record<string, OpenAPISchema> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodFieldToOpenAPI(value);

        // Check if field is required
        const def = (value as any)?._def;
        if (def?.typeName !== 'ZodOptional' && def?.typeName !== 'ZodDefault') {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined
      };
    }
  } catch {
    // Fall through
  }

  return { type: 'object' };
}

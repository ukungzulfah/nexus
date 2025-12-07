import { OpenAPISchema } from './types';
import { zodSchemaToOpenAPI } from './zodSchemaToOpenAPI';

/**
 * Convert individual Zod field to OpenAPI schema
 */


export function zodFieldToOpenAPI(field: any): OpenAPISchema {
  if (!field?._def) {
    return { type: 'string' };
  }

  const def = field._def;
  const typeName = def.typeName;

  switch (typeName) {
    case 'ZodString': {
      const schema: OpenAPISchema = { type: 'string' };

      // Extract string constraints
      for (const check of def.checks || []) {
        if (check.kind === 'email') schema.format = 'email';
        if (check.kind === 'url') schema.format = 'uri';
        if (check.kind === 'uuid') schema.format = 'uuid';
        if (check.kind === 'min') schema.minLength = check.value;
        if (check.kind === 'max') schema.maxLength = check.value;
        if (check.kind === 'regex') schema.pattern = check.regex.source;
      }

      return schema;
    }

    case 'ZodNumber': {
      const schema: OpenAPISchema = { type: 'number' };

      // Extract number constraints
      for (const check of def.checks || []) {
        if (check.kind === 'int') schema.type = 'integer';
        if (check.kind === 'min') schema.minimum = check.value;
        if (check.kind === 'max') schema.maximum = check.value;
      }

      return schema;
    }

    case 'ZodBoolean':
      return { type: 'boolean' };

    case 'ZodArray':
      return {
        type: 'array',
        items: zodFieldToOpenAPI(def.type)
      };

    case 'ZodObject':
      return zodSchemaToOpenAPI(field);

    case 'ZodEnum':
      return {
        type: 'string',
        enum: def.values
      };

    case 'ZodOptional':
    case 'ZodNullable':
      return zodFieldToOpenAPI(def.innerType);

    case 'ZodDefault':
      const innerSchema = zodFieldToOpenAPI(def.innerType);
      innerSchema.default = def.defaultValue();
      return innerSchema;

    case 'ZodLiteral':
      return {
        type: typeof def.value === 'number' ? 'number' :
          typeof def.value === 'boolean' ? 'boolean' : 'string',
        enum: [def.value]
      };

    case 'ZodUnion':
      // For simple unions, just use the first type
      if (def.options?.length > 0) {
        return zodFieldToOpenAPI(def.options[0]);
      }
      return { type: 'string' };

    case 'ZodDate':
      return { type: 'string', format: 'date-time' };

    default:
      return { type: 'string' };
  }
}

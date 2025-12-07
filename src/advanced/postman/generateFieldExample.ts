import { generateExampleFromZod } from './generateExampleFromZod';


export function generateFieldExample(field: any, fieldName: string): any {
  if (!field?._def) return '';

  const def = field._def;
  const typeName = def.typeName;

  switch (typeName) {
    case 'ZodString': {
      // Check for specific formats
      for (const check of def.checks || []) {
        if (check.kind === 'email') return 'user@example.com';
        if (check.kind === 'url') return 'https://example.com';
        if (check.kind === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
      }
      // Generate based on field name
      if (fieldName.toLowerCase().includes('email')) return 'user@example.com';
      if (fieldName.toLowerCase().includes('password')) return 'password123';
      if (fieldName.toLowerCase().includes('name')) return 'John Doe';
      if (fieldName.toLowerCase().includes('username')) return 'johndoe';
      if (fieldName.toLowerCase().includes('phone')) return '+1234567890';
      if (fieldName.toLowerCase().includes('token')) return 'your-token-here';
      return 'string';
    }
    case 'ZodNumber':
      return 0;
    case 'ZodBoolean':
      return true;
    case 'ZodArray':
      return [generateFieldExample(def.type, 'item')];
    case 'ZodObject':
      return generateExampleFromZod(field);
    case 'ZodEnum':
      return def.values?.[0] || 'enum';
    case 'ZodOptional':
    case 'ZodNullable':
      return generateFieldExample(def.innerType, fieldName);
    case 'ZodDefault':
      return def.defaultValue();
    default:
      return '';
  }
}

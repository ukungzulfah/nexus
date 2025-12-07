import { zodToExample } from './zodToExample';



export function generateFieldExample(field: any, fieldName: string): any {
    if (!field?._def) return '';
    const def = field._def;
    const typeName = def.typeName;
    switch (typeName) {
        case 'ZodString': {
            for (const check of def.checks || []) {
                if (check.kind === 'email') return 'user@example.com';
                if (check.kind === 'url') return 'https://example.com';
                if (check.kind === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
            }
            if (fieldName.toLowerCase().includes('email')) return 'user@example.com';
            if (fieldName.toLowerCase().includes('password')) return 'password123';
            if (fieldName.toLowerCase().includes('name')) return 'John Doe';
            if (fieldName.toLowerCase().includes('username')) return 'johndoe';
            return 'string';
        }
        case 'ZodNumber': return 0;
        case 'ZodBoolean': return true;
        case 'ZodArray': return [];
        case 'ZodObject': return zodToExample(field);
        case 'ZodEnum': return def.values?.[0] || 'enum';
        case 'ZodOptional':
        case 'ZodNullable': return generateFieldExample(def.innerType, fieldName);
        default: return '';
    }
}

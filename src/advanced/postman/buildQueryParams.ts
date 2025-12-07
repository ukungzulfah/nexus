import { PostmanQuery } from './types';


export function buildQueryParams(querySchema: any): PostmanQuery[] {
  const params: PostmanQuery[] = [];

  try {
    const shape = querySchema._def?.shape?.() || querySchema.shape;
    if (shape) {
      for (const [key, value] of Object.entries(shape)) {
        const def = (value as any)?._def;
        const isOptional = def?.typeName === 'ZodOptional';

        params.push({
          key,
          value: '',
          disabled: isOptional,
          description: isOptional ? '(optional)' : undefined
        });
      }
    }
  } catch {
    // Ignore errors
  }

  return params;
}

import { generateFieldExample } from './generateFieldExample';



export function zodToExample(schema: any): any {
    if (!schema?._def) return {};
    try {
        const shape = schema._def?.shape?.() || schema.shape;
        if (!shape) return {};
        const example: Record<string, any> = {};
        for (const [key, value] of Object.entries(shape)) {
            example[key] = generateFieldExample(value, key);
        }
        return example;
    } catch { return {}; }
}

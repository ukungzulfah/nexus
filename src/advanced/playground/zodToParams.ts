

export function zodToParams(schema: any): Array<{ name: string; optional: boolean; }> {
    const params: Array<{ name: string; optional: boolean; }> = [];
    try {
        const shape = schema._def?.shape?.() || schema.shape;
        if (shape) {
            for (const [key, value] of Object.entries(shape)) {
                const def = (value as any)?._def;
                params.push({ name: key, optional: def?.typeName === 'ZodOptional' });
            }
        }
    } catch { }
    return params;
}

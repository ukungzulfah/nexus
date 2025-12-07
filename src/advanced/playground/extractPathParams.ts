

export function extractPathParams(path: string): Array<{ name: string; }> {
    const matches = path.match(/:(\w+)/g) || [];
    return matches.map(m => ({ name: m.slice(1) }));
}

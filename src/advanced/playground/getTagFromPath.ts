

export function getTagFromPath(path: string): string {
    const firstSegment = path.split('/').filter(Boolean)[0];
    if (firstSegment && !firstSegment.startsWith(':')) {
        return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
    }
    return 'General';
}

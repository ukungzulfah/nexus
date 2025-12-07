/**
 * Generate ETag from file stats
 */

export function generateETag(stats: { size: number; mtimeMs: number; }): string {
    return `"${stats.size.toString(16)}-${stats.mtimeMs.toString(16)}"`;
}

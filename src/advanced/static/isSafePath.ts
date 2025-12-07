import { normalize, resolve } from 'path/posix';

/**
 * Check if path is safe (no directory traversal)
 */

export function isSafePath(requestPath: string, root: string): boolean {
    const normalizedPath = normalize(requestPath);
    const fullPath = resolve(root, normalizedPath);
    const normalizedRoot = resolve(root);

    return fullPath.startsWith(normalizedRoot);
}

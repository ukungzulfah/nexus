/**
 * Convert Express-style path to OpenAPI path
 * :id -> {id}
 */


export function convertPath(path: string): string {
  return path.replace(/:(\w+)/g, '{$1}');
}

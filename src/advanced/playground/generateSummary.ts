import { HTTPMethod } from '../../core/types';



export function generateSummary(method: HTTPMethod, path: string): string {
    const parts = path.split('/').filter(Boolean);
    const resource = parts.find(p => !p.startsWith(':')) || 'resource';
    const hasId = parts.some(p => p.startsWith(':'));
    const actions: Record<HTTPMethod, string> = {
        'GET': hasId ? `Get ${resource}` : `List ${resource}`,
        'POST': `Create ${resource}`,
        'PUT': `Update ${resource}`,
        'PATCH': `Patch ${resource}`,
        'DELETE': `Delete ${resource}`,
        'HEAD': `Head ${resource}`,
        'OPTIONS': `Options ${resource}`
    };
    return actions[method] || `${method} ${path}`;
}

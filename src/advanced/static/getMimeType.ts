import { MIME_TYPES } from './types';

/**
 * Get MIME type for a file extension
 */

export function getMimeType(ext: string): string {
    return MIME_TYPES[ext.toLowerCase()] || MIME_TYPES[''];
}

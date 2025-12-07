/**
 * Security Utility Helpers
 * 
 * Helper functions for working with security features
 */

import type { Context } from '../core/types';

/**
 * Get header value as string (handles string | string[] | undefined)
 */
export function getHeader(ctx: Context, name: string): string | null {
    const value = ctx.headers[name.toLowerCase()];

    if (!value) {
        return null;
    }

    if (Array.isArray(value)) {
        return value[0] || null;
    }

    return value;
}

/**
 * Get all header values as array
 */
export function getHeaderValues(ctx: Context, name: string): string[] {
    const value = ctx.headers[name.toLowerCase()];

    if (!value) {
        return [];
    }

    if (Array.isArray(value)) {
        return value;
    }

    return [value];
}

/**
 * Set response header safely
 */
export function setResponseHeader(
    headers: Record<string, string>,
    name: string,
    value: string
): void {
    headers[name] = value;
}

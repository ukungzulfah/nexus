/**
 * MIME types mapping
 */

export const MIME_TYPES: Record<string, string> = {
    // Text
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',

    // Images
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',

    // Fonts
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',

    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.flac': 'audio/flac',

    // Video
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',

    // Documents
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

    // Archives
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',

    // Data
    '.wasm': 'application/wasm',
    '.map': 'application/json',

    // Default
    '': 'application/octet-stream'
};


/**
 * Static file serving configuration
 */
export interface StaticConfig {
    /**
     * Root directory to serve files from
     * @default './public'
     */
    root?: string;

    /**
     * URL prefix for static files
     * @default '' (serve from root)
     * @example '/static' → /static/image.png serves ./public/image.png
     */
    prefix?: string;

    /**
     * Default file to serve for directory requests
     * @default 'index.html'
     */
    index?: string | string[] | false;

    /**
     * Enable directory listing
     * @default false
     */
    directory?: boolean;

    /**
     * Maximum age for Cache-Control header (in seconds)
     * @default 86400 (1 day)
     */
    maxAge?: number;

    /**
     * Enable immutable caching (for versioned assets)
     * @default false
     */
    immutable?: boolean;

    /**
     * Enable ETag generation
     * @default true
     */
    etag?: boolean;

    /**
     * Enable Last-Modified header
     * @default true
     */
    lastModified?: boolean;

    /**
     * Allowed file extensions (whitelist)
     * @default undefined (allow all)
     * @example ['.html', '.css', '.js', '.png']
     */
    extensions?: string[];

    /**
     * Hidden files (dotfiles) handling
     * @default 'ignore'
     */
    dotfiles?: 'allow' | 'deny' | 'ignore';

    /**
     * Fallback file for SPA routing
     * @default undefined
     * @example 'index.html' for SPA
     */
    fallback?: string;

    /**
     * Custom headers to add to responses
     */
    headers?: Record<string, string>;

    /**
     * Enable gzip/brotli pre-compressed files
     * Looks for .gz or .br versions of files
     * @default false
     */
    precompressed?: boolean | ('gzip' | 'br')[];
}
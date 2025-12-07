import { existsSync, statSync, createReadStream } from 'fs';
import { resolve, join, extname } from 'path/posix';
import { generateDirectoryListing } from './generateDirectoryListing';
import { isSafePath } from './isSafePath';
import { generateETag } from './generateETag';
import { getMimeType } from './getMimeType';
import { Plugin, Handler, Response } from '../../core/types';
import { StaticConfig } from './types';

/**
 * Create static file serving feature
 */

export function serveStatic(config: StaticConfig = {}): Plugin {
    const {
        root = './public', prefix = '', index = 'index.html', directory = false, maxAge = 86400, immutable = false, etag = true, lastModified = true, extensions, dotfiles = 'ignore', fallback, headers = {}, precompressed = false
    } = config;

    const rootPath = resolve(process.cwd(), root);
    const normalizedPrefix = prefix.startsWith('/') ? prefix : prefix ? `/${prefix}` : '';

    return {
        name: 'static',
        version: '1.0.0',

        install(app: any) {
            // Create the static file handler
            const staticHandler: Handler = async (ctx) => {
                let requestPath = ctx.path;
                
                if (app.config?.debug) {
                    console.log(`📁 Static request: ${requestPath}`);
                }

                // Remove prefix if set
                if (normalizedPrefix && requestPath.startsWith(normalizedPrefix)) {
                    requestPath = requestPath.slice(normalizedPrefix.length) || '/';
                } else if (normalizedPrefix) {
                    // Path doesn't match prefix, skip
                    return { statusCode: 404, headers: {}, body: 'Not Found' };
                }

                // Decode URL
                try {
                    requestPath = decodeURIComponent(requestPath);
                } catch {
                    return { statusCode: 400, headers: {}, body: 'Bad Request' };
                }

                // Remove leading slash for joining
                const cleanPath = requestPath.startsWith('/') ? requestPath.slice(1) : requestPath;

                // Security: Check for directory traversal
                if (!isSafePath(cleanPath, rootPath)) {
                    return { statusCode: 403, headers: {}, body: 'Forbidden' };
                }

                const filePath = join(rootPath, cleanPath);

                // Handle dotfiles
                const basename = cleanPath.split('/').pop() || '';
                if (basename.startsWith('.')) {
                    if (dotfiles === 'deny') {
                        return { statusCode: 403, headers: {}, body: 'Forbidden' };
                    }
                    if (dotfiles === 'ignore') {
                        return { statusCode: 404, headers: {}, body: 'Not Found' };
                    }
                }

                // Check if file/directory exists
                if (!existsSync(filePath)) {
                    if (app.config?.debug) {
                        console.log(`📁 Static: File not found: ${filePath}`);
                    }
                    // Try fallback for SPA
                    if (fallback) {
                        const fallbackPath = join(rootPath, fallback);
                        if (existsSync(fallbackPath)) {
                            return serveFile(fallbackPath, ctx);
                        }
                    }
                    return { statusCode: 404, headers: {}, body: 'Not Found' };
                }

                const stats = statSync(filePath);

                // Handle directory
                if (stats.isDirectory()) {
                    // Try index file(s)
                    if (index !== false) {
                        const indexFiles = Array.isArray(index) ? index : [index];
                        for (const indexFile of indexFiles) {
                            const indexPath = join(filePath, indexFile);
                            if (existsSync(indexPath)) {
                                return serveFile(indexPath, ctx);
                            }
                        }
                    }

                    // Directory listing
                    if (directory) {
                        const html = await generateDirectoryListing(filePath, requestPath, normalizedPrefix);
                        return {
                            statusCode: 200,
                            headers: { 'Content-Type': 'text/html; charset=utf-8' },
                            body: html
                        };
                    }

                    return { statusCode: 404, headers: {}, body: 'Not Found' };
                }

                // Check extension whitelist
                const ext = extname(filePath);
                if (extensions && !extensions.includes(ext)) {
                    return { statusCode: 403, headers: {}, body: 'Forbidden' };
                }

                return serveFile(filePath, ctx);
            };

            // Helper to serve a file
            async function serveFile(filePath: string, ctx: any): Promise<Response> {
                const stats = statSync(filePath);
                const ext = extname(filePath);
                const mimeType = getMimeType(ext);

                const responseHeaders: Record<string, string> = {
                    'Content-Type': mimeType,
                    'Content-Length': stats.size.toString(),
                    ...headers
                };

                // Cache headers
                let cacheControl = `public, max-age=${maxAge}`;
                if (immutable) {
                    cacheControl += ', immutable';
                }
                responseHeaders['Cache-Control'] = cacheControl;

                // ETag
                if (etag) {
                    const etagValue = generateETag(stats);
                    responseHeaders['ETag'] = etagValue;

                    // Check If-None-Match
                    const ifNoneMatch = ctx.headers['if-none-match'];
                    if (ifNoneMatch === etagValue) {
                        return { statusCode: 304, headers: responseHeaders, body: '' };
                    }
                }

                // Last-Modified
                if (lastModified) {
                    const lastMod = stats.mtime.toUTCString();
                    responseHeaders['Last-Modified'] = lastMod;

                    // Check If-Modified-Since
                    const ifModifiedSince = ctx.headers['if-modified-since'];
                    if (ifModifiedSince) {
                        const ifModDate = new Date(ifModifiedSince);
                        if (stats.mtime <= ifModDate) {
                            return { statusCode: 304, headers: responseHeaders, body: '' };
                        }
                    }
                }

                // Check for pre-compressed version
                if (precompressed) {
                    const acceptEncoding = ctx.headers['accept-encoding'] || '';
                    const compressions = Array.isArray(precompressed)
                        ? precompressed
                        : ['br', 'gzip'];

                    for (const encoding of compressions) {
                        if (acceptEncoding.includes(encoding)) {
                            const ext = encoding === 'br' ? '.br' : '.gz';
                            const compressedPath = filePath + ext;
                            if (existsSync(compressedPath)) {
                                const compressedStats = statSync(compressedPath);
                                responseHeaders['Content-Encoding'] = encoding;
                                responseHeaders['Content-Length'] = compressedStats.size.toString();
                                responseHeaders['Vary'] = 'Accept-Encoding';

                                return {
                                    statusCode: 200,
                                    headers: responseHeaders,
                                    body: '',
                                    stream: createReadStream(compressedPath)
                                };
                            }
                        }
                    }
                }

                // Stream the file
                return {
                    statusCode: 200,
                    headers: responseHeaders,
                    body: '',
                    stream: createReadStream(filePath)
                };
            }

            // Register static file handler
            if (normalizedPrefix) {
                // With prefix: only serve files under that prefix as routes
                app.get(`${normalizedPrefix}`, staticHandler);
                app.get(`${normalizedPrefix}/*`, staticHandler);
            } else {
                // Without prefix: register as fallback handler
                // This is called when no routes match, before 404
                if (typeof app.setFallbackHandler === 'function') {
                    app.setFallbackHandler(staticHandler);
                } else {
                    // Fallback: register as low-priority wildcard routes
                    // NOTE: This should be registered LAST after all API routes
                    app.get('/', staticHandler);
                    app.get('/*', staticHandler);
                }
            }

            if (app.config?.debug) {
                console.log(`📁 Static files: ${rootPath}`);
                if (normalizedPrefix) {
                    console.log(`   Prefix: ${normalizedPrefix}`);
                }
            }
        }
    };
}

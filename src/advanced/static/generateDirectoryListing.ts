import { readdir } from 'fs/promises';

/**
 * Generate HTML for directory listing
 */

export async function generateDirectoryListing(
    dirPath: string,
    urlPath: string,
    prefix: string = ''
): Promise<string> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    // Build full URL path with prefix
    const fullUrlPath = `${prefix}${urlPath}`.replace(/\/+/g, '/') || '/';
    const basePath = fullUrlPath.endsWith('/') ? fullUrlPath : `${fullUrlPath}/`;

    const items = entries
        .filter(e => !e.name.startsWith('.'))
        .map(entry => {
            const isDir = entry.isDirectory();
            const name = isDir ? `${entry.name}/` : entry.name;
            const href = `${basePath}${entry.name}`.replace(/\/+/g, '/');
            const icon = isDir ? '📁' : '📄';
            return `<li><a href="${href}">${icon} ${name}</a></li>`;
        })
        .join('\n');
    
    // Parent directory href (with prefix)
    const parentHref = fullUrlPath === '/' || fullUrlPath === prefix 
        ? null 
        : fullUrlPath.replace(/\/[^/]*\/?$/, '') || '/';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Index of ${fullUrlPath}</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
        h1 { color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        ul { list-style: none; padding: 0; }
        li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        a { color: #0066cc; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .parent { margin-bottom: 20px; }
    </style>
</head>
<body>
    <h1>Index of ${fullUrlPath}</h1>
    ${parentHref ? `<div class="parent"><a href="${parentHref}">📁 ..</a></div>` : ''}
    <ul>${items}</ul>
</body>
</html>`;
}

import { readdir } from 'fs/promises';
import { join } from 'path/posix';

/**
 * Generate HTML for directory listing
 */

export async function generateDirectoryListing(
    dirPath: string,
    urlPath: string
): Promise<string> {
    const entries = await readdir(dirPath, { withFileTypes: true });

    const items = entries
        .filter(e => !e.name.startsWith('.'))
        .map(entry => {
            const isDir = entry.isDirectory();
            const name = isDir ? `${entry.name}/` : entry.name;
            const href = join(urlPath, entry.name);
            const icon = isDir ? '📁' : '📄';
            return `<li><a href="${href}">${icon} ${name}</a></li>`;
        })
        .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Index of ${urlPath}</title>
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
    <h1>Index of ${urlPath}</h1>
    ${urlPath !== '/' ? `<div class="parent"><a href="${join(urlPath, '..')}">📁 ..</a></div>` : ''}
    <ul>${items}</ul>
</body>
</html>`;
}

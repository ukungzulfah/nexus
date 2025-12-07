import { generateThemeCss } from './generateThemeCss';
import { SwaggerConfig } from './types';

/**
 * Generate Swagger UI HTML
 */


export function generateSwaggerUI(config: SwaggerConfig): string {
  const specUrl = config.specPath || '/openapi.json';
  const title = config.info?.title || 'API Documentation';
  const themeCss = generateThemeCss(config.theme);
  const customCss = config.customCss || '';
  const favicon = config.favicon || 'https://unpkg.com/swagger-ui-dist@5/favicon-32x32.png';

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="icon" type="image/png" href="${favicon}">
    <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
    <style>
        html { box-sizing: border-box; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; background: #fafafa; }
        .swagger-ui .topbar { padding: 10px 0; }
        .swagger-ui .info { margin: 30px 0; }
        .swagger-ui .info hgroup.main { margin: 0 0 20px 0; }
        .swagger-ui .info .title { font-size: 36px; }
        ${themeCss}
        ${customCss}
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            window.ui = SwaggerUIBundle({
                url: "${specUrl}",
                dom_id: '#swagger-ui',
                deepLinking: true,
                docExpansion: '${config.docExpansion || 'list'}',
                filter: ${config.filter !== false},
                tryItOutEnabled: ${config.tryItOutEnabled !== false},
                persistAuthorization: ${config.persistAuthorization !== false},
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout",
                validatorUrl: null,
                supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'],
                defaultModelsExpandDepth: 2,
                defaultModelExpandDepth: 2,
                displayRequestDuration: true,
                showExtensions: true,
                showCommonExtensions: true
            });
        };
    </script>
</body>
</html>`;
}

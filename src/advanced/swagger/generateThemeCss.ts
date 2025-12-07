import { SwaggerTheme } from './types';

// ============================================
// SWAGGER UI GENERATION
// ============================================
/**
 * Generate theme CSS
 */
export function generateThemeCss(theme?: 'light' | 'dark' | SwaggerTheme): string {
  if (!theme) return '';

  if (theme === 'dark') {
    return `
            body { background-color: #1a1a2e !important; }
            .swagger-ui { background-color: #1a1a2e; }
            .swagger-ui .topbar { background-color: #16213e; }
            .swagger-ui .info .title { color: #e94560; }
            .swagger-ui .scheme-container { background: #16213e; }
            .swagger-ui .opblock-tag { color: #fff; border-bottom-color: #333; }
            .swagger-ui .opblock { background: rgba(255,255,255,0.05); border-color: #333; }
            .swagger-ui .opblock-summary { border-color: #333; }
            .swagger-ui .opblock .opblock-summary-description { color: #aaa; }
            .swagger-ui .opblock-body { background: #16213e; }
            .swagger-ui .parameter__name, .swagger-ui .parameter__type { color: #fff; }
            .swagger-ui table thead tr th { color: #fff; border-color: #333; }
            .swagger-ui table tbody tr td { color: #ddd; border-color: #333; }
            .swagger-ui .response-col_status { color: #e94560; }
            .swagger-ui section.models { border-color: #333; }
            .swagger-ui section.models h4 { color: #fff; }
            .swagger-ui .model-box { background: #16213e; }
            .swagger-ui .model { color: #ddd; }
            .swagger-ui input[type=text], .swagger-ui textarea { 
                background: #0f3460; color: #fff; border-color: #333; 
            }
            .swagger-ui select { background: #0f3460; color: #fff; }
            .swagger-ui .btn { border-color: #e94560; }
            .swagger-ui .btn.execute { background: #e94560; }
        `;
  }

  if (typeof theme === 'object') {
    return `
            ${theme.backgroundColor ? `body { background-color: ${theme.backgroundColor} !important; }` : ''}
            ${theme.primaryColor ? `.swagger-ui .info .title { color: ${theme.primaryColor}; }` : ''}
            ${theme.primaryColor ? `.swagger-ui .btn.execute { background: ${theme.primaryColor}; border-color: ${theme.primaryColor}; }` : ''}
            ${theme.headerColor ? `.swagger-ui .topbar { background-color: ${theme.headerColor}; }` : ''}
            ${theme.textColor ? `.swagger-ui { color: ${theme.textColor}; }` : ''}
            ${theme.fontFamily ? `.swagger-ui { font-family: ${theme.fontFamily}; }` : ''}
        `;
  }

  return '';
}

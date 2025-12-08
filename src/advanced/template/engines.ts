/**
 * Template Engine Adapters
 * Pre-built adapters for popular template engines
 * 
 * Users can register these engines to enable advanced template rendering
 */

import { TemplateEngine } from '../../core/types';

/**
 * Handlebars template engine adapter
 * 
 * Installation: npm install handlebars
 * 
 * @example
 * ```typescript
 * import { Route } from 'nexus';
 * import { HandlebarsEngine } from 'nexus/advanced/template';
 * 
 * // Register once at app startup
 * Route.registerEngine(HandlebarsEngine);
 * 
 * // Use in routes
 * class MyRoute extends Route {
 *   handler(ctx) {
 *     return this.render('./views/page.hbs', { user: { name: 'John' } });
 *   }
 * }
 * ```
 */
export const HandlebarsEngine: TemplateEngine = {
    name: 'handlebars',
    extensions: ['.hbs', '.handlebars'],
    render(template: string, data: Record<string, any>): string {
        try {
            const Handlebars = require('handlebars');
            const compiled = Handlebars.compile(template);
            return compiled(data);
        } catch (error: any) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error(
                    'Handlebars not installed. Install it with: npm install handlebars'
                );
            }
            throw error;
        }
    }
};

/**
 * EJS template engine adapter
 * 
 * Installation: npm install ejs
 * 
 * @example
 * ```typescript
 * import { Route } from 'nexus';
 * import { EJSEngine } from 'nexus/advanced/template';
 * 
 * Route.registerEngine(EJSEngine);
 * 
 * class MyRoute extends Route {
 *   handler(ctx) {
 *     return this.render('./views/page.ejs', { users: [...] });
 *   }
 * }
 * ```
 */
export const EJSEngine: TemplateEngine = {
    name: 'ejs',
    extensions: ['.ejs'],
    render(template: string, data: Record<string, any>): string {
        try {
            const ejs = require('ejs');
            return ejs.render(template, data);
        } catch (error: any) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error(
                    'EJS not installed. Install it with: npm install ejs'
                );
            }
            throw error;
        }
    }
};

/**
 * Pug template engine adapter
 * 
 * Installation: npm install pug
 * 
 * @example
 * ```typescript
 * import { Route } from 'nexus';
 * import { PugEngine } from 'nexus/advanced/template';
 * 
 * Route.registerEngine(PugEngine);
 * 
 * class MyRoute extends Route {
 *   handler(ctx) {
 *     return this.render('./views/page.pug', { title: 'Home' });
 *   }
 * }
 * ```
 */
export const PugEngine: TemplateEngine = {
    name: 'pug',
    extensions: ['.pug', '.jade'],
    render(template: string, data: Record<string, any>): string {
        try {
            const pug = require('pug');
            return pug.render(template, data);
        } catch (error: any) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error(
                    'Pug not installed. Install it with: npm install pug'
                );
            }
            throw error;
        }
    }
};

/**
 * Mustache template engine adapter
 * 
 * Installation: npm install mustache
 * 
 * @example
 * ```typescript
 * import { Route } from 'nexus';
 * import { MustacheEngine } from 'nexus/advanced/template';
 * 
 * Route.registerEngine(MustacheEngine);
 * 
 * class MyRoute extends Route {
 *   handler(ctx) {
 *     return this.render('./views/page.mustache', { name: 'Alice' });
 *   }
 * }
 * ```
 */
export const MustacheEngine: TemplateEngine = {
    name: 'mustache',
    extensions: ['.mustache', '.mst'],
    render(template: string, data: Record<string, any>): string {
        try {
            const Mustache = require('mustache');
            return Mustache.render(template, data);
        } catch (error: any) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error(
                    'Mustache not installed. Install it with: npm install mustache'
                );
            }
            throw error;
        }
    }
};

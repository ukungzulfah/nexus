/**
 * Template Engine Support
 * 
 * Provides pluggable template engine support for the render() method.
 * Default: Simple placeholder syntax {{ variable }}
 * Optional: Handlebars, EJS, Pug, Mustache via adapters
 */

export {
    HandlebarsEngine,
    EJSEngine,
    PugEngine,
    MustacheEngine
} from './engines';

export type { TemplateEngine, RenderOptions } from '../../core/types';

/**
 * Plugin System - Public API
 * 
 * @example
 * ```typescript
 * import { definePlugin, createPlugin, PluginManager } from '@engjts/server/plugin';
 * 
 * // Using fluent builder
 * const authPlugin = definePlugin('auth')
 *   .version('1.0.0')
 *   .config<{ secret: string }>()
 *   .register(ctx => {
 *     ctx.log.info('Auth initialized');
 *   })
 *   .build();
 * 
 * // Using quick create
 * const loggerPlugin = createPlugin({
 *   name: 'logger',
 *   register: ctx => ctx.app.use(logMiddleware)
 * });
 * 
 * app.plugin(authPlugin, { secret: 'xxx' });
 * app.plugin(loggerPlugin);
 * ```
 */

// Types
export type {
    NexusPlugin,
    SimplePlugin,
    PluginFactory,
    PluginMeta,
    PluginContext,
    PluginLogger,
    PluginPhase,
    PluginPriority,
    PluginRouteExtension,
    PluginManagerEvents,
    RegisteredPlugin
} from './types';

// Plugin Manager
export { PluginManager } from './PluginManager';

// Builder & Factories
export { PluginBuilder, definePlugin, createPlugin } from './builder';

// Constants
export { PRIORITY_WEIGHTS } from './types';

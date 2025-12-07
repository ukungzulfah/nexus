/**
 * Plugin Manager
 * Handles plugin lifecycle, dependency resolution, and execution
 */

import { Application } from '../application';
import { Context, Middleware } from '../types';
import {
    NexusPlugin,
    SimplePlugin,
    RegisteredPlugin,
    PluginContext,
    PluginLogger,
    PluginPhase,
    PluginMeta,
    PluginManagerEvents,
    PRIORITY_WEIGHTS
} from './types';

/**
 * Type-safe event emitter for plugin manager
 */
class PluginEventEmitter {
    private listeners: Map<string, Set<Function>> = new Map();

    on<K extends keyof PluginManagerEvents>(
        event: K,
        listener: PluginManagerEvents[K]
    ): this {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(listener);
        return this;
    }

    off<K extends keyof PluginManagerEvents>(
        event: K,
        listener: PluginManagerEvents[K]
    ): this {
        this.listeners.get(event)?.delete(listener);
        return this;
    }

    emit<K extends keyof PluginManagerEvents>(
        event: K,
        ...args: Parameters<PluginManagerEvents[K]>
    ): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            const handlerArray = Array.from(handlers);
            for (const handler of handlerArray) {
                try {
                    (handler as any)(...args);
                } catch (e) {
                    console.error(`Error in plugin event handler for ${event}:`, e);
                }
            }
        }
    }
}

/**
 * Plugin Manager - orchestrates all plugin operations
 */
export class PluginManager {
    private plugins: Map<string, RegisteredPlugin> = new Map();
    private app: Application<any>;
    private events: PluginEventEmitter = new PluginEventEmitter();
    private debug: boolean;
    private currentPhase: PluginPhase = 'configure';
    private contextDecorators: Array<(ctx: Context) => void> = [];

    constructor(app: Application<any>, options: { debug?: boolean } = {}) {
        this.app = app;
        this.debug = options.debug ?? false;
    }

    /**
     * Create a scoped logger for a plugin
     */
    private createLogger(pluginName: string): PluginLogger {
        const prefix = `[plugin:${pluginName}]`;
        return {
            debug: (msg, ...args) => this.debug && console.log(prefix, msg, ...args),
            info: (msg, ...args) => console.log(prefix, msg, ...args),
            warn: (msg, ...args) => console.warn(prefix, msg, ...args),
            error: (msg, ...args) => console.error(prefix, msg, ...args)
        };
    }

    /**
     * Create plugin context for lifecycle hooks
     */
    private createContext(entry: RegisteredPlugin): PluginContext {
        return {
            app: this.app,
            config: entry.config,
            getPlugin: <T>(name: string) => this.getExports<T>(name),
            hasPlugin: (name: string) => this.has(name),
            log: this.createLogger(entry.meta.name),
            storage: entry.storage
        };
    }

    /**
     * Normalize a plugin (handle legacy SimplePlugin format)
     */
    private normalizePlugin(plugin: NexusPlugin | SimplePlugin): NexusPlugin {
        // Check if it's a legacy SimplePlugin
        if ('install' in plugin && !('meta' in plugin)) {
            const simple = plugin as SimplePlugin;
            return {
                meta: {
                    name: simple.name,
                    version: simple.version
                },
                register: async (ctx) => {
                    await simple.install(ctx.app);
                }
            };
        }
        return plugin as NexusPlugin;
    }

    /**
     * Add a plugin to the manager
     */
    add<TConfig = any>(
        plugin: NexusPlugin<TConfig> | SimplePlugin,
        config?: TConfig
    ): this {
        const normalized = this.normalizePlugin(plugin);
        const { meta } = normalized;

        // Check for duplicate
        if (this.plugins.has(meta.name)) {
            throw new Error(`Plugin "${meta.name}" is already registered`);
        }

        // Check for conflicts
        const pluginEntries = Array.from(this.plugins.entries());
        for (const [name, entry] of pluginEntries) {
            if (entry.meta.conflicts?.includes(meta.name)) {
                throw new Error(`Plugin "${meta.name}" conflicts with "${name}"`);
            }
            if (meta.conflicts?.includes(name)) {
                throw new Error(`Plugin "${meta.name}" conflicts with "${name}"`);
            }
        }

        // Merge config with defaults
        const finalConfig = { ...normalized.defaults, ...config };

        // Validate config if validator provided
        if (normalized.validateConfig) {
            const result = normalized.validateConfig(finalConfig);
            if (result !== true) {
                throw new Error(
                    typeof result === 'string'
                        ? result
                        : `Invalid configuration for plugin "${meta.name}"`
                );
            }
        }

        // Register the plugin
        const entry: RegisteredPlugin = {
            meta,
            plugin: normalized,
            config: finalConfig,
            storage: new Map(),
            state: 'pending'
        };

        this.plugins.set(meta.name, entry);
        this.events.emit('plugin:added', meta);

        if (this.debug) {
            console.log(`[PluginManager] Added plugin: ${meta.name}@${meta.version}`);
        }

        return this;
    }

    /**
     * Check if a plugin is registered
     */
    has(name: string): boolean {
        return this.plugins.has(name);
    }

    /**
     * Get a plugin's exports
     */
    getExports<T = any>(name: string): T | undefined {
        return this.plugins.get(name)?.exports as T;
    }

    /**
     * Get plugin metadata
     */
    getMeta(name: string): PluginMeta | undefined {
        return this.plugins.get(name)?.meta;
    }

    /**
     * Get all registered plugins
     */
    getAll(): RegisteredPlugin[] {
        return Array.from(this.plugins.values());
    }

    /**
     * Resolve plugin order based on dependencies
     */
    private resolveDependencyOrder(): RegisteredPlugin[] {
        const resolved: RegisteredPlugin[] = [];
        const resolving = new Set<string>();
        const visited = new Set<string>();

        const resolve = (name: string): void => {
            if (visited.has(name)) return;
            if (resolving.has(name)) {
                throw new Error(`Circular dependency detected involving plugin "${name}"`);
            }

            const entry = this.plugins.get(name);
            if (!entry) {
                throw new Error(`Plugin "${name}" not found (required as dependency)`);
            }

            resolving.add(name);

            // Resolve required dependencies first
            for (const dep of entry.meta.dependencies ?? []) {
                if (!this.plugins.has(dep)) {
                    throw new Error(
                        `Plugin "${name}" requires "${dep}" but it's not installed`
                    );
                }
                resolve(dep);
            }

            // Optional dependencies (don't fail if missing)
            for (const dep of entry.meta.optionalDependencies ?? []) {
                if (this.plugins.has(dep)) {
                    resolve(dep);
                }
            }

            resolving.delete(name);
            visited.add(name);
            resolved.push(entry);
        };

        // Sort by priority first, then resolve
        const sortedNames = Array.from(this.plugins.keys()).sort((a, b) => {
            const pa = this.plugins.get(a)!.meta.priority ?? 'normal';
            const pb = this.plugins.get(b)!.meta.priority ?? 'normal';
            return PRIORITY_WEIGHTS[pa] - PRIORITY_WEIGHTS[pb];
        });

        for (const name of sortedNames) {
            resolve(name);
        }

        return resolved;
    }

    /**
     * Run a lifecycle phase for all plugins
     */
    private async runPhase(phase: PluginPhase): Promise<void> {
        this.currentPhase = phase;
        this.events.emit('lifecycle:start', phase);

        const ordered = phase === 'shutdown'
            ? this.resolveDependencyOrder().reverse()
            : this.resolveDependencyOrder();

        for (const entry of ordered) {
            try {
                const ctx = this.createContext(entry);
                const plugin = entry.plugin;

                switch (phase) {
                    case 'configure':
                        await plugin.configure?.(ctx);
                        entry.state = 'configured';
                        this.events.emit('plugin:configured', entry.meta);
                        break;

                    case 'register':
                        // Register middlewares
                        if (plugin.middlewares) {
                            const middlewares = typeof plugin.middlewares === 'function'
                                ? plugin.middlewares(ctx)
                                : plugin.middlewares;
                            for (const mw of middlewares) {
                                this.app.use(mw);
                            }
                        }

                        // Register routes
                        if (plugin.routes) {
                            const routes = typeof plugin.routes === 'function'
                                ? plugin.routes(ctx)
                                : plugin.routes;
                            for (const route of routes) {
                                (this.app as any)[route.method.toLowerCase()](
                                    route.path,
                                    {
                                        handler: route.handler,
                                        middlewares: route.middlewares,
                                        meta: route.meta
                                    }
                                );
                            }
                        }

                        // Context decorator
                        if (plugin.decorateContext) {
                            this.contextDecorators.push(plugin.decorateContext);
                        }

                        // App decorator
                        if (plugin.decorateApp) {
                            plugin.decorateApp(this.app);
                        }

                        // Main register hook
                        await plugin.register?.(ctx);

                        // Collect exports
                        if (plugin.exports) {
                            entry.exports = plugin.exports(ctx);
                        }

                        entry.state = 'registered';
                        this.events.emit('plugin:registered', entry.meta);
                        break;

                    case 'boot':
                        await plugin.boot?.(ctx);
                        entry.state = 'booted';
                        this.events.emit('plugin:booted', entry.meta);
                        break;

                    case 'ready':
                        await plugin.ready?.(ctx);
                        entry.state = 'ready';
                        this.events.emit('plugin:ready', entry.meta);
                        break;

                    case 'shutdown':
                        await plugin.shutdown?.(ctx);
                        entry.state = 'shutdown';
                        this.events.emit('plugin:shutdown', entry.meta);
                        break;
                }

                if (this.debug) {
                    console.log(`[PluginManager] ${phase}: ${entry.meta.name} ✓`);
                }
            } catch (error) {
                entry.state = 'error';
                entry.error = error as Error;
                this.events.emit('plugin:error', entry.meta, error as Error);
                throw new Error(
                    `Plugin "${entry.meta.name}" failed during ${phase}: ${(error as Error).message}`
                );
            }
        }

        this.events.emit('lifecycle:complete', phase);
    }

    /**
     * Initialize all plugins (configure → register → boot)
     */
    async initialize(): Promise<void> {
        await this.runPhase('configure');
        await this.runPhase('register');
        await this.runPhase('boot');
    }

    /**
     * Notify plugins that server is ready
     */
    async notifyReady(): Promise<void> {
        await this.runPhase('ready');
    }

    /**
     * Shutdown all plugins
     */
    async shutdown(): Promise<void> {
        await this.runPhase('shutdown');
    }

    /**
     * Get context decorators (for Context to apply)
     */
    getContextDecorators(): Array<(ctx: Context) => void> {
        return this.contextDecorators;
    }

    /**
     * Subscribe to plugin manager events
     */
    on<K extends keyof PluginManagerEvents>(
        event: K,
        listener: PluginManagerEvents[K]
    ): this {
        this.events.on(event, listener);
        return this;
    }

    /**
     * Get current lifecycle phase
     */
    getCurrentPhase(): PluginPhase {
        return this.currentPhase;
    }

    /**
     * Get plugins in error state
     */
    getErrors(): Array<{ meta: PluginMeta; error: Error }> {
        return Array.from(this.plugins.values())
            .filter(e => e.state === 'error')
            .map(e => ({ meta: e.meta, error: e.error! }));
    }
}

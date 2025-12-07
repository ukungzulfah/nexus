/**
 * Plugin System Types
 * Advanced plugin architecture for Nexus Framework
 */

import { Application } from '../application';
import { Context, Middleware, Handler, Response } from '../types';

/**
 * Plugin lifecycle phases
 */
export type PluginPhase = 
    | 'configure'    // Before app starts, configure settings
    | 'register'     // Register routes, middlewares, stores
    | 'boot'         // After all plugins registered, before server starts
    | 'ready'        // Server is listening
    | 'shutdown';    // App is shutting down

/**
 * Plugin priority levels
 */
export type PluginPriority = 'critical' | 'high' | 'normal' | 'low';

/**
 * Plugin metadata
 */
export interface PluginMeta {
    /** Unique plugin name */
    name: string;
    /** Plugin version (semver) */
    version: string;
    /** Plugin description */
    description?: string;
    /** Author information */
    author?: string | { name: string; email?: string; url?: string };
    /** Plugin homepage/docs URL */
    homepage?: string;
    /** Plugin dependencies (other plugin names) */
    dependencies?: string[];
    /** Optional dependencies (won't fail if missing) */
    optionalDependencies?: string[];
    /** Plugins that conflict with this one */
    conflicts?: string[];
    /** Plugin priority */
    priority?: PluginPriority;
    /** Plugin tags for categorization */
    tags?: string[];
}

/**
 * Plugin context passed to lifecycle hooks
 * @template TConfig - The plugin's configuration type
 */
export interface PluginContext<TConfig = Record<string, any>> {
    /** The application instance */
    app: Application<any>;
    /** Plugin's own configuration (passed during .plugin()) */
    config: TConfig;
    /** Access other plugin's exported APIs */
    getPlugin<T = any>(name: string): T | undefined;
    /** Check if a plugin is installed */
    hasPlugin(name: string): boolean;
    /** Logger scoped to this plugin */
    log: PluginLogger;
    /** Plugin-scoped storage (persists across lifecycle) */
    storage: Map<string, any>;
}

/**
 * Plugin logger interface
 */
export interface PluginLogger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}

/**
 * Route extension added by plugin
 */
export interface PluginRouteExtension {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    handler: Handler;
    middlewares?: Middleware[];
    meta?: {
        description?: string;
        tags?: string[];
        internal?: boolean;
    };
}

/**
 * Full plugin interface
 */
export interface NexusPlugin<TConfig = any, TExports = any> {
    /** Plugin metadata */
    meta: PluginMeta;
    
    /** Default configuration */
    defaults?: Partial<TConfig>;
    
    /** Validate plugin configuration */
    validateConfig?: (config: TConfig) => boolean | string;
    
    /**
     * Configure phase - set up configuration before anything else
     * Called in dependency order
     */
    configure?: (ctx: PluginContext<TConfig>) => void | Promise<void>;
    
    /**
     * Register phase - register routes, middleware, stores, etc.
     * Called after all plugins are configured
     */
    register?: (ctx: PluginContext<TConfig>) => void | Promise<void>;
    
    /**
     * Boot phase - perform initialization after all registrations
     * Called after all plugins are registered
     */
    boot?: (ctx: PluginContext<TConfig>) => void | Promise<void>;
    
    /**
     * Ready phase - called when server is listening
     * Good for logging, connecting to external services
     */
    ready?: (ctx: PluginContext<TConfig>) => void | Promise<void>;
    
    /**
     * Shutdown phase - cleanup when app is shutting down
     * Called in reverse dependency order
     */
    shutdown?: (ctx: PluginContext<TConfig>) => void | Promise<void>;
    
    /**
     * Export APIs for other plugins to use
     * Accessible via ctx.getPlugin('plugin-name')
     */
    exports?: (ctx: PluginContext<TConfig>) => TExports;
    
    /**
     * Middleware to add globally
     */
    middlewares?: Middleware[] | ((ctx: PluginContext<TConfig>) => Middleware[]);
    
    /**
     * Routes to add
     */
    routes?: PluginRouteExtension[] | ((ctx: PluginContext<TConfig>) => PluginRouteExtension[]);
    
    /**
     * Decorate the Context with additional properties/methods
     */
    decorateContext?: (ctx: Context) => void;
    
    /**
     * Decorate the Application with additional methods
     */
    decorateApp?: (app: Application<any>) => void;
}

/**
 * Simplified plugin using just an install function (legacy compatible)
 */
export interface SimplePlugin {
    name: string;
    version: string;
    install: (app: Application<any>) => void | Promise<void>;
}

/**
 * Plugin factory function type
 */
export type PluginFactory<TConfig = any> = (config?: TConfig) => NexusPlugin<TConfig>;

/**
 * Registered plugin entry
 */
export interface RegisteredPlugin {
    meta: PluginMeta;
    plugin: NexusPlugin<any, any>;
    config: Record<string, any>;
    exports?: any;
    storage: Map<string, any>;
    state: 'pending' | 'configured' | 'registered' | 'booted' | 'ready' | 'shutdown' | 'error';
    error?: Error;
}

/**
 * Plugin manager events
 */
export interface PluginManagerEvents {
    'plugin:added': (meta: PluginMeta) => void;
    'plugin:configured': (meta: PluginMeta) => void;
    'plugin:registered': (meta: PluginMeta) => void;
    'plugin:booted': (meta: PluginMeta) => void;
    'plugin:ready': (meta: PluginMeta) => void;
    'plugin:shutdown': (meta: PluginMeta) => void;
    'plugin:error': (meta: PluginMeta, error: Error) => void;
    'lifecycle:start': (phase: PluginPhase) => void;
    'lifecycle:complete': (phase: PluginPhase) => void;
}

/**
 * Priority weights for sorting
 */
export const PRIORITY_WEIGHTS: Record<PluginPriority, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3
};

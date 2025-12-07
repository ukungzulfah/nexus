/**
 * Nexus Core Module
 * 
 * The minimal core of Nexus framework - Application, Router, Context, Middleware
 * Use this import path when you want only the core without optional features:
 * 
 * import { Application, Router, createApp } from '@engjts/server/core';
 */

// Application
export { Application, Application as Nexus, createApp } from './application';

// Core types
export * from './types';

// Router
export { Router } from './router';
export { FileRouter, createFileRouter, useFileRoutes } from './router/file-router';
export type { FileRouterOptions, FileRouteClass, RouteModule } from './router/file-router';

// Middleware
export {
    MiddlewareExecutor,
    logger,
    cors,
    errorHandler
} from './middleware';

// Context
export { ContextImpl, parseBody } from './context';
export { ContextPool } from './context-pool';

// State Management
export {
    ContextStore,
    RequestStore,
    StoreRegistry,
    RequestStoreRegistry,
    createStoreRegistry,
    type StoreListener,
    type DisposeCallback,
    type StoreConstructor,
    type StateOf,
    type StoreOptions,
    type RequestStoreConstructor,
    type RequestStateOf
} from './store';

// Plugin System
export {
    PluginManager,
    PluginBuilder,
    definePlugin,
    createPlugin,
    type NexusPlugin,
    type SimplePlugin,
    type PluginFactory,
    type PluginMeta,
    type PluginContext,
    type PluginLogger,
    type PluginPhase,
    type PluginPriority,
    type PluginRouteExtension,
    type RegisteredPlugin
} from './plugin';

// Adapters
export {
    AdapterRegistry,
    type LoggerAdapter,
    type CacheAdapter,
    type SessionAdapter
} from './adapter';

// Performance
export { BufferPool, StreamUtils } from './performance/buffer-pool';
export { MiddlewareOptimizer, PerformanceMonitor } from './performance/middleware-optimizer';

// Fast JSON Serializer
export {
    createSerializer,
    createArraySerializer,
    serialize,
    serializerRegistry,
    SerializerRegistry,
    CommonSchemas,
    type JSONSchema,
    type ResponseSchemaConfig,
    type SerializerFunction,
    type SerializerOptions
} from './serializer';

// Re-export Zod for convenience
export { z } from 'zod';

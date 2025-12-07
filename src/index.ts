/**
 * Nexus Framework - Modern async-first web framework
 * 
 * Main entry point - exports all public APIs
 */

// =============================================================================
// CORE
// =============================================================================

// Application
export { Application, Application as Nexus, createApp } from './core/application';

// Core types
export * from './core/types';

// Router
export { Router } from './core/router';

// File-Based Router (Next.js style)
export { FileRouter, createFileRouter, useFileRoutes } from './core/router/file-router';
export type { FileRouterOptions, FileRouteClass, RouteModule } from './core/router/file-router';

// Middleware
export {
    MiddlewareExecutor,
    logger,
    cors,
    errorHandler
} from './core/middleware';

// Context
export { ContextImpl, parseBody } from './core/context';
export { ContextPool } from './core/context-pool';

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

// ContextStore - Global singleton stores
// RequestStore - Per-request scoped stores
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
} from './core/store';

// =============================================================================
// PLUGIN SYSTEM
// =============================================================================

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
} from './core/plugin';

// =============================================================================
// ADAPTERS
// =============================================================================

export {
    AdapterRegistry,
    type LoggerAdapter,
    type CacheAdapter,
    type SessionAdapter
} from './core/adapter';

// =============================================================================
// PERFORMANCE
// =============================================================================

export { BufferPool, StreamUtils } from './core/performance/buffer-pool';
export { MiddlewareOptimizer, PerformanceMonitor } from './core/performance/middleware-optimizer';

// =============================================================================
// FAST JSON SERIALIZER
// =============================================================================

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
} from './core/serializer';

// =============================================================================
// SECURITY
// =============================================================================

export * from './security';

// =============================================================================
// DATABASE
// =============================================================================

export * from './database';

// =============================================================================
// OBSERVABILITY & MONITORING
// =============================================================================

export { ObservabilityCenter } from './advanced/observability/ObservabilityCenter';
export { createObservabilityMiddleware } from './advanced/observability/createObservabilityMiddleware';
export type { ObservabilityOptions } from './advanced/observability/types';

// Sentry Integration
export {
    SentryClient,
    initSentry,
    getSentry,
    createSentryMiddleware,
    createSentryErrorHandler,
    captureException,
    captureMessage,
    addBreadcrumb,
    setUser,
    setTag,
    setExtra,
    withSpan,
} from './advanced/sentry';

export type { 
    SentryOptions, 
    SentryUser, 
    SentryBreadcrumb,
    SentryEvent,
    SentryTransaction,
    SentrySpan,
    SentryMiddlewareOptions,
    SeverityLevel,
} from './advanced/sentry/types';

// =============================================================================
// DEPLOYMENT & PRODUCTION
// =============================================================================

export {
    // Graceful Shutdown
    GracefulShutdownManager,
    createGracefulShutdown,
    type GracefulShutdownOptions,
    type ShutdownHook,
    type ActiveConnection,

    // Clustering
    ClusterManager,
    createCluster,
    runClustered,
    type ClusterOptions,
    type WorkerInfo,
    type ClusterStats,

    // Configuration
    ConfigManager,
    defineConfig,
    env,
    requireEnv,
    type Environment,
    type ConfigDefinition,
    type ConfigOptions,
    type BaseConfig,
    type ServerConfig,
    type DatabaseConfig,
    type LoggingConfig,
    type SecurityConfig,
    type CacheConfig,
    type SessionConfig,

    // Docker
    DockerGenerator,
    createDocker,
    generateDockerFiles,
    type DockerOptions,
    type ComposeService,
    type ComposeConfig
} from './deployment';

// =============================================================================
// API DOCUMENTATION & TESTING
// =============================================================================

// Swagger
export { swagger } from './advanced/swagger/swagger';
export { SwaggerGenerator } from './advanced/swagger/SwaggerGenerator';
export { createSwagger } from './advanced/swagger/createSwagger';

export type {
    SwaggerConfig,
    SwaggerInfo,
    SwaggerTheme,
    SecurityScheme,
    OpenAPISpec,
    OpenAPISchema,
    OpenAPIOperation,
    OpenAPIParameter,
    OpenAPIRequestBody,
    OpenAPIResponse
} from './advanced/swagger/types';

// Postman
export type {
    PostmanConfig,
    PostmanAuth,
    PostmanCollection,
    PostmanEnvironment
} from './advanced/postman/types';
export { postman } from './advanced/postman/postman';

// API Playground
export {
    playground,
    type PlaygroundConfig
} from './advanced/playground';

// Testing Utilities
export { TestClient } from './advanced/testing/harness';

// =============================================================================
// ADVANCED FEATURES
// =============================================================================

// Static File Serving
export { staticFiles, publicDir, serveStatic } from './advanced/static';

// WebSocket / Realtime
export {
    WebSocketGateway,
    type WebSocketContext,
    type WebSocketRoute,
    type WebSocketRouteConfig
} from './advanced/realtime/websocket';

// Cache System
export {
    MultiTierCache,
    InMemoryCacheStore,
    RedisCacheStore,
    createRedisCache,
    type CacheStore,
    type CacheEntry,
    type CacheSetOptions,
    type CacheTierConfig,
    type CacheWrapOptions,
    type MemoizeOptions,
    type RedisCacheConfig,
    type RedisClientLike
} from './advanced/cache';

// =============================================================================
// UTILITIES
// =============================================================================

// Re-export Zod for convenience
export { z } from 'zod';

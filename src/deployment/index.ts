/**
 * Deployment Module
 * 
 * Provides production-ready deployment features:
 * - Graceful shutdown with connection draining
 * - Multi-process clustering
 * - Environment-based configuration
 * - Docker support
 */

// Graceful Shutdown
export {
    GracefulShutdownManager,
    createGracefulShutdown,
    type GracefulShutdownOptions,
    type ShutdownHook,
    type ActiveConnection
} from './graceful-shutdown';

// Clustering
export {
    ClusterManager,
    createCluster,
    runClustered,
    type ClusterOptions,
    type WorkerInfo,
    type ClusterStats
} from './cluster';

// Configuration
export {
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
    type SessionConfig
} from './config';

// Docker
export {
    DockerGenerator,
    createDocker,
    generateDockerFiles,
    type DockerOptions,
    type ComposeService,
    type ComposeConfig
} from './docker';

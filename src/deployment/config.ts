/**
 * Environment-based Configuration System
 * Provides type-safe configuration with environment separation
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export type Environment = 'development' | 'production' | 'test' | 'staging';

export interface ServerConfig {
    port?: number;
    host?: string;
    trustProxy?: boolean;
    maxRequestSize?: string;
    timeout?: number;
}

export interface DatabaseConfig {
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    pool?: {
        min?: number;
        max?: number;
        idleTimeout?: number;
        connectionTimeout?: number;
    };
    ssl?: boolean | {
        rejectUnauthorized?: boolean;
        ca?: string;
        cert?: string;
        key?: string;
    };
}

export interface LoggingConfig {
    level?: 'debug' | 'info' | 'warn' | 'error';
    format?: 'json' | 'pretty';
    colorize?: boolean;
    timestamp?: boolean;
}

export interface SecurityConfig {
    headers?: 'strict' | 'relaxed' | 'none';
    cors?: {
        origin?: string | string[] | boolean;
        credentials?: boolean;
        methods?: string[];
    };
    rateLimit?: {
        max?: number;
        window?: string;
    };
}

export interface CacheConfig {
    driver?: 'memory' | 'redis';
    ttl?: number;
    prefix?: string;
    redis?: {
        url?: string;
        host?: string;
        port?: number;
        password?: string;
    };
}

export interface SessionConfig {
    driver?: 'memory' | 'redis';
    secret?: string;
    ttl?: number;
    cookie?: {
        name?: string;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: 'strict' | 'lax' | 'none';
    };
}

export interface BaseConfig {
    server?: ServerConfig;
    database?: DatabaseConfig;
    logging?: LoggingConfig;
    security?: SecurityConfig;
    cache?: CacheConfig;
    session?: SessionConfig;
    [key: string]: any;
}

export interface ConfigDefinition<T extends BaseConfig = BaseConfig> {
    /**
     * Base configuration applied to all environments
     */
    base?: T;

    /**
     * Development environment configuration
     */
    development?: Partial<T>;

    /**
     * Production environment configuration
     */
    production?: Partial<T>;

    /**
     * Test environment configuration
     */
    test?: Partial<T>;

    /**
     * Staging environment configuration
     */
    staging?: Partial<T>;

    /**
     * Custom environment configurations
     */
    [env: string]: Partial<T> | undefined;
}

export interface ConfigOptions {
    /**
     * Environment variable name for environment
     * @default 'NODE_ENV'
     */
    envKey?: string;

    /**
     * Default environment if not specified
     * @default 'development'
     */
    defaultEnv?: Environment;

    /**
     * Path to .env file
     */
    envFile?: string;

    /**
     * Whether to load .env file
     * @default true
     */
    loadEnvFile?: boolean;

    /**
     * Environment variable prefix for auto-loading
     * @default 'APP_'
     */
    envPrefix?: string;
}

/**
 * Deep merge utility
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (
            sourceValue !== null &&
            typeof sourceValue === 'object' &&
            !Array.isArray(sourceValue) &&
            targetValue !== null &&
            typeof targetValue === 'object' &&
            !Array.isArray(targetValue)
        ) {
            result[key] = deepMerge(targetValue, sourceValue as any);
        } else if (sourceValue !== undefined) {
            result[key] = sourceValue as any;
        }
    }

    return result;
}

/**
 * Parse environment variable value
 */
function parseEnvValue(value: string): any {
    // Boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Number
    if (/^-?\d+$/.test(value)) return parseInt(value, 10);
    if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

    // JSON
    if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    return value;
}

/**
 * Load .env file
 */
function loadEnvFile(filePath: string): void {
    if (!existsSync(filePath)) return;

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) continue;

        const equalIndex = trimmed.indexOf('=');
        if (equalIndex === -1) continue;

        const key = trimmed.slice(0, equalIndex).trim();
        let value = trimmed.slice(equalIndex + 1).trim();

        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        // Don't override existing env vars
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

/**
 * Configuration Manager
 */
export class ConfigManager<T extends BaseConfig = BaseConfig> {
    private config: T;
    private environment: Environment;
    private options: Required<ConfigOptions>;

    constructor(definition: ConfigDefinition<T>, options: ConfigOptions = {}) {
        this.options = {
            envKey: options.envKey ?? 'NODE_ENV',
            defaultEnv: options.defaultEnv ?? 'development',
            envFile: options.envFile ?? '.env',
            loadEnvFile: options.loadEnvFile ?? true,
            envPrefix: options.envPrefix ?? 'APP_'
        };

        // Load .env file if enabled
        if (this.options.loadEnvFile) {
            const envPath = resolve(process.cwd(), this.options.envFile);
            loadEnvFile(envPath);

            // Also try environment-specific .env files
            const env = this.getEnvironment();
            const envSpecificPath = resolve(process.cwd(), `.env.${env}`);
            loadEnvFile(envSpecificPath);

            // Local overrides (not committed to git)
            const localPath = resolve(process.cwd(), '.env.local');
            loadEnvFile(localPath);
        }

        this.environment = this.getEnvironment();
        this.config = this.buildConfig(definition);
    }

    /**
     * Get current environment
     */
    private getEnvironment(): Environment {
        const env = process.env[this.options.envKey];
        if (env && ['development', 'production', 'test', 'staging'].includes(env)) {
            return env as Environment;
        }
        return this.options.defaultEnv;
    }

    /**
     * Build configuration by merging base with environment-specific
     */
    private buildConfig(definition: ConfigDefinition<T>): T {
        const base = definition.base || ({} as T);
        const envConfig = definition[this.environment] || {};

        let config = deepMerge(base, envConfig);

        // Override with environment variables
        config = this.applyEnvOverrides(config);

        return config;
    }

    /**
     * Apply environment variable overrides
     */
    private applyEnvOverrides(config: T): T {
        const prefix = this.options.envPrefix;
        const result = { ...config };

        for (const [key, value] of Object.entries(process.env)) {
            if (!key.startsWith(prefix)) continue;

            // Convert APP_SERVER_PORT to server.port
            const configPath = key
                .slice(prefix.length)
                .toLowerCase()
                .split('_')
                .reduce((path, part, index) => {
                    if (index === 0) return part;
                    return path + '.' + part;
                }, '');

            this.setNestedValue(result, configPath, parseEnvValue(value!));
        }

        return result;
    }

    /**
     * Set a nested value in an object
     */
    private setNestedValue(obj: any, path: string, value: any): void {
        const parts = path.split('.');
        let current = obj;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (current[part] === undefined) {
                current[part] = {};
            }
            current = current[part];
        }

        current[parts[parts.length - 1]] = value;
    }

    /**
     * Get a configuration value
     */
    get<K extends keyof T>(key: K): T[K];
    get<V = any>(path: string): V;
    get(keyOrPath: string): any {
        if (keyOrPath in this.config) {
            return this.config[keyOrPath as keyof T];
        }

        const parts = keyOrPath.split('.');
        let current: any = this.config;

        for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part];
        }

        return current;
    }

    /**
     * Check if a configuration key exists
     */
    has(path: string): boolean {
        return this.get(path) !== undefined;
    }

    /**
     * Get all configuration
     */
    all(): T {
        return { ...this.config };
    }

    /**
     * Get current environment
     */
    env(): Environment {
        return this.environment;
    }

    /**
     * Check if current environment matches
     */
    isEnv(env: Environment): boolean {
        return this.environment === env;
    }

    /**
     * Check if running in production
     */
    isProduction(): boolean {
        return this.environment === 'production';
    }

    /**
     * Check if running in development
     */
    isDevelopment(): boolean {
        return this.environment === 'development';
    }

    /**
     * Check if running in test
     */
    isTest(): boolean {
        return this.environment === 'test';
    }

    /**
     * Get environment variable with optional default
     */
    static env<T = string>(key: string, defaultValue?: T): T {
        const value = process.env[key];
        if (value === undefined) {
            return defaultValue as T;
        }
        return parseEnvValue(value) as T;
    }

    /**
     * Require an environment variable (throws if not set)
     */
    static requireEnv(key: string): string {
        const value = process.env[key];
        if (value === undefined) {
            throw new Error(`Required environment variable ${key} is not set`);
        }
        return value;
    }
}

/**
 * Define a type-safe configuration
 */
export function defineConfig<T extends BaseConfig>(
    definition: ConfigDefinition<T>,
    options?: ConfigOptions
): ConfigManager<T> {
    return new ConfigManager(definition, options);
}

/**
 * Quick access to environment variables
 */
export const env = ConfigManager.env;
export const requireEnv = ConfigManager.requireEnv;

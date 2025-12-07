import { EventEmitter } from 'events';
import { CacheStore, CacheEntry } from './types';

/**
 * Redis cache store configuration
 */
export interface RedisCacheConfig {
    /**
     * Redis connection URL
     * @example 'redis://localhost:6379'
     */
    url?: string;

    /**
     * Redis host
     * @default 'localhost'
     */
    host?: string;

    /**
     * Redis port
     * @default 6379
     */
    port?: number;

    /**
     * Redis password
     */
    password?: string;

    /**
     * Redis database number
     * @default 0
     */
    db?: number;

    /**
     * Key prefix for namespacing
     * @default 'nexus:'
     */
    prefix?: string;

    /**
     * Connection timeout in milliseconds
     * @default 5000
     */
    connectTimeout?: number;

    /**
     * Enable TLS/SSL
     * @default false
     */
    tls?: boolean;

    /**
     * Lazy connect - don't connect immediately
     * @default false
     */
    lazyConnect?: boolean;
}

/**
 * Redis client interface
 * Supports both 'redis' and 'ioredis' packages
 */
export interface RedisClientLike {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, options?: { EX?: number; PX?: number }): Promise<any>;
    setex?(key: string, seconds: number, value: string): Promise<any>;
    del(key: string | string[]): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    flushdb?(): Promise<any>;
    flushDb?(): Promise<any>;
    quit?(): Promise<any>;
    disconnect?(): Promise<any>;
    on?(event: string, listener: (...args: any[]) => void): void;
}

/**
 * Redis cache store with full feature support
 * 
 * @example
 * ```typescript
 * // Using with ioredis
 * import Redis from 'ioredis';
 * 
 * const redis = new Redis({ host: 'localhost', port: 6379 });
 * const cache = new RedisCacheStore('sessions', { client: redis });
 * 
 * // Using with node-redis
 * import { createClient } from 'redis';
 * 
 * const client = createClient({ url: 'redis://localhost:6379' });
 * await client.connect();
 * const cache = new RedisCacheStore('sessions', { client });
 * ```
 */
export class RedisCacheStore<Value = unknown> implements CacheStore<Value> {
    readonly name: string;
    private client: RedisClientLike;
    private prefix: string;
    private emitter = new EventEmitter();
    private connected: boolean = false;

    constructor(
        name: string,
        options: RedisCacheConfig & { client: RedisClientLike }
    ) {
        this.name = name;
        this.client = options.client;
        this.prefix = options.prefix ?? 'nexus:';

        // Listen for connection events if supported
        if (this.client.on) {
            this.client.on('connect', () => {
                this.connected = true;
                this.emitter.emit('connect');
            });
            this.client.on('error', (err) => {
                this.emitter.emit('error', err);
            });
            this.client.on('close', () => {
                this.connected = false;
                this.emitter.emit('disconnect');
            });
        } else {
            this.connected = true;
        }
    }

    /**
     * Build the full Redis key with prefix
     */
    private buildKey(key: string): string {
        return `${this.prefix}${this.name}:${key}`;
    }

    /**
     * Get a value from cache
     */
    async get(key: string): Promise<CacheEntry<Value> | undefined> {
        try {
            const data = await this.client.get(this.buildKey(key));
            if (!data) {
                return undefined;
            }

            const entry = JSON.parse(data) as CacheEntry<Value>;

            // Check expiration (Redis handles TTL, but we double-check for safety)
            if (entry.expiresAt && entry.expiresAt < Date.now()) {
                await this.delete(key);
                return undefined;
            }

            return entry;
        } catch (error) {
            this.emitter.emit('error', error);
            return undefined;
        }
    }

    /**
     * Set a value in cache
     */
    async set(key: string, entry: CacheEntry<Value>): Promise<void> {
        try {
            const fullKey = this.buildKey(key);
            const data = JSON.stringify(entry);

            if (entry.expiresAt) {
                const ttlMs = entry.expiresAt - Date.now();
                if (ttlMs > 0) {
                    const ttlSec = Math.ceil(ttlMs / 1000);
                    // Try different methods for compatibility
                    if (this.client.setex) {
                        // ioredis style
                        await this.client.setex(fullKey, ttlSec, data);
                    } else {
                        // node-redis style
                        await this.client.set(fullKey, data, { EX: ttlSec });
                    }
                }
            } else {
                await this.client.set(fullKey, data);
            }

            this.emitter.emit('set', key, entry);
        } catch (error) {
            this.emitter.emit('error', error);
            throw error;
        }
    }

    /**
     * Delete a key from cache
     */
    async delete(key: string): Promise<void> {
        try {
            await this.client.del(this.buildKey(key));
            this.emitter.emit('delete', key);
        } catch (error) {
            this.emitter.emit('error', error);
            throw error;
        }
    }

    /**
     * Clear all keys in this cache namespace
     */
    async clear(): Promise<void> {
        try {
            const pattern = `${this.prefix}${this.name}:*`;
            const keys = await this.client.keys(pattern);
            
            if (keys.length > 0) {
                await this.client.del(keys);
            }
            
            this.emitter.emit('clear');
        } catch (error) {
            this.emitter.emit('error', error);
            throw error;
        }
    }

    /**
     * Get all keys matching a pattern
     */
    async keys(pattern?: RegExp): Promise<string[]> {
        try {
            const redisPattern = `${this.prefix}${this.name}:*`;
            const allKeys = await this.client.keys(redisPattern);
            
            // Remove prefix to get clean keys
            const prefixLength = `${this.prefix}${this.name}:`.length;
            const cleanKeys = allKeys.map(k => k.slice(prefixLength));

            if (!pattern) {
                return cleanKeys;
            }

            return cleanKeys.filter(key => pattern.test(key));
        } catch (error) {
            this.emitter.emit('error', error);
            return [];
        }
    }

    /**
     * Check if connected to Redis
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Subscribe to cache events
     */
    on(event: 'set' | 'delete' | 'clear' | 'connect' | 'disconnect' | 'error', listener: (...args: any[]) => void): void {
        this.emitter.on(event, listener);
    }

    /**
     * Disconnect from Redis
     */
    async disconnect(): Promise<void> {
        if (this.client.quit) {
            await this.client.quit();
        } else if (this.client.disconnect) {
            await this.client.disconnect();
        }
        this.connected = false;
    }
}

/**
 * Create a Redis cache store with automatic client creation
 * Requires 'ioredis' or 'redis' package to be installed
 * 
 * @example
 * ```typescript
 * // Auto-create Redis client
 * const cache = await createRedisCache('sessions', {
 *   host: 'localhost',
 *   port: 6379,
 *   prefix: 'myapp:'
 * });
 * 
 * await cache.set('user:123', { value: { name: 'John' }, expiresAt: Date.now() + 3600000 });
 * const user = await cache.get('user:123');
 * ```
 */
export async function createRedisCache<Value = unknown>(
    name: string,
    config: RedisCacheConfig = {}
): Promise<RedisCacheStore<Value>> {
    let client: RedisClientLike;

    // Try ioredis first
    try {
        const Redis = require('ioredis');
        client = new Redis({
            host: config.host ?? 'localhost',
            port: config.port ?? 6379,
            password: config.password,
            db: config.db ?? 0,
            connectTimeout: config.connectTimeout ?? 5000,
            tls: config.tls ? {} : undefined,
            lazyConnect: config.lazyConnect ?? false
        });
    } catch {
        // Try node-redis
        try {
            const { createClient } = require('redis');
            const url = config.url ?? `redis://${config.host ?? 'localhost'}:${config.port ?? 6379}`;
            
            client = createClient({
                url,
                password: config.password,
                database: config.db ?? 0,
                socket: {
                    connectTimeout: config.connectTimeout ?? 5000,
                    tls: config.tls ?? false
                }
            });

            // node-redis requires explicit connect
            await (client as any).connect();
        } catch {
            throw new Error(
                'Redis client not found. Please install either "ioredis" or "redis" package:\n' +
                '  npm install ioredis\n' +
                '  # or\n' +
                '  npm install redis'
            );
        }
    }

    return new RedisCacheStore<Value>(name, { ...config, client });
}

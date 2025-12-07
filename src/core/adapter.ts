/**
 * Adapter interfaces for extensibility
 * These interfaces define contracts that external implementations must follow
 */

/**
 * Logger adapter interface
 * Allows plugging in different logging implementations (winston, pino, etc.)
 * 
 * @example
 * ```typescript
 * class PinoAdapter implements LoggerAdapter {
 *   private pino = require('pino')();
 *   info(message: string, meta?: any) { this.pino.info(meta, message); }
 *   // ...
 * }
 * app.adapter('logger', new PinoAdapter());
 * ```
 */
export interface LoggerAdapter {
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, error?: Error, meta?: any): void;
    debug(message: string, meta?: any): void;
}

/**
 * Cache adapter interface
 * Allows plugging in different cache implementations (Redis, Memcached, etc.)
 * 
 * @example
 * ```typescript
 * class RedisAdapter implements CacheAdapter {
 *   constructor(private redis: Redis) {}
 *   async get<T>(key: string) { return JSON.parse(await this.redis.get(key)); }
 *   // ...
 * }
 * app.adapter('cache', new RedisAdapter(redis));
 * ```
 */
export interface CacheAdapter {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
}

/**
 * Session adapter interface
 * Allows plugging in different session storage (Redis, Database, etc.)
 * 
 * @example
 * ```typescript
 * class DatabaseSessionAdapter implements SessionAdapter {
 *   async get(sessionId: string) { return await db.sessions.findById(sessionId); }
 *   // ...
 * }
 * app.adapter('session', new DatabaseSessionAdapter());
 * ```
 */
export interface SessionAdapter {
    get(sessionId: string): Promise<any>;
    set(sessionId: string, data: any, ttl?: number): Promise<void>;
    destroy(sessionId: string): Promise<void>;
}

/**
 * Adapter registry for managing all adapters
 */
export class AdapterRegistry {
    private adapters: Map<string, any> = new Map();

    register<T>(name: string, adapter: T): void {
        this.adapters.set(name, adapter);
    }

    get<T>(name: string): T | undefined {
        return this.adapters.get(name) as T;
    }

    has(name: string): boolean {
        return this.adapters.has(name);
    }

    remove(name: string): boolean {
        return this.adapters.delete(name);
    }
}

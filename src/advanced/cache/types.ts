export interface CacheEntry<Value = unknown> {
    value: Value;
    expiresAt?: number;
    tags?: string[];
    meta?: Record<string, any>;
}

export interface CacheStore<Value = unknown> {
    readonly name: string;
    get(key: string): Promise<CacheEntry<Value> | undefined>;
    set(key: string, entry: CacheEntry<Value>): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    keys?(pattern?: RegExp): Promise<string[]>;
}

export interface CacheTierConfig<Value = unknown> {
    store: CacheStore<Value>;
    ttl?: number;
    maxSize?: number;
}

export interface CacheSetOptions<Value = unknown> {
    ttl?: number;
    tags?: string[];
    meta?: CacheEntry<Value>['meta'];
}

export interface CacheWrapOptions<Value = unknown> extends CacheSetOptions<Value> {
    refresh?: boolean;
}

export interface MemoizeOptions<Value = unknown> extends CacheSetOptions<Value> {
    keyResolver?: (...args: any[]) => string;
}

export interface TagIndexEntry {
    keys: Set<string>;
    expiresAt?: number;
}
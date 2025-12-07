import { EventEmitter } from 'events';
import { CacheStore, CacheEntry } from './types';

/**
 * Simple in-memory cache store with TTL support
 */

export class InMemoryCacheStore<Value = unknown> implements CacheStore<Value> {
    readonly name: string;
    private store: Map<string, CacheEntry<Value>> = new Map();
    private emitter = new EventEmitter();
    private maxSize: number;

    constructor(name: string, maxSize: number = 10000) {
        this.name = name;
        this.maxSize = maxSize;
    }

    async get(key: string): Promise<CacheEntry<Value> | undefined> {
        const entry = this.store.get(key);
        if (!entry) {
            return undefined;
        }

        if (entry.expiresAt && entry.expiresAt < Date.now()) {
            await this.delete(key);
            return undefined;
        }

        return entry;
    }

    async set(key: string, entry: CacheEntry<Value>): Promise<void> {
        if (this.store.size >= this.maxSize) {
            const oldestKey = this.store.keys().next().value;
            if (oldestKey) {
                this.store.delete(oldestKey);
            }
        }

        this.store.set(key, entry);
        this.emitter.emit('set', key, entry);
    }

    async delete(key: string): Promise<void> {
        if (this.store.has(key)) {
            this.store.delete(key);
            this.emitter.emit('delete', key);
        }
    }

    async clear(): Promise<void> {
        this.store.clear();
        this.emitter.emit('clear');
    }

    async keys(pattern?: RegExp): Promise<string[]> {
        const allKeys = Array.from(this.store.keys());
        if (!pattern) {
            return allKeys;
        }
        return allKeys.filter(key => pattern.test(key));
    }

    on(event: 'set' | 'delete' | 'clear', listener: (...args: any[]) => void) {
        this.emitter.on(event, listener);
    }
}

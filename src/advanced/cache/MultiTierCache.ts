import { CacheTierConfig, TagIndexEntry, CacheSetOptions, CacheEntry, CacheWrapOptions, MemoizeOptions } from './types';

/**
 * Multi-tier cache orchestrator
 */

export class MultiTierCache<Value = unknown> {
    private tiers: CacheTierConfig<Value>[];
    private tagIndex: Map<string, TagIndexEntry> = new Map();
    private defaultTTL: number;

    constructor(tiers: CacheTierConfig<Value>[], defaultTTL: number = 60000) {
        if (tiers.length === 0) {
            throw new Error('MultiTierCache requires at least one tier');
        }
        this.tiers = tiers;
        this.defaultTTL = defaultTTL;
    }

    /**
     * Retrieve a value from the tiers starting from the fastest one
     */
    async get(key: string): Promise<Value | undefined> {
        for (let i = 0; i < this.tiers.length; i++) {
            const tier = this.tiers[i];
            const entry = await tier.store.get(key);
            if (entry) {
                if (i > 0) {
                    // hydrate higher tiers for faster access next time
                    await this.promoteToHigherTiers(key, entry, i);
                }
                return entry.value;
            }
        }

        return undefined;
    }

    /**
     * Set a cache value across tiers
     */
    async set(key: string, value: Value, options: CacheSetOptions<Value> = {}): Promise<void> {
        const expiresAt = this.calculateExpiry(options.ttl);
        const entry: CacheEntry<Value> = {
            value,
            expiresAt,
            tags: options.tags,
            meta: options.meta
        };

        await Promise.all(this.tiers.map(async (tier) => {
            const ttl = tier.ttl ?? options.ttl ?? this.defaultTTL;
            const tierEntry = {
                ...entry,
                expiresAt: this.calculateExpiry(ttl)
            };
            await tier.store.set(key, tierEntry);
        }));

        if (options.tags?.length) {
            this.indexTags(key, options.tags, expiresAt);
        }
    }

    /**
     * Delete a cache key from all tiers
     */
    async delete(key: string): Promise<void> {
        await Promise.all(this.tiers.map(tier => tier.store.delete(key)));
        for (const entry of this.tagIndex.values()) {
            entry.keys.delete(key);
        }
    }

    /**
     * Delete keys matching a wildcard pattern
     */
    async deletePattern(pattern: string): Promise<void> {
        const regex = new RegExp(
            '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );

        for (const tier of this.tiers) {
            const keys = tier.store.keys ? await tier.store.keys(regex) : [];
            await Promise.all(keys.map(key => tier.store.delete(key)));
        }

        for (const entry of this.tagIndex.values()) {
            for (const key of Array.from(entry.keys)) {
                if (regex.test(key)) {
                    entry.keys.delete(key);
                }
            }
        }
    }

    /**
     * Invalidate cache entries by tags
     */
    async invalidateTags(tags: string[]): Promise<void> {
        const keysToDelete = new Set<string>();

        for (const tag of tags) {
            const entry = this.tagIndex.get(tag);
            if (!entry) continue;

            for (const key of entry.keys) {
                keysToDelete.add(key);
            }
            this.tagIndex.delete(tag);
        }

        await Promise.all(Array.from(keysToDelete).map(key => this.delete(key)));
    }

    /**
     * Wrap helper for cache-aside pattern
     */
    async wrap(
        key: string,
        resolver: () => Promise<Value>,
        options: CacheWrapOptions<Value> = {}
    ): Promise<Value> {
        if (!options.refresh) {
            const cached = await this.get(key);
            if (cached !== undefined) {
                return cached;
            }
        }

        const value = await resolver();
        await this.set(key, value, options);
        return value;
    }

    /**
     * Memoize async functions
     */
    memoize<Func extends (...args: any[]) => Promise<Value>>(
        fn: Func,
        options: MemoizeOptions<Value> = {}
    ): (...args: Parameters<Func>) => Promise<Value> {
        const resolver = options.keyResolver || ((...args: any[]) => JSON.stringify(args));

        return async (...args: Parameters<Func>): Promise<Value> => {
            const key = resolver(...args);
            return this.wrap(key, () => fn(...args), options);
        };
    }

    /**
     * Promote cache entry to higher tiers after a miss
     */
    private async promoteToHigherTiers(
        key: string,
        entry: CacheEntry<Value>,
        fromIndex: number
    ): Promise<void> {
        const tiersToHydrate = this.tiers.slice(0, fromIndex);

        await Promise.all(
            tiersToHydrate.map(tier => tier.store.set(key, entry))
        );
    }

    private calculateExpiry(ttl?: number): number | undefined {
        if (!ttl) {
            return undefined;
        }
        return Date.now() + ttl;
    }

    private indexTags(key: string, tags: string[], expiresAt?: number) {
        for (const tag of tags) {
            const entry = this.tagIndex.get(tag) || { keys: new Set<string>(), expiresAt };
            entry.keys.add(key);
            if (expiresAt) {
                entry.expiresAt = expiresAt;
            }
            this.tagIndex.set(tag, entry);
        }
    }

    /**
     * Export current metrics for observability or admin UI
     */
    getStats() {
        return {
            tiers: this.tiers.map(tier => ({ name: tier.store.name })),
            tags: Array.from(this.tagIndex.keys()),
            defaultTTL: this.defaultTTL
        };
    }
}

/**
 * StoreRegistry - Global store container
 * Manages all ContextStore instances at application level
 */

import { ContextStore, StoreConstructor, StoreRegistryOptions } from './types';

/**
 * StoreRegistry manages all stores in the application
 * Ensures singleton instances and handles lifecycle
 */
export class StoreRegistry {
    private stores: Map<StoreConstructor<any>, ContextStore<any>> = new Map();
    private options: StoreRegistryOptions;

    constructor(options: StoreRegistryOptions = {}) {
        this.options = options;
    }

    /**
     * Register a store class
     * Creates instance immediately
     * 
     * @param StoreClass - Store constructor class
     * @returns The created store instance
     */
    register<T extends ContextStore<any>>(StoreClass: StoreConstructor<T>): T {
        if (this.stores.has(StoreClass)) {
            if (this.options.debug) {
                console.log(`[StoreRegistry] Store ${StoreClass.name} already registered`);
            }
            return this.stores.get(StoreClass) as T;
        }

        const instance = new StoreClass({ debug: this.options.debug });
        this.stores.set(StoreClass, instance);

        if (this.options.debug) {
            console.log(`[StoreRegistry] Registered store: ${StoreClass.name}`);
        }

        // Call onInit if defined
        const initResult = instance.onInit();
        if (initResult instanceof Promise) {
            initResult.catch(err => {
                console.error(`[StoreRegistry] Error in ${StoreClass.name}.onInit():`, err);
            });
        }

        return instance;
    }

    /**
     * Register multiple stores at once
     * 
     * @param storeClasses - Array of store constructor classes
     */
    registerAll(storeClasses: StoreConstructor<any>[]): void {
        storeClasses.forEach(StoreClass => this.register(StoreClass));
    }

    /**
     * Get a store instance by its class
     * Throws if store is not registered
     * 
     * @param StoreClass - Store constructor class
     * @returns Store instance
     */
    get<T extends ContextStore<any>>(StoreClass: StoreConstructor<T>): T {
        const store = this.stores.get(StoreClass);
        
        if (!store) {
            throw new Error(
                `[StoreRegistry] Store ${StoreClass.name} is not registered. ` +
                `Make sure to call app.stores([${StoreClass.name}]) before accessing it.`
            );
        }

        return store as T;
    }

    /**
     * Check if a store is registered
     * 
     * @param StoreClass - Store constructor class
     */
    has<T extends ContextStore<any>>(StoreClass: StoreConstructor<T>): boolean {
        return this.stores.has(StoreClass);
    }

    /**
     * Get a store instance, or register it if not exists
     * Useful for lazy initialization
     * 
     * @param StoreClass - Store constructor class
     * @returns Store instance
     */
    getOrRegister<T extends ContextStore<any>>(StoreClass: StoreConstructor<T>): T {
        if (!this.stores.has(StoreClass)) {
            return this.register(StoreClass);
        }
        return this.stores.get(StoreClass) as T;
    }

    /**
     * Remove a store from registry and dispose it
     * 
     * @param StoreClass - Store constructor class
     */
    unregister<T extends ContextStore<any>>(StoreClass: StoreConstructor<T>): void {
        const store = this.stores.get(StoreClass);
        
        if (store) {
            store.dispose();
            this.stores.delete(StoreClass);
            
            if (this.options.debug) {
                console.log(`[StoreRegistry] Unregistered store: ${StoreClass.name}`);
            }
        }
    }

    /**
     * Get all registered store classes
     */
    getRegisteredStores(): StoreConstructor<any>[] {
        return Array.from(this.stores.keys());
    }

    /**
     * Get store count
     */
    get size(): number {
        return this.stores.size;
    }

    /**
     * Dispose all stores and clear registry
     */
    dispose(): void {
        if (this.options.debug) {
            console.log(`[StoreRegistry] Disposing all stores (${this.stores.size})`);
        }

        this.stores.forEach((store, StoreClass) => {
            try {
                store.dispose();
            } catch (error) {
                console.error(`[StoreRegistry] Error disposing ${StoreClass.name}:`, error);
            }
        });

        this.stores.clear();
    }

    /**
     * Get debug info about all stores
     */
    getDebugInfo(): Record<string, { listenerCount: number; isInitialized: boolean }> {
        const info: Record<string, { listenerCount: number; isInitialized: boolean }> = {};
        
        this.stores.forEach((store, StoreClass) => {
            info[StoreClass.name] = {
                listenerCount: store.listenerCount,
                isInitialized: store.isInitialized
            };
        });

        return info;
    }
}

/**
 * Create a new store registry
 */
export function createStoreRegistry(options?: StoreRegistryOptions): StoreRegistry {
    return new StoreRegistry(options);
}

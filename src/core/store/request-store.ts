/**
 * RequestStore - Per-request state management
 * State hanya bertahan selama satu request lifecycle
 * 
 * Berbeda dengan ContextStore (global/singleton),
 * RequestStore di-create fresh untuk setiap request
 */

import { StoreListener, DisposeCallback, StoreOptions } from './types';

/**
 * RequestStore constructor type
 */
export type RequestStoreConstructor<T extends RequestStore<any>> = new (...args: any[]) => T;

/**
 * Extract state type from RequestStore
 */
export type RequestStateOf<T> = T extends RequestStore<infer S> ? S : never;

/**
 * RequestStore - Per-request scoped state
 * 
 * State hanya berlaku untuk satu request.
 * Setiap request baru akan mendapat instance baru.
 * 
 * @example
 * ```typescript
 * interface CheckoutState {
 *   items: CartItem[];
 *   total: number;
 *   discount: number;
 *   validated: boolean;
 * }
 * 
 * class CheckoutStore extends RequestStore<CheckoutState> {
 *   protected initial(): CheckoutState {
 *     return { items: [], total: 0, discount: 0, validated: false };
 *   }
 *   
 *   addItem(item: CartItem) {
 *     const items = [...this.state.items, item];
 *     const total = items.reduce((sum, i) => sum + i.price, 0);
 *     this.set({ ...this.state, items, total });
 *   }
 *   
 *   applyDiscount(percent: number) {
 *     const discount = this.state.total * (percent / 100);
 *     this.update({ discount });
 *   }
 *   
 *   validate() {
 *     this.update({ validated: true });
 *   }
 * }
 * ```
 */
export abstract class RequestStore<T = any> {
    private _state: T;
    private _listeners: Set<StoreListener<T>> = new Set();
    private _options: StoreOptions;
    private _requestId: string;

    constructor(options: StoreOptions = {}) {
        this._options = options;
        this._state = this.initial();
        this._requestId = this.generateRequestId();
    }

    /**
     * Generate unique request ID
     */
    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Define initial state (wajib implement)
     */
    protected abstract initial(): T;

    /**
     * Get current state (readonly)
     */
    get state(): Readonly<T> {
        return this._state;
    }

    /**
     * Get store name
     */
    get name(): string {
        return this._options.name || this.constructor.name;
    }

    /**
     * Get request ID (unique per request)
     */
    get requestId(): string {
        return this._requestId;
    }

    /**
     * Get listener count
     */
    get listenerCount(): number {
        return this._listeners.size;
    }

    /**
     * Set state (replace entirely)
     */
    protected set(newState: T): void {
        const prevState = this._state;
        this._state = newState;

        if (this._options.debug) {
            console.log(`[RequestStore:${this.name}:${this._requestId}] State updated:`, {
                prev: prevState,
                next: newState
            });
        }

        // Notify listeners
        this._listeners.forEach(listener => {
            try {
                listener(this._state, prevState);
            } catch (error) {
                console.error(`[RequestStore:${this.name}] Listener error:`, error);
            }
        });
    }

    /**
     * Update state partially (merge)
     */
    protected update(partial: Partial<T>): void {
        if (typeof this._state === 'object' && this._state !== null) {
            this.set({ ...this._state, ...partial } as T);
        } else {
            throw new Error(`[RequestStore:${this.name}] update() only works with object state`);
        }
    }

    /**
     * Listen to state changes
     */
    listen(listener: StoreListener<T>): DisposeCallback {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    /**
     * Reset to initial state
     */
    reset(): void {
        this.set(this.initial());
    }

    /**
     * Dispose store (cleanup)
     */
    dispose(): void {
        if (this._options.debug) {
            console.log(`[RequestStore:${this.name}:${this._requestId}] Disposed`);
        }
        this._listeners.clear();
        this.onDispose();
    }

    /**
     * Lifecycle: called on dispose
     */
    protected onDispose(): void {
        // Override if needed
    }
}

/**
 * RequestStoreRegistry - Manages stores for a single request
 * Created fresh for each request, disposed after response
 */
export class RequestStoreRegistry {
    private stores: Map<RequestStoreConstructor<any>, RequestStore<any>> = new Map();
    private debug: boolean;

    constructor(debug: boolean = false) {
        this.debug = debug;
    }

    /**
     * Get or create a RequestStore for this request
     */
    get<T extends RequestStore<any>>(StoreClass: RequestStoreConstructor<T>): T {
        if (!this.stores.has(StoreClass)) {
            const instance = new StoreClass({ debug: this.debug });
            this.stores.set(StoreClass, instance);
            
            if (this.debug) {
                console.log(`[RequestStoreRegistry] Created: ${StoreClass.name}`);
            }
        }
        return this.stores.get(StoreClass) as T;
    }

    /**
     * Check if store exists
     */
    has<T extends RequestStore<any>>(StoreClass: RequestStoreConstructor<T>): boolean {
        return this.stores.has(StoreClass);
    }

    /**
     * Get all stores
     */
    getAll(): RequestStore<any>[] {
        return Array.from(this.stores.values());
    }

    /**
     * Dispose all stores (call at end of request)
     */
    dispose(): void {
        this.stores.forEach((store) => {
            try {
                store.dispose();
            } catch (error) {
                console.error(`[RequestStoreRegistry] Dispose error:`, error);
            }
        });
        this.stores.clear();
    }

    /**
     * Get store count
     */
    get size(): number {
        return this.stores.size;
    }
}

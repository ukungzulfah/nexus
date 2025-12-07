/**
 * ContextStore Types
 * State management system inspired by Flutter's Provider pattern
 */

/**
 * Listener callback type
 */
export type StoreListener<T> = (state: T, prevState: T) => void;

/**
 * Dispose callback for cleanup
 */
export type DisposeCallback = () => void;

/**
 * Store constructor type for type-safe store access
 */
export type StoreConstructor<T extends ContextStore<any>> = new (...args: any[]) => T;

/**
 * Extract state type from store
 */
export type StateOf<T> = T extends ContextStore<infer S> ? S : never;

/**
 * Store options
 */
export interface StoreOptions {
    /** Enable debug logging */
    debug?: boolean;
    /** Store name for debugging */
    name?: string;
}

/**
 * Store registry options
 */
export interface StoreRegistryOptions {
    /** Enable debug logging */
    debug?: boolean;
}

/**
 * Base abstract class for ContextStore
 * Extend this class to create your own stores
 * 
 * @example
 * ```typescript
 * interface UserState {
 *   users: User[];
 *   loading: boolean;
 * }
 * 
 * class UserStore extends ContextStore<UserState> {
 *   protected initial(): UserState {
 *     return { users: [], loading: false };
 *   }
 *   
 *   async fetchUsers() {
 *     this.set({ ...this.state, loading: true });
 *     const users = await api.getUsers();
 *     this.set({ users, loading: false });
 *   }
 * }
 * ```
 */
export abstract class ContextStore<T = any> {
    private _state: T;
    private _listeners: Set<StoreListener<T>> = new Set();
    private _disposeCallbacks: DisposeCallback[] = [];
    private _options: StoreOptions;
    private _initialized: boolean = false;

    constructor(options: StoreOptions = {}) {
        this._options = options;
        this._state = this.initial();
        this._initialized = true;
    }

    /**
     * Define the initial state
     * Must be implemented by subclasses
     */
    protected abstract initial(): T;

    /**
     * Get current state (readonly)
     */
    get state(): Readonly<T> {
        return this._state;
    }

    /**
     * Get store name for debugging
     */
    get name(): string {
        return this._options.name || this.constructor.name;
    }

    /**
     * Update state and notify all listeners
     * 
     * @param newState - New state or partial state update
     */
    protected set(newState: T): void {
        const prevState = this._state;
        this._state = newState;

        if (this._options.debug) {
            console.log(`[ContextStore:${this.name}] State updated:`, {
                prev: prevState,
                next: newState
            });
        }

        // Notify all listeners
        this._listeners.forEach(listener => {
            try {
                listener(this._state, prevState);
            } catch (error) {
                console.error(`[ContextStore:${this.name}] Listener error:`, error);
            }
        });
    }

    /**
     * Update state partially (merge with current state)
     * Only works if state is an object
     * 
     * @param partial - Partial state to merge
     */
    protected update(partial: Partial<T>): void {
        if (typeof this._state === 'object' && this._state !== null) {
            this.set({ ...this._state, ...partial } as T);
        } else {
            throw new Error(`[ContextStore:${this.name}] update() only works with object state`);
        }
    }

    /**
     * Listen to state changes
     * Returns unsubscribe function
     * 
     * @param listener - Callback function called on state change
     * @returns Unsubscribe function
     * 
     * @example
     * ```typescript
     * const unsubscribe = store.listen((state, prevState) => {
     *   console.log('State changed:', state);
     * });
     * 
     * // Later: cleanup
     * unsubscribe();
     * ```
     */
    listen(listener: StoreListener<T>): DisposeCallback {
        this._listeners.add(listener);
        
        const unsubscribe = () => {
            this._listeners.delete(listener);
        };

        // Track for auto-dispose
        this._disposeCallbacks.push(unsubscribe);

        return unsubscribe;
    }

    /**
     * Get listener count (useful for debugging)
     */
    get listenerCount(): number {
        return this._listeners.size;
    }

    /**
     * Check if store is initialized
     */
    get isInitialized(): boolean {
        return this._initialized;
    }

    /**
     * Reset state to initial value
     */
    reset(): void {
        this.set(this.initial());
    }

    /**
     * Dispose store and cleanup all listeners
     * Called automatically when store is removed from registry
     */
    dispose(): void {
        if (this._options.debug) {
            console.log(`[ContextStore:${this.name}] Disposing...`);
        }

        // Clear all listeners
        this._listeners.clear();
        
        // Call all dispose callbacks
        this._disposeCallbacks.forEach(cb => {
            try {
                cb();
            } catch (error) {
                console.error(`[ContextStore:${this.name}] Dispose callback error:`, error);
            }
        });
        this._disposeCallbacks = [];

        // Call lifecycle hook
        this.onDispose();
    }

    /**
     * Lifecycle hook: called when store is disposed
     * Override to add custom cleanup logic
     */
    protected onDispose(): void {
        // Override in subclass if needed
    }

    /**
     * Lifecycle hook: called when store is first accessed
     * Override to add initialization logic (e.g., fetch initial data)
     */
    onInit(): void | Promise<void> {
        // Override in subclass if needed
    }
}

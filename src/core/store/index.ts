/**
 * ContextStore System
 * State management inspired by Flutter's Provider pattern
 * 
 * Two types of stores:
 * - ContextStore: Global singleton, persists across all requests
 * - RequestStore: Per-request scoped, disposed after response
 */

// Core store classes
export { ContextStore } from './types';
export { RequestStore } from './request-store';

// Types
export type { 
    StoreListener, 
    DisposeCallback, 
    StoreConstructor, 
    StateOf, 
    StoreOptions 
} from './types';

export type { 
    RequestStoreConstructor, 
    RequestStateOf 
} from './request-store';

// Registries
export { StoreRegistry, createStoreRegistry } from './registry';
export { RequestStoreRegistry } from './request-store';

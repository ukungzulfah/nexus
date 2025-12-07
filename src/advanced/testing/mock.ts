/**
 * Mock utilities for testing - database mocks, fetch mocks, and more
 */

import { EventEmitter } from 'events';

export type MockFn<T = any> = {
    (...args: any[]): T;
    calls: any[][];
    results: T[];
    mockReturnValue(value: T): MockFn<T>;
    mockReturnValueOnce(value: T): MockFn<T>;
    mockResolvedValue(value: T): MockFn<Promise<T>>;
    mockResolvedValueOnce(value: T): MockFn<Promise<T>>;
    mockRejectedValue(error: Error): MockFn<Promise<never>>;
    mockRejectedValueOnce(error: Error): MockFn<Promise<never>>;
    mockImplementation(fn: (...args: any[]) => T): MockFn<T>;
    mockImplementationOnce(fn: (...args: any[]) => T): MockFn<T>;
    mockClear(): void;
    mockReset(): void;
    toHaveBeenCalled(): boolean;
    toHaveBeenCalledTimes(count: number): boolean;
    toHaveBeenCalledWith(...args: any[]): boolean;
    toHaveBeenLastCalledWith(...args: any[]): boolean;
};

/**
 * Create a mock function
 */
export function createMockFn<T = any>(defaultImpl?: (...args: any[]) => T): MockFn<T> {
    let returnValue: T | undefined;
    let returnQueue: T[] = [];
    let implementation: ((...args: any[]) => T) | undefined = defaultImpl;
    let implementationQueue: Array<(...args: any[]) => T> = [];

    const fn = ((...args: any[]): T => {
        fn.calls.push(args);

        // Check implementation queue first
        if (implementationQueue.length > 0) {
            const impl = implementationQueue.shift()!;
            const result = impl(...args);
            fn.results.push(result);
            return result;
        }

        // Check return value queue
        if (returnQueue.length > 0) {
            const result = returnQueue.shift()!;
            fn.results.push(result);
            return result;
        }

        // Use implementation if set
        if (implementation) {
            const result = implementation(...args);
            fn.results.push(result);
            return result;
        }

        // Return static value
        fn.results.push(returnValue as T);
        return returnValue as T;
    }) as MockFn<T>;

    fn.calls = [];
    fn.results = [];

    fn.mockReturnValue = (value: T) => {
        returnValue = value;
        return fn;
    };

    fn.mockReturnValueOnce = (value: T) => {
        returnQueue.push(value);
        return fn;
    };

    fn.mockResolvedValue = (value: T) => {
        returnValue = Promise.resolve(value) as any;
        return fn as any;
    };

    fn.mockResolvedValueOnce = (value: T) => {
        returnQueue.push(Promise.resolve(value) as any);
        return fn as any;
    };

    fn.mockRejectedValue = (error: Error) => {
        returnValue = Promise.reject(error) as any;
        return fn as any;
    };

    fn.mockRejectedValueOnce = (error: Error) => {
        returnQueue.push(Promise.reject(error) as any);
        return fn as any;
    };

    fn.mockImplementation = (impl: (...args: any[]) => T) => {
        implementation = impl;
        return fn;
    };

    fn.mockImplementationOnce = (impl: (...args: any[]) => T) => {
        implementationQueue.push(impl);
        return fn;
    };

    fn.mockClear = () => {
        fn.calls = [];
        fn.results = [];
    };

    fn.mockReset = () => {
        fn.mockClear();
        returnValue = undefined;
        returnQueue = [];
        implementation = defaultImpl;
        implementationQueue = [];
    };

    fn.toHaveBeenCalled = () => fn.calls.length > 0;
    fn.toHaveBeenCalledTimes = (count: number) => fn.calls.length === count;
    fn.toHaveBeenCalledWith = (...args: any[]) => 
        fn.calls.some(call => JSON.stringify(call) === JSON.stringify(args));
    fn.toHaveBeenLastCalledWith = (...args: any[]) => 
        fn.calls.length > 0 && JSON.stringify(fn.calls[fn.calls.length - 1]) === JSON.stringify(args);

    return fn;
}

/**
 * Mock database for testing
 */
export interface MockRecord {
    id: string | number;
    [key: string]: any;
}

export interface MockTableOptions {
    autoIncrement?: boolean;
    primaryKey?: string;
}

export class MockTable<T extends MockRecord = MockRecord> {
    private records: Map<string | number, T> = new Map();
    private autoIncrementId = 1;
    private options: MockTableOptions;
    private primaryKey: string;

    // Mock functions for assertion
    insert = createMockFn<Promise<T>>();
    update = createMockFn<Promise<T | undefined>>();
    delete = createMockFn<Promise<boolean>>();
    find = createMockFn<Promise<T | undefined>>();
    findMany = createMockFn<Promise<T[]>>();

    constructor(options: MockTableOptions = {}) {
        this.options = options;
        this.primaryKey = options.primaryKey ?? 'id';

        // Set up real implementations
        this.insert.mockImplementation(async (data: Partial<T>) => {
            const record = { ...data } as T;
            if (this.options.autoIncrement !== false && !record[this.primaryKey]) {
                (record as any)[this.primaryKey] = this.autoIncrementId++;
            }
            this.records.set(record[this.primaryKey], record);
            return record;
        });

        this.update.mockImplementation(async (id: string | number, data: Partial<T>) => {
            const existing = this.records.get(id);
            if (!existing) return undefined;
            const updated = { ...existing, ...data };
            this.records.set(id, updated);
            return updated;
        });

        this.delete.mockImplementation(async (id: string | number) => {
            return this.records.delete(id);
        });

        this.find.mockImplementation(async (id: string | number) => {
            return this.records.get(id);
        });

        this.findMany.mockImplementation(async (filter?: Partial<T>) => {
            const all = Array.from(this.records.values());
            if (!filter) return all;
            return all.filter(record => {
                for (const [key, value] of Object.entries(filter)) {
                    if (record[key] !== value) return false;
                }
                return true;
            });
        });
    }

    /**
     * Get all records (for assertions)
     */
    getAll(): T[] {
        return Array.from(this.records.values());
    }

    /**
     * Seed the table with data
     */
    seed(records: T[]): void {
        for (const record of records) {
            this.records.set(record[this.primaryKey], record);
            if (typeof record[this.primaryKey] === 'number') {
                this.autoIncrementId = Math.max(this.autoIncrementId, record[this.primaryKey] as number + 1);
            }
        }
    }

    /**
     * Clear all records
     */
    clear(): void {
        this.records.clear();
        this.autoIncrementId = 1;
    }

    /**
     * Reset everything including mock calls
     */
    reset(): void {
        this.clear();
        this.insert.mockClear();
        this.update.mockClear();
        this.delete.mockClear();
        this.find.mockClear();
        this.findMany.mockClear();
    }
}

export class MockDatabase {
    private tables: Map<string, MockTable> = new Map();

    /**
     * Get or create a mock table
     */
    table<T extends MockRecord = MockRecord>(name: string, options?: MockTableOptions): MockTable<T> {
        if (!this.tables.has(name)) {
            this.tables.set(name, new MockTable<T>(options));
        }
        return this.tables.get(name) as MockTable<T>;
    }

    /**
     * Reset all tables
     */
    reset(): void {
        for (const table of this.tables.values()) {
            table.reset();
        }
    }

    /**
     * Clear all data but keep mock tracking
     */
    clear(): void {
        for (const table of this.tables.values()) {
            table.clear();
        }
    }

    /**
     * Transaction mock
     */
    transaction = createMockFn<Promise<any>>().mockImplementation(async (callback: (trx: MockDatabase) => Promise<any>) => {
        return callback(this);
    });
}

/**
 * Mock HTTP fetch with pattern matching
 */
export interface MockRoute {
    method: string;
    pattern: RegExp | string;
    handler: (url: string, options?: RequestInit) => Promise<MockResponse> | MockResponse;
}

export interface MockResponse {
    status: number;
    statusText?: string;
    headers?: Record<string, string>;
    body?: any;
}

export class MockFetch {
    private routes: MockRoute[] = [];
    private calls: Array<{ url: string; options?: RequestInit }> = [];
    private originalFetch?: typeof fetch;

    /**
     * Register a mock route
     */
    mock(pattern: string | RegExp, method: string = 'GET'): MockRouteBuilder {
        return new MockRouteBuilder(this, pattern, method);
    }

    /**
     * Register GET mock
     */
    get(pattern: string | RegExp): MockRouteBuilder {
        return this.mock(pattern, 'GET');
    }

    /**
     * Register POST mock
     */
    post(pattern: string | RegExp): MockRouteBuilder {
        return this.mock(pattern, 'POST');
    }

    /**
     * Register PUT mock
     */
    put(pattern: string | RegExp): MockRouteBuilder {
        return this.mock(pattern, 'PUT');
    }

    /**
     * Register DELETE mock
     */
    delete(pattern: string | RegExp): MockRouteBuilder {
        return this.mock(pattern, 'DELETE');
    }

    /**
     * Add a route handler
     */
    addRoute(route: MockRoute): void {
        this.routes.push(route);
    }

    /**
     * Install mock fetch globally
     */
    install(): void {
        this.originalFetch = globalThis.fetch;
        globalThis.fetch = this.createFetch();
    }

    /**
     * Restore original fetch
     */
    restore(): void {
        if (this.originalFetch) {
            globalThis.fetch = this.originalFetch;
            this.originalFetch = undefined;
        }
    }

    /**
     * Get all calls made
     */
    getCalls(): Array<{ url: string; options?: RequestInit }> {
        return [...this.calls];
    }

    /**
     * Check if a URL was called
     */
    wasCalled(pattern: string | RegExp): boolean {
        return this.calls.some(call => {
            if (typeof pattern === 'string') {
                return call.url.includes(pattern);
            }
            return pattern.test(call.url);
        });
    }

    /**
     * Clear all routes and calls
     */
    reset(): void {
        this.routes = [];
        this.calls = [];
    }

    /**
     * Create the mock fetch function
     */
    private createFetch(): typeof fetch {
        return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
            const url = typeof input === 'string' ? input : input.toString();
            const method = init?.method ?? 'GET';

            this.calls.push({ url, options: init });

            // Find matching route
            for (const route of this.routes) {
                if (route.method.toUpperCase() !== method.toUpperCase()) continue;

                const matches = typeof route.pattern === 'string'
                    ? url.includes(route.pattern)
                    : route.pattern.test(url);

                if (matches) {
                    const mockResponse = await route.handler(url, init);
                    return this.createResponse(mockResponse);
                }
            }

            // No match found - throw error or return 404
            throw new Error(`No mock found for ${method} ${url}`);
        };
    }

    private createResponse(mock: MockResponse): Response {
        const body = typeof mock.body === 'string' ? mock.body : JSON.stringify(mock.body);
        return new Response(body, {
            status: mock.status,
            statusText: mock.statusText ?? 'OK',
            headers: new Headers(mock.headers ?? { 'Content-Type': 'application/json' })
        });
    }
}

class MockRouteBuilder {
    private parent: MockFetch;
    private pattern: string | RegExp;
    private method: string;

    constructor(parent: MockFetch, pattern: string | RegExp, method: string) {
        this.parent = parent;
        this.pattern = pattern;
        this.method = method;
    }

    /**
     * Reply with static response
     */
    reply(status: number, body?: any, headers?: Record<string, string>): MockFetch {
        this.parent.addRoute({
            method: this.method,
            pattern: this.pattern,
            handler: () => ({ status, body, headers })
        });
        return this.parent;
    }

    /**
     * Reply with dynamic handler
     */
    replyWith(handler: (url: string, options?: RequestInit) => Promise<MockResponse> | MockResponse): MockFetch {
        this.parent.addRoute({
            method: this.method,
            pattern: this.pattern,
            handler
        });
        return this.parent;
    }

    /**
     * Simulate network error
     */
    networkError(message: string = 'Network error'): MockFetch {
        this.parent.addRoute({
            method: this.method,
            pattern: this.pattern,
            handler: () => { throw new Error(message); }
        });
        return this.parent;
    }

    /**
     * Simulate timeout
     */
    timeout(ms: number = 5000): MockFetch {
        this.parent.addRoute({
            method: this.method,
            pattern: this.pattern,
            handler: async () => {
                await new Promise(resolve => setTimeout(resolve, ms));
                throw new Error('Request timeout');
            }
        });
        return this.parent;
    }
}

/**
 * Mock timer utilities
 */
export class MockTimers {
    private originalSetTimeout?: typeof setTimeout;
    private originalSetInterval?: typeof setInterval;
    private originalClearTimeout?: typeof clearTimeout;
    private originalClearInterval?: typeof clearInterval;
    private originalDateNow?: typeof Date.now;
    private currentTime: number = 0;
    private timers: Map<number, { callback: () => void; time: number; interval?: number }> = new Map();
    private nextId = 1;

    /**
     * Install mock timers
     */
    install(startTime: number = Date.now()): void {
        this.currentTime = startTime;
        this.originalSetTimeout = globalThis.setTimeout;
        this.originalSetInterval = globalThis.setInterval;
        this.originalClearTimeout = globalThis.clearTimeout;
        this.originalClearInterval = globalThis.clearInterval;
        this.originalDateNow = Date.now;

        (globalThis as any).setTimeout = (callback: () => void, delay: number = 0) => {
            const id = this.nextId++;
            this.timers.set(id, { callback, time: this.currentTime + delay });
            return id;
        };

        (globalThis as any).setInterval = (callback: () => void, delay: number) => {
            const id = this.nextId++;
            this.timers.set(id, { callback, time: this.currentTime + delay, interval: delay });
            return id;
        };

        (globalThis as any).clearTimeout = (id: number) => {
            this.timers.delete(id);
        };

        (globalThis as any).clearInterval = (id: number) => {
            this.timers.delete(id);
        };

        Date.now = () => this.currentTime;
    }

    /**
     * Advance time and run pending timers
     */
    async tick(ms: number): Promise<void> {
        const targetTime = this.currentTime + ms;

        while (this.currentTime < targetTime) {
            // Find next timer
            let nextTimer: { id: number; entry: { callback: () => void; time: number; interval?: number } } | undefined;

            for (const [id, entry] of this.timers.entries()) {
                if (entry.time <= targetTime) {
                    if (!nextTimer || entry.time < nextTimer.entry.time) {
                        nextTimer = { id, entry };
                    }
                }
            }

            if (!nextTimer || nextTimer.entry.time > targetTime) {
                this.currentTime = targetTime;
                break;
            }

            this.currentTime = nextTimer.entry.time;
            const { id, entry } = nextTimer;

            if (entry.interval) {
                // Reschedule interval
                entry.time = this.currentTime + entry.interval;
            } else {
                this.timers.delete(id);
            }

            entry.callback();
        }
    }

    /**
     * Run all pending timers
     */
    async runAll(): Promise<void> {
        let iterations = 0;
        const maxIterations = 1000;

        while (this.timers.size > 0 && iterations < maxIterations) {
            const nextTime = Math.min(...Array.from(this.timers.values()).map(t => t.time));
            await this.tick(nextTime - this.currentTime + 1);
            iterations++;
        }
    }

    /**
     * Get current mocked time
     */
    now(): number {
        return this.currentTime;
    }

    /**
     * Set current time
     */
    setTime(time: number): void {
        this.currentTime = time;
    }

    /**
     * Restore original timers
     */
    restore(): void {
        if (this.originalSetTimeout) globalThis.setTimeout = this.originalSetTimeout;
        if (this.originalSetInterval) globalThis.setInterval = this.originalSetInterval;
        if (this.originalClearTimeout) globalThis.clearTimeout = this.originalClearTimeout;
        if (this.originalClearInterval) globalThis.clearInterval = this.originalClearInterval;
        if (this.originalDateNow) Date.now = this.originalDateNow;
        this.timers.clear();
    }
}

/**
 * Event spy for testing event emitters
 */
export class EventSpy {
    private events: Map<string, any[][]> = new Map();
    private emitter: EventEmitter;

    constructor(emitter: EventEmitter) {
        this.emitter = emitter;
    }

    /**
     * Start spying on an event
     */
    on(event: string): this {
        this.events.set(event, []);
        this.emitter.on(event, (...args: any[]) => {
            this.events.get(event)?.push(args);
        });
        return this;
    }

    /**
     * Get calls for an event
     */
    getCalls(event: string): any[][] {
        return this.events.get(event) ?? [];
    }

    /**
     * Check if event was emitted
     */
    wasEmitted(event: string): boolean {
        return (this.events.get(event)?.length ?? 0) > 0;
    }

    /**
     * Get count of event emissions
     */
    count(event: string): number {
        return this.events.get(event)?.length ?? 0;
    }

    /**
     * Clear all tracked events
     */
    clear(): void {
        for (const calls of this.events.values()) {
            calls.length = 0;
        }
    }
}

// Export convenience singleton
export const mockDb = new MockDatabase();
export const mockFetch = new MockFetch();
export const mockTimers = new MockTimers();

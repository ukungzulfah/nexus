import { request as httpRequest, RequestOptions } from 'http';
import { AddressInfo } from 'net';
import { URLSearchParams } from 'url';
import { Application } from '../../core/application';

// Re-export all testing utilities
export * from './mock';
export * from './factory';
export * from './load-test';
export * from './mock-server';

export interface TestRequestOptions {
    headers?: Record<string, string>;
    body?: any;
    query?: Record<string, string | number | boolean>;
    timeout?: number;
}

export interface TestResponse<T = any> {
    status: number;
    headers: Record<string, string | string[]>;
    body: string;
    duration: number;
    json(): T;
}

export interface PerformanceAssertion {
    toBeLessThan(ms: number): void;
    toBeGreaterThan(ms: number): void;
    toBeBetween(min: number, max: number): void;
}

/**
 * Snapshot storage for snapshot testing
 */
class SnapshotStore {
    private snapshots: Map<string, string> = new Map();
    private updateMode: boolean = false;

    setUpdateMode(update: boolean): void {
        this.updateMode = update;
    }

    save(name: string, value: string): void {
        this.snapshots.set(name, value);
    }

    get(name: string): string | undefined {
        return this.snapshots.get(name);
    }

    match(name: string, value: any): { matched: boolean; expected?: string; actual: string } {
        const actual = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        const expected = this.snapshots.get(name);

        if (this.updateMode || !expected) {
            this.save(name, actual);
            return { matched: true, actual };
        }

        return {
            matched: actual === expected,
            expected,
            actual
        };
    }

    clear(): void {
        this.snapshots.clear();
    }
}

const snapshotStore = new SnapshotStore();

export class TestClient {
    private app: Application;
    private server?: ReturnType<Application['listen']>;
    private baseUrl?: string;
    private defaultHeaders: Record<string, string> = {};
    private authToken?: string;
    private authUser?: any;

    constructor(app: Application) {
        this.app = app;
    }

    /**
     * Get the current authenticated user (if any)
     */
    getAuthUser(): any {
        return this.authUser;
    }

    /**
     * Set default headers for all requests
     */
    setDefaultHeaders(headers: Record<string, string>): this {
        this.defaultHeaders = { ...this.defaultHeaders, ...headers };
        return this;
    }

    /**
     * Authenticate requests with a token
     */
    authenticate(token: string): this;
    authenticate(user: { token: string; [key: string]: any }): this;
    authenticate(tokenOrUser: string | { token: string; [key: string]: any }): this {
        if (typeof tokenOrUser === 'string') {
            this.authToken = tokenOrUser;
        } else {
            this.authToken = tokenOrUser.token;
            this.authUser = tokenOrUser;
        }
        return this;
    }

    /**
     * Clear authentication
     */
    clearAuth(): this {
        this.authToken = undefined;
        this.authUser = undefined;
        return this;
    }

    async start() {
        if (this.server) return;
        await new Promise<void>((resolve) => {
            this.server = this.app.listen(0, () => resolve());
        });
        const address = this.server!.address() as AddressInfo;
        this.baseUrl = `http://127.0.0.1:${address.port}`;
    }

    async stop() {
        if (!this.server) return;
        await new Promise<void>((resolve, reject) => {
            this.server!.close((error) => (error ? reject(error) : resolve()));
        });
        this.server = undefined;
    }

    async request(method: string, path: string, options: TestRequestOptions = {}): Promise<TestResponse> {
        await this.start();
        const url = new URL(path, this.baseUrl);

        if (options.query) {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(options.query)) {
                params.append(key, String(value));
            }
            url.search = params.toString();
        }

        const body = options.body
            ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
            : undefined;

        // Merge headers
        const headers: Record<string, string> = {
            ...this.defaultHeaders,
            ...(options.headers || {})
        };

        // Add auth header if authenticated
        if (this.authToken && !headers['Authorization']) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        // Add content headers for body
        if (body) {
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
            headers['Content-Length'] = Buffer.byteLength(body).toString();
        }

        const requestOptions: RequestOptions = {
            method,
            headers
        };

        const start = Date.now();
        return new Promise<TestResponse>((resolve, reject) => {
            const req = httpRequest(url, requestOptions, res => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    const responseBody = Buffer.concat(chunks).toString('utf-8');
                    const duration = Date.now() - start;
                    resolve({
                        status: res.statusCode || 0,
                        headers: res.headers as Record<string, string | string[]>,
                        body: responseBody,
                        duration,
                        json() {
                            return JSON.parse(responseBody || '{}');
                        }
                    });
                });
            });

            req.on('error', reject);

            if (options.timeout) {
                req.setTimeout(options.timeout, () => {
                    req.destroy(new Error('Request timeout'));
                });
            }

            if (body) {
                req.write(body);
            }
            req.end();
        });
    }

    get(path: string, options?: TestRequestOptions) {
        return this.request('GET', path, options);
    }

    post(path: string, options?: TestRequestOptions) {
        return this.request('POST', path, options);
    }

    put(path: string, options?: TestRequestOptions) {
        return this.request('PUT', path, options);
    }

    patch(path: string, options?: TestRequestOptions) {
        return this.request('PATCH', path, options);
    }

    delete(path: string, options?: TestRequestOptions) {
        return this.request('DELETE', path, options);
    }
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Create performance assertion for response duration
 */
export function expectDuration(response: TestResponse): PerformanceAssertion {
    return {
        toBeLessThan(ms: number) {
            if (response.duration >= ms) {
                throw new Error(
                    `Expected response duration (${response.duration}ms) to be less than ${ms}ms`
                );
            }
        },
        toBeGreaterThan(ms: number) {
            if (response.duration <= ms) {
                throw new Error(
                    `Expected response duration (${response.duration}ms) to be greater than ${ms}ms`
                );
            }
        },
        toBeBetween(min: number, max: number) {
            if (response.duration < min || response.duration > max) {
                throw new Error(
                    `Expected response duration (${response.duration}ms) to be between ${min}ms and ${max}ms`
                );
            }
        }
    };
}

/**
 * Snapshot testing
 */
export function expectSnapshot(name: string, value: any): { toMatch(): void; toMatchSnapshot(): void } {
    return {
        toMatch() {
            const result = snapshotStore.match(name, value);
            if (!result.matched) {
                throw new Error(
                    `Snapshot mismatch for "${name}":\n` +
                    `Expected:\n${result.expected}\n\n` +
                    `Actual:\n${result.actual}`
                );
            }
        },
        toMatchSnapshot() {
            this.toMatch();
        }
    };
}

/**
 * Enable snapshot update mode
 */
export function updateSnapshots(update: boolean = true): void {
    snapshotStore.setUpdateMode(update);
}

// ============================================================================
// Test Suite Helpers
// ============================================================================

export interface TestContext {
    client: TestClient;
    baseUrl: string;
}

export interface TestSuiteOptions {
    app: Application;
    beforeAll?: () => Promise<void>;
    afterAll?: () => Promise<void>;
    beforeEach?: () => Promise<void>;
    afterEach?: () => Promise<void>;
}

/**
 * Create a test suite with automatic setup/teardown
 */
export function createTestSuite(options: TestSuiteOptions) {
    const client = new TestClient(options.app);

    return {
        client,

        async setup(): Promise<TestContext> {
            if (options.beforeAll) {
                await options.beforeAll();
            }
            await client.start();
            return {
                client,
                baseUrl: (client as any).baseUrl
            };
        },

        async teardown(): Promise<void> {
            await client.stop();
            if (options.afterAll) {
                await options.afterAll();
            }
        },

        async runBeforeEach(): Promise<void> {
            if (options.beforeEach) {
                await options.beforeEach();
            }
        },

        async runAfterEach(): Promise<void> {
            if (options.afterEach) {
                await options.afterEach();
            }
        }
    };
}

// ============================================================================
// Database Seeding Helpers
// ============================================================================

export interface SeedConfig<T> {
    table: string;
    data: T[];
    truncate?: boolean;
}

/**
 * Database seeder for test data
 */
export class TestSeeder {
    private seeders: Map<string, SeedConfig<any>> = new Map();
    private insertFn?: (table: string, data: any[]) => Promise<void>;
    private truncateFn?: (table: string) => Promise<void>;

    /**
     * Configure database functions
     */
    configure(options: {
        insert: (table: string, data: any[]) => Promise<void>;
        truncate?: (table: string) => Promise<void>;
    }): this {
        this.insertFn = options.insert;
        this.truncateFn = options.truncate;
        return this;
    }

    /**
     * Define seed data for a table
     */
    define<T>(table: string, data: T[], truncate: boolean = true): this {
        this.seeders.set(table, { table, data, truncate });
        return this;
    }

    /**
     * Seed a specific table
     */
    async seed<T>(table: string, data?: T[]): Promise<void> {
        if (!this.insertFn) {
            throw new Error('Seeder not configured. Call configure() first.');
        }

        const config = data ? { table, data, truncate: true } : this.seeders.get(table);
        if (!config) {
            throw new Error(`No seed data defined for table: ${table}`);
        }

        if (config.truncate && this.truncateFn) {
            await this.truncateFn(table);
        }

        await this.insertFn(table, config.data);
    }

    /**
     * Seed all defined tables
     */
    async seedAll(): Promise<void> {
        for (const [table] of this.seeders) {
            await this.seed(table);
        }
    }

    /**
     * Truncate all seeded tables
     */
    async truncateAll(): Promise<void> {
        if (!this.truncateFn) {
            throw new Error('Truncate function not configured');
        }

        for (const [table] of this.seeders) {
            await this.truncateFn(table);
        }
    }
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Wait for a condition to be true
 */
export async function waitFor(
    condition: () => boolean | Promise<boolean>,
    options: { timeout?: number; interval?: number } = {}
): Promise<void> {
    const timeout = options.timeout ?? 5000;
    const interval = options.interval ?? 100;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        if (await condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Retry a function until it succeeds
 */
export async function retry<T>(
    fn: () => Promise<T>,
    options: { attempts?: number; delay?: number; backoff?: boolean } = {}
): Promise<T> {
    const attempts = options.attempts ?? 3;
    const delay = options.delay ?? 100;
    const backoff = options.backoff ?? false;

    let lastError: Error | undefined;

    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            if (i < attempts - 1) {
                const waitTime = backoff ? delay * Math.pow(2, i) : delay;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    throw lastError;
}

/**
 * Create a spy on an object method
 */
export function spyOn<T extends object, K extends keyof T>(
    obj: T,
    method: K
): { calls: any[][]; restore: () => void } {
    const original = obj[method];
    const calls: any[][] = [];

    (obj as any)[method] = (...args: any[]) => {
        calls.push(args);
        if (typeof original === 'function') {
            return original.apply(obj, args);
        }
    };

    return {
        calls,
        restore: () => {
            (obj as any)[method] = original;
        }
    };
}

/**
 * Create test request helper (compatible with common test frameworks)
 */
export function createTestRequest(app: Application) {
    const client = new TestClient(app);

    return {
        async close() {
            await client.stop();
        },

        get(path: string) {
            return new RequestBuilder(client, 'GET', path);
        },

        post(path: string) {
            return new RequestBuilder(client, 'POST', path);
        },

        put(path: string) {
            return new RequestBuilder(client, 'PUT', path);
        },

        patch(path: string) {
            return new RequestBuilder(client, 'PATCH', path);
        },

        delete(path: string) {
            return new RequestBuilder(client, 'DELETE', path);
        }
    };
}

class RequestBuilder {
    private client: TestClient;
    private method: string;
    private path: string;
    private options: TestRequestOptions = {};
    private expectedStatus?: number;

    constructor(client: TestClient, method: string, path: string) {
        this.client = client;
        this.method = method;
        this.path = path;
    }

    set(key: string, value: string): this {
        this.options.headers = { ...this.options.headers, [key]: value };
        return this;
    }

    auth(token: string): this {
        return this.set('Authorization', `Bearer ${token}`);
    }

    send(body: any): this {
        this.options.body = body;
        return this;
    }

    query(params: Record<string, string | number | boolean>): this {
        this.options.query = params;
        return this;
    }

    timeout(ms: number): this {
        this.options.timeout = ms;
        return this;
    }

    expect(status: number): this {
        this.expectedStatus = status;
        return this;
    }

    async then<T>(
        resolve: (value: TestResponse) => T | PromiseLike<T>,
        reject?: (reason: any) => any
    ): Promise<T> {
        try {
            const response = await this.client.request(this.method, this.path, this.options);

            if (this.expectedStatus !== undefined && response.status !== this.expectedStatus) {
                throw new Error(
                    `Expected status ${this.expectedStatus} but got ${response.status}`
                );
            }

            return resolve(response);
        } catch (error) {
            if (reject) {
                return reject(error);
            }
            throw error;
        }
    }
}


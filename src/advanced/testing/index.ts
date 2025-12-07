/**
 * Test Framework Integration
 * Provides seamless integration with Jest, Vitest, and Node test runner
 */

import { Application } from '../../core/application';
import { TestClient, createTestSuite, TestSuiteOptions } from './harness';
import { MockDatabase, MockFetch, MockTimers, mockDb, mockFetch, mockTimers } from './mock';

/**
 * Detected test framework
 */
export type TestFramework = 'jest' | 'vitest' | 'node' | 'unknown';

/**
 * Detect which test framework is being used
 */
export function detectTestFramework(): TestFramework {
    // Check for Jest
    if (typeof (globalThis as any).jest !== 'undefined') {
        return 'jest';
    }

    // Check for Vitest
    if (typeof (globalThis as any).__vitest__ !== 'undefined') {
        return 'vitest';
    }

    // Check for Node test runner
    if (typeof (globalThis as any).describe === 'function' && 
        typeof (globalThis as any).test === 'function' &&
        typeof (globalThis as any).it === 'function') {
        return 'node';
    }

    return 'unknown';
}

/**
 * Test suite configuration for framework integration
 */
export interface NexusTestConfig<T = void> {
    /**
     * Nexus application instance
     */
    app: Application;

    /**
     * Setup function called before all tests
     */
    setup?: () => Promise<T>;

    /**
     * Teardown function called after all tests
     */
    teardown?: (context: T) => Promise<void>;

    /**
     * Reset function called before each test
     */
    reset?: (context: T) => Promise<void>;

    /**
     * Enable mock database
     * @default true
     */
    mockDatabase?: boolean;

    /**
     * Enable mock fetch
     * @default false
     */
    mockFetch?: boolean;

    /**
     * Enable mock timers
     * @default false
     */
    mockTimers?: boolean;

    /**
     * Auto-cleanup after each test
     * @default true
     */
    autoCleanup?: boolean;
}

/**
 * Test context available in tests
 */
export interface NexusTestContext<T = void> {
    /**
     * HTTP test client
     */
    client: TestClient;

    /**
     * Base URL of the test server
     */
    baseUrl: string;

    /**
     * Mock database instance
     */
    db: MockDatabase;

    /**
     * Mock fetch instance
     */
    fetch: MockFetch;

    /**
     * Mock timers instance
     */
    timers: MockTimers;

    /**
     * Custom context from setup
     */
    context: T;
}

/**
 * Create a Nexus test suite with automatic setup/teardown
 * 
 * @example Jest/Vitest
 * ```typescript
 * import { createNexusTest } from 'nexus/testing';
 * import { app } from './app';
 * 
 * const { beforeAll, afterAll, beforeEach, getContext } = createNexusTest({
 *   app,
 *   mockDatabase: true,
 *   setup: async () => {
 *     // Seed test data
 *     return { adminToken: 'test-admin-token' };
 *   }
 * });
 * 
 * describe('Users API', () => {
 *   beforeAll();
 *   afterAll();
 *   beforeEach();
 * 
 *   test('should list users', async () => {
 *     const { client, context } = getContext();
 *     
 *     const res = await client.get('/users', {
 *       headers: { Authorization: `Bearer ${context.adminToken}` }
 *     });
 *     
 *     expect(res.status).toBe(200);
 *     expect(res.json().users).toBeArray();
 *   });
 * });
 * ```
 */
export function createNexusTest<T = void>(config: NexusTestConfig<T>) {
    const {
        app,
        setup,
        teardown,
        reset,
        mockDatabase = true,
        mockFetch: enableMockFetch = false,
        mockTimers: enableMockTimers = false,
        autoCleanup = true
    } = config;

    const client = new TestClient(app);
    let setupContext: T = undefined as T;
    let baseUrl = '';

    // Context getter
    const getContext = (): NexusTestContext<T> => ({
        client,
        baseUrl,
        db: mockDb,
        fetch: mockFetch,
        timers: mockTimers,
        context: setupContext
    });

    return {
        /**
         * Call this in beforeAll/before hook
         */
        beforeAll: () => async () => {
            // Start test server
            await client.start();
            baseUrl = (client as any).baseUrl;

            // Install mocks
            if (enableMockFetch) {
                mockFetch.install();
            }
            if (enableMockTimers) {
                mockTimers.install();
            }

            // Run custom setup
            if (setup) {
                setupContext = await setup();
            }
        },

        /**
         * Call this in afterAll/after hook
         */
        afterAll: () => async () => {
            // Stop test server
            await client.stop();

            // Run custom teardown
            if (teardown) {
                await teardown(setupContext);
            }

            // Restore mocks
            if (enableMockFetch) {
                mockFetch.restore();
            }
            if (enableMockTimers) {
                mockTimers.restore();
            }
        },

        /**
         * Call this in beforeEach hook
         */
        beforeEach: () => async () => {
            // Reset mocks
            if (autoCleanup) {
                if (mockDatabase) {
                    mockDb.clear();
                }
                if (enableMockFetch) {
                    mockFetch.reset();
                }
            }

            // Run custom reset
            if (reset) {
                await reset(setupContext);
            }
        },

        /**
         * Call this in afterEach hook (optional)
         */
        afterEach: () => async () => {
            // Additional cleanup if needed
        },

        /**
         * Get current test context
         */
        getContext,

        /**
         * Get the test client directly
         */
        getClient: () => client
    };
}

/**
 * Assertion helpers for Nexus testing
 */
export const assertions = {
    /**
     * Assert response status
     */
    expectStatus(response: { status: number }, expected: number): void {
        if (response.status !== expected) {
            throw new Error(`Expected status ${expected} but got ${response.status}`);
        }
    },

    /**
     * Assert response is JSON
     */
    expectJson(response: { body: string; headers: Record<string, any> }): any {
        const contentType = response.headers['content-type'];
        if (!contentType?.includes('application/json')) {
            throw new Error(`Expected JSON content-type but got ${contentType}`);
        }
        return JSON.parse(response.body);
    },

    /**
     * Assert response contains key
     */
    expectBodyHas(response: { body: string }, key: string): void {
        const body = JSON.parse(response.body);
        if (!(key in body)) {
            throw new Error(`Expected body to have key "${key}"`);
        }
    },

    /**
     * Assert response body equals
     */
    expectBodyEquals(response: { body: string }, expected: any): void {
        const body = JSON.parse(response.body);
        const actual = JSON.stringify(body);
        const exp = JSON.stringify(expected);
        if (actual !== exp) {
            throw new Error(`Body mismatch:\nExpected: ${exp}\nActual: ${actual}`);
        }
    },

    /**
     * Assert header exists
     */
    expectHeader(response: { headers: Record<string, any> }, name: string, value?: string): void {
        const headerValue = response.headers[name.toLowerCase()];
        if (!headerValue) {
            throw new Error(`Expected header "${name}" to exist`);
        }
        if (value !== undefined && headerValue !== value) {
            throw new Error(`Expected header "${name}" to be "${value}" but got "${headerValue}"`);
        }
    },

    /**
     * Assert response time
     */
    expectFast(response: { duration: number }, maxMs: number = 100): void {
        if (response.duration > maxMs) {
            throw new Error(`Expected response within ${maxMs}ms but took ${response.duration}ms`);
        }
    }
};

/**
 * Create authenticated test client
 * 
 * @example
 * ```typescript
 * const adminClient = createAuthenticatedClient(app, {
 *   token: 'admin-jwt-token',
 *   headers: { 'X-Tenant-ID': 'test-tenant' }
 * });
 * 
 * const res = await adminClient.get('/admin/users');
 * ```
 */
export function createAuthenticatedClient(
    app: Application,
    auth: {
        token?: string;
        headers?: Record<string, string>;
        user?: any;
    }
): TestClient {
    const client = new TestClient(app);

    if (auth.token) {
        client.authenticate(auth.token);
    }

    if (auth.headers) {
        client.setDefaultHeaders(auth.headers);
    }

    return client;
}

/**
 * Wait for condition with timeout
 */
export async function waitForCondition(
    condition: () => boolean | Promise<boolean>,
    options: { timeout?: number; interval?: number; message?: string } = {}
): Promise<void> {
    const { timeout = 5000, interval = 50, message = 'Condition not met' } = options;
    const start = Date.now();

    while (Date.now() - start < timeout) {
        if (await condition()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error(`${message} (timeout: ${timeout}ms)`);
}

/**
 * Retry function with exponential backoff
 */
export async function retryAsync<T>(
    fn: () => Promise<T>,
    options: { maxAttempts?: number; delay?: number; backoff?: boolean } = {}
): Promise<T> {
    const { maxAttempts = 3, delay = 100, backoff = true } = options;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxAttempts) {
                const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    throw lastError;
}

/**
 * Measure execution time of async function
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
}

// Re-export everything
export * from './harness';
export * from './mock';
export * from './factory';
export * from './load-test';
export * from './mock-server';

/**
 * Load testing utilities for stress testing APIs
 */

import { request as httpRequest, RequestOptions, IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';
import { EventEmitter } from 'events';

export interface LoadTestScenario {
    name: string;
    executor: 'constant-vus' | 'ramping-vus' | 'constant-rate' | 'ramping-rate';
    vus?: number;
    duration: string;
    startVUs?: number;
    stages?: Array<{ duration: string; target: number }>;
    rate?: number;
    exec: string;
}

export interface LoadTestThresholds {
    [metric: string]: string[];
}

export interface LoadTestOptions {
    baseUrl: string;
    duration?: string;
    vus?: number;
    scenarios?: Record<string, LoadTestScenario>;
    thresholds?: LoadTestThresholds;
    setupTimeout?: number;
    teardownTimeout?: number;
}

export interface LoadTestResult {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    duration: number;
    requestsPerSecond: number;
    latency: {
        min: number;
        max: number;
        avg: number;
        p50: number;
        p90: number;
        p95: number;
        p99: number;
    };
    errorRate: number;
    thresholdsPassed: boolean;
    thresholdResults: Record<string, { passed: boolean; value: number; threshold: string }>;
    errors: Array<{ message: string; count: number }>;
}

export interface VirtualUser {
    id: number;
    iteration: number;
    data: Record<string, any>;
}

type TestFunction = (vu: VirtualUser, http: HttpClient) => Promise<void>;

/**
 * Simple HTTP client for load testing
 */
export class HttpClient {
    private baseUrl: string;
    private defaultHeaders: Record<string, string> = {};
    private latencies: number[] = [];
    private errors: Map<string, number> = new Map();
    private successCount = 0;
    private failCount = 0;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    setHeader(key: string, value: string): void {
        this.defaultHeaders[key] = value;
    }

    async get(path: string, options: { headers?: Record<string, string>; timeout?: number } = {}): Promise<HttpResponse> {
        return this.request('GET', path, undefined, options);
    }

    async post(path: string, body?: any, options: { headers?: Record<string, string>; timeout?: number } = {}): Promise<HttpResponse> {
        return this.request('POST', path, body, options);
    }

    async put(path: string, body?: any, options: { headers?: Record<string, string>; timeout?: number } = {}): Promise<HttpResponse> {
        return this.request('PUT', path, body, options);
    }

    async delete(path: string, options: { headers?: Record<string, string>; timeout?: number } = {}): Promise<HttpResponse> {
        return this.request('DELETE', path, undefined, options);
    }

    private async request(
        method: string,
        path: string,
        body?: any,
        options: { headers?: Record<string, string>; timeout?: number } = {}
    ): Promise<HttpResponse> {
        const url = new URL(path, this.baseUrl);
        const isHttps = url.protocol === 'https:';
        const requester = isHttps ? httpsRequest : httpRequest;

        const bodyString = body ? JSON.stringify(body) : undefined;
        const headers: Record<string, string> = {
            ...this.defaultHeaders,
            ...options.headers
        };

        if (bodyString) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = Buffer.byteLength(bodyString).toString();
        }

        const requestOptions: RequestOptions = {
            method,
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            headers,
            timeout: options.timeout ?? 30000
        };

        const start = process.hrtime.bigint();

        try {
            const response = await new Promise<HttpResponse>((resolve, reject) => {
                const req = requester(requestOptions, (res: IncomingMessage) => {
                    const chunks: Buffer[] = [];
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => {
                        const latency = Number(process.hrtime.bigint() - start) / 1e6;
                        this.latencies.push(latency);

                        const responseBody = Buffer.concat(chunks).toString('utf-8');
                        const status = res.statusCode ?? 0;

                        if (status >= 400) {
                            this.failCount++;
                            const errorKey = `HTTP ${status}`;
                            this.errors.set(errorKey, (this.errors.get(errorKey) ?? 0) + 1);
                        } else {
                            this.successCount++;
                        }

                        resolve({
                            status,
                            headers: res.headers as Record<string, string | string[]>,
                            body: responseBody,
                            latency
                        });
                    });
                });

                req.on('error', (error) => {
                    this.failCount++;
                    const errorKey = error.message;
                    this.errors.set(errorKey, (this.errors.get(errorKey) ?? 0) + 1);
                    reject(error);
                });

                req.on('timeout', () => {
                    req.destroy();
                    this.failCount++;
                    const errorKey = 'Request timeout';
                    this.errors.set(errorKey, (this.errors.get(errorKey) ?? 0) + 1);
                    reject(new Error('Request timeout'));
                });

                if (bodyString) {
                    req.write(bodyString);
                }
                req.end();
            });

            return response;
        } catch (error) {
            throw error;
        }
    }

    getStats() {
        return {
            latencies: this.latencies,
            errors: this.errors,
            successCount: this.successCount,
            failCount: this.failCount
        };
    }

    reset() {
        this.latencies = [];
        this.errors.clear();
        this.successCount = 0;
        this.failCount = 0;
    }
}

export interface HttpResponse {
    status: number;
    headers: Record<string, string | string[]>;
    body: string;
    latency: number;
}

/**
 * Parse duration string to milliseconds
 */
function parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(s|m|h)$/);
    if (!match) {
        throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        default: throw new Error(`Unknown duration unit: ${unit}`);
    }
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}

/**
 * Load test runner
 */
export class LoadTestRunner extends EventEmitter {
    private options: LoadTestOptions;
    private tests: Map<string, TestFunction> = new Map();
    private running = false;
    private allLatencies: number[] = [];
    private allErrors: Map<string, number> = new Map();
    private totalSuccess = 0;
    private totalFail = 0;

    constructor(options: LoadTestOptions) {
        super();
        this.options = options;
    }

    /**
     * Register a test function
     */
    test(name: string, fn: TestFunction): this {
        this.tests.set(name, fn);
        return this;
    }

    /**
     * Run the load test
     */
    async run(): Promise<LoadTestResult> {
        this.running = true;
        this.allLatencies = [];
        this.allErrors.clear();
        this.totalSuccess = 0;
        this.totalFail = 0;

        const startTime = Date.now();

        // Simple mode: just VUs and duration
        if (!this.options.scenarios) {
            const vus = this.options.vus ?? 1;
            const duration = parseDuration(this.options.duration ?? '30s');

            const defaultTest = this.tests.get('default') || this.tests.values().next().value;
            if (!defaultTest) {
                throw new Error('No test function registered');
            }

            await this.runConstantVUs(vus, duration, defaultTest);
        } else {
            // Scenarios mode
            const scenarioPromises: Promise<void>[] = [];

            for (const [_name, scenario] of Object.entries(this.options.scenarios)) {
                const testFn = this.tests.get(scenario.exec);
                if (!testFn) {
                    throw new Error(`Test function not found: ${scenario.exec}`);
                }

                switch (scenario.executor) {
                    case 'constant-vus':
                        scenarioPromises.push(
                            this.runConstantVUs(scenario.vus ?? 1, parseDuration(scenario.duration), testFn)
                        );
                        break;
                    case 'ramping-vus':
                        if (scenario.stages) {
                            scenarioPromises.push(
                                this.runRampingVUs(scenario.startVUs ?? 0, scenario.stages, testFn)
                            );
                        }
                        break;
                    case 'constant-rate':
                        scenarioPromises.push(
                            this.runConstantRate(scenario.rate ?? 1, parseDuration(scenario.duration), testFn)
                        );
                        break;
                }
            }

            await Promise.all(scenarioPromises);
        }

        this.running = false;
        const totalDuration = Date.now() - startTime;

        return this.calculateResults(totalDuration);
    }

    /**
     * Stop the test
     */
    stop(): void {
        this.running = false;
    }

    private async runConstantVUs(vus: number, durationMs: number, testFn: TestFunction): Promise<void> {
        const endTime = Date.now() + durationMs;
        const vuPromises: Promise<void>[] = [];

        for (let i = 0; i < vus; i++) {
            vuPromises.push(this.runVU(i, endTime, testFn));
        }

        await Promise.all(vuPromises);
    }

    private async runRampingVUs(
        startVUs: number,
        stages: Array<{ duration: string; target: number }>,
        testFn: TestFunction
    ): Promise<void> {
        let currentVUs = startVUs;
        const activeVUs: Map<number, { stop: boolean }> = new Map();
        let vuIdCounter = 0;

        for (const stage of stages) {
            const stageDuration = parseDuration(stage.duration);
            const targetVUs = stage.target;
            const stageStart = Date.now();
            const stageEnd = stageStart + stageDuration;

            // Adjust VUs linearly over the stage
            const vuDiff = targetVUs - currentVUs;
            const interval = stageDuration / Math.abs(vuDiff || 1);

            while (Date.now() < stageEnd && this.running) {
                const elapsed = Date.now() - stageStart;
                const progress = elapsed / stageDuration;
                const desiredVUs = Math.round(currentVUs + vuDiff * progress);

                // Add or remove VUs
                while (activeVUs.size < desiredVUs && this.running) {
                    const id = vuIdCounter++;
                    const control = { stop: false };
                    activeVUs.set(id, control);
                    this.runVU(id, stageEnd, testFn, control);
                }

                while (activeVUs.size > desiredVUs) {
                    const entry = activeVUs.entries().next().value;
                    if (!entry) continue;
                    const [id, control] = entry;
                    control.stop = true;
                    activeVUs.delete(id);
                }

                await this.sleep(Math.min(interval, 1000));
            }

            currentVUs = targetVUs;
        }

        // Stop all remaining VUs
        for (const control of activeVUs.values()) {
            control.stop = true;
        }
    }

    private async runConstantRate(rate: number, durationMs: number, testFn: TestFunction): Promise<void> {
        const endTime = Date.now() + durationMs;
        const interval = 1000 / rate;
        let vuId = 0;

        while (Date.now() < endTime && this.running) {
            const http = new HttpClient(this.options.baseUrl);
            const vu: VirtualUser = { id: vuId++, iteration: 0, data: {} };

            // Fire and forget
            testFn(vu, http)
                .then(() => this.collectStats(http))
                .catch(() => this.collectStats(http));

            await this.sleep(interval);
        }
    }

    private async runVU(
        id: number,
        endTime: number,
        testFn: TestFunction,
        control?: { stop: boolean }
    ): Promise<void> {
        const http = new HttpClient(this.options.baseUrl);
        const vu: VirtualUser = { id, iteration: 0, data: {} };

        while (Date.now() < endTime && this.running && !control?.stop) {
            try {
                await testFn(vu, http);
            } catch (error) {
                // Errors are already tracked in HttpClient
            }
            vu.iteration++;
        }

        this.collectStats(http);
    }

    private collectStats(http: HttpClient): void {
        const stats = http.getStats();
        this.allLatencies.push(...stats.latencies);
        this.totalSuccess += stats.successCount;
        this.totalFail += stats.failCount;

        for (const [error, count] of stats.errors) {
            this.allErrors.set(error, (this.allErrors.get(error) ?? 0) + count);
        }
    }

    private calculateResults(durationMs: number): LoadTestResult {
        const sorted = [...this.allLatencies].sort((a, b) => a - b);
        const total = this.totalSuccess + this.totalFail;

        const latencyStats = {
            min: sorted[0] ?? 0,
            max: sorted[sorted.length - 1] ?? 0,
            avg: sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
            p50: percentile(sorted, 50),
            p90: percentile(sorted, 90),
            p95: percentile(sorted, 95),
            p99: percentile(sorted, 99)
        };

        const thresholdResults: Record<string, { passed: boolean; value: number; threshold: string }> = {};
        let allThresholdsPassed = true;

        if (this.options.thresholds) {
            for (const [metric, conditions] of Object.entries(this.options.thresholds)) {
                for (const condition of conditions) {
                    const { passed, value } = this.evaluateThreshold(metric, condition, {
                        latency: latencyStats,
                        errorRate: total > 0 ? this.totalFail / total : 0,
                        requestsPerSecond: total / (durationMs / 1000)
                    });

                    thresholdResults[`${metric}: ${condition}`] = { passed, value, threshold: condition };
                    if (!passed) {
                        allThresholdsPassed = false;
                    }
                }
            }
        }

        return {
            totalRequests: total,
            successfulRequests: this.totalSuccess,
            failedRequests: this.totalFail,
            duration: durationMs,
            requestsPerSecond: total / (durationMs / 1000),
            latency: latencyStats,
            errorRate: total > 0 ? this.totalFail / total : 0,
            thresholdsPassed: allThresholdsPassed,
            thresholdResults,
            errors: Array.from(this.allErrors.entries()).map(([message, count]) => ({ message, count }))
        };
    }

    private evaluateThreshold(
        metric: string,
        condition: string,
        stats: { latency: LoadTestResult['latency']; errorRate: number; requestsPerSecond: number }
    ): { passed: boolean; value: number } {
        // Parse condition like "p(95)<500" or "rate<0.01" or "rate>100"
        const match = condition.match(/^(p\((\d+)\)|rate|avg|min|max)\s*([<>]=?)\s*(\d+(?:\.\d+)?)$/);
        if (!match) {
            return { passed: true, value: 0 };
        }

        const [, metricType, percentileValue, operator, thresholdStr] = match;
        const threshold = parseFloat(thresholdStr);
        let value: number;

        if (metric === 'http_req_duration') {
            if (metricType.startsWith('p(')) {
                const p = parseInt(percentileValue, 10);
                switch (p) {
                    case 50: value = stats.latency.p50; break;
                    case 90: value = stats.latency.p90; break;
                    case 95: value = stats.latency.p95; break;
                    case 99: value = stats.latency.p99; break;
                    default: value = stats.latency.avg;
                }
            } else if (metricType === 'avg') {
                value = stats.latency.avg;
            } else if (metricType === 'min') {
                value = stats.latency.min;
            } else if (metricType === 'max') {
                value = stats.latency.max;
            } else {
                value = stats.latency.avg;
            }
        } else if (metric === 'http_req_failed') {
            value = stats.errorRate;
        } else if (metric === 'http_reqs') {
            value = stats.requestsPerSecond;
        } else {
            value = 0;
        }

        let passed: boolean;
        switch (operator) {
            case '<': passed = value < threshold; break;
            case '<=': passed = value <= threshold; break;
            case '>': passed = value > threshold; break;
            case '>=': passed = value >= threshold; break;
            default: passed = true;
        }

        return { passed, value };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * Create a load test
 */
export function createLoadTest(options: LoadTestOptions): LoadTestRunner {
    return new LoadTestRunner(options);
}

/**
 * Helper to format load test results
 */
export function formatLoadTestResults(results: LoadTestResult): string {
    const lines: string[] = [
        '',
        '═══════════════════════════════════════════════════════════════',
        '                        LOAD TEST RESULTS                       ',
        '═══════════════════════════════════════════════════════════════',
        '',
        '  Summary',
        '  ───────────────────────────────────────────────────────────',
        `  Total Requests:      ${results.totalRequests}`,
        `  Successful:          ${results.successfulRequests}`,
        `  Failed:              ${results.failedRequests}`,
        `  Duration:            ${(results.duration / 1000).toFixed(2)}s`,
        `  Requests/sec:        ${results.requestsPerSecond.toFixed(2)}`,
        `  Error Rate:          ${(results.errorRate * 100).toFixed(2)}%`,
        '',
        '  Latency',
        '  ───────────────────────────────────────────────────────────',
        `  Min:                 ${results.latency.min.toFixed(2)}ms`,
        `  Max:                 ${results.latency.max.toFixed(2)}ms`,
        `  Avg:                 ${results.latency.avg.toFixed(2)}ms`,
        `  P50 (median):        ${results.latency.p50.toFixed(2)}ms`,
        `  P90:                 ${results.latency.p90.toFixed(2)}ms`,
        `  P95:                 ${results.latency.p95.toFixed(2)}ms`,
        `  P99:                 ${results.latency.p99.toFixed(2)}ms`,
        ''
    ];

    if (Object.keys(results.thresholdResults).length > 0) {
        lines.push('  Thresholds');
        lines.push('  ───────────────────────────────────────────────────────────');
        for (const [name, result] of Object.entries(results.thresholdResults)) {
            const status = result.passed ? '✓' : '✗';
            lines.push(`  ${status} ${name} (actual: ${result.value.toFixed(2)})`);
        }
        lines.push('');
        lines.push(`  Overall: ${results.thresholdsPassed ? '✓ PASSED' : '✗ FAILED'}`);
        lines.push('');
    }

    if (results.errors.length > 0) {
        lines.push('  Errors');
        lines.push('  ───────────────────────────────────────────────────────────');
        for (const error of results.errors) {
            lines.push(`  ${error.message}: ${error.count}`);
        }
        lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');

    return lines.join('\n');
}

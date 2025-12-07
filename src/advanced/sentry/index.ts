/**
 * Sentry Integration for Nexus Framework
 * 
 * Built-in error tracking, performance monitoring, and session replay
 * with seamless integration to Sentry.io
 */

import { Context, Middleware, Response } from '../../core/types';
import { randomUUID } from 'crypto';
import { APMOptions, MemoryLeakStats, MemorySnapshot, ParsedDSN, SentryBreadcrumb, SentryEvent, SentryMiddlewareOptions, SentryOptions, SentrySpan, SentryStackFrame, SentryTransaction, SentryUser, SeverityLevel, SlowQueryRecord } from './types';


// ============================================
// APM Manager (Integrated into Sentry)
// ============================================

/**
 * Built-in APM (Application Performance Monitoring)
 * Automatically enabled when Sentry is initialized
 */
class APMIntegration {
    private options: Required<APMOptions>;
    private slowQueries: SlowQueryRecord[] = [];
    private memorySnapshots: MemorySnapshot[] = [];
    private memoryCheckInterval?: NodeJS.Timeout;
    private sentryClient?: SentryClient;

    constructor(options: APMOptions = {}, sentryClient?: SentryClient) {
        this.sentryClient = sentryClient;
        this.options = {
            enabled: options.enabled ?? true,
            slowQueryThreshold: options.slowQueryThreshold ?? 1000,
            maxSlowQueries: options.maxSlowQueries ?? 100,
            memoryLeakDetection: {
                enabled: options.memoryLeakDetection?.enabled ?? true,
                interval: options.memoryLeakDetection?.interval ?? 60000,
                growthThreshold: options.memoryLeakDetection?.growthThreshold ?? 0.5,
                maxSnapshots: options.memoryLeakDetection?.maxSnapshots ?? 60
            },
            onMemoryLeak: options.onMemoryLeak,
            onSlowQuery: options.onSlowQuery
        };

        if (this.options.enabled && this.options.memoryLeakDetection.enabled) {
            this.startMemoryMonitoring();
        }
    }

    /**
     * Record a database/external query
     * Automatically reports slow queries to Sentry as breadcrumbs
     */
    recordQuery(query: string, durationMs: number, metadata?: Record<string, any>): void {
        if (!this.options.enabled) return;

        const threshold = this.options.slowQueryThreshold;
        if (durationMs >= threshold) {
            const record: SlowQueryRecord = {
                query: query.slice(0, 500), // Truncate long queries
                duration: durationMs,
                timestamp: Date.now()
            };

            this.slowQueries.push(record);

            // Keep limited slow queries
            if (this.slowQueries.length > this.options.maxSlowQueries) {
                this.slowQueries.shift();
            }

            // Report to Sentry as breadcrumb
            if (this.sentryClient) {
                this.sentryClient.addBreadcrumb({
                    type: 'query',
                    category: 'db.query',
                    message: `Slow query: ${query.slice(0, 100)}...`,
                    data: {
                        duration_ms: durationMs,
                        threshold_ms: threshold,
                        ...metadata
                    },
                    level: durationMs > threshold * 2 ? 'warning' : 'info'
                });
            }

            // Callback
            this.options.onSlowQuery?.(record);
        }
    }

    /**
     * Get all recorded slow queries
     */
    getSlowQueries(): SlowQueryRecord[] {
        return [...this.slowQueries];
    }

    /**
     * Clear slow query history
     */
    clearSlowQueries(): void {
        this.slowQueries = [];
    }

    private startMemoryMonitoring(): void {
        const { interval, maxSnapshots } = this.options.memoryLeakDetection;

        this.memoryCheckInterval = setInterval(() => {
            const usage = process.memoryUsage();
            this.memorySnapshots.push({
                timestamp: Date.now(),
                heapUsed: usage.heapUsed,
                heapTotal: usage.heapTotal
            });

            // Keep limited snapshots
            if (this.memorySnapshots.length > maxSnapshots) {
                this.memorySnapshots.shift();
            }

            // Check for potential memory leak
            this.checkMemoryLeak();
        }, interval);
    }

    private checkMemoryLeak(): void {
        if (this.memorySnapshots.length < 10) return;

        const { growthThreshold } = this.options.memoryLeakDetection;
        const recent = this.memorySnapshots.slice(-10);
        const oldest = recent[0].heapUsed;
        const newest = recent[recent.length - 1].heapUsed;
        const growth = (newest - oldest) / oldest;

        // Alert if memory grew more than threshold in the monitoring window
        if (growth > growthThreshold) {
            const stats: MemoryLeakStats = {
                growth,
                growthPercent: `${(growth * 100).toFixed(1)}%`,
                fromMB: `${(oldest / 1024 / 1024).toFixed(1)}MB`,
                toMB: `${(newest / 1024 / 1024).toFixed(1)}MB`,
                snapshots: recent
            };

            // Report to Sentry
            if (this.sentryClient) {
                this.sentryClient.captureMessage(
                    `Potential memory leak detected: ${stats.growthPercent} growth`,
                    {
                        level: 'warning',
                        tags: { type: 'memory_leak' },
                        extra: stats
                    }
                );

                this.sentryClient.addBreadcrumb({
                    type: 'debug',
                    category: 'memory',
                    message: `Memory grew ${stats.growthPercent}`,
                    data: {
                        from: stats.fromMB,
                        to: stats.toMB
                    },
                    level: 'warning'
                });
            }

            // Callback
            this.options.onMemoryLeak?.(stats);
        }
    }

    /**
     * Get current memory statistics
     */
    getMemoryStats(): {
        current: {
            heapUsed: number;
            heapTotal: number;
            external: number;
            rss: number;
        };
        history: MemorySnapshot[];
    } {
        const current = process.memoryUsage();
        return {
            current: {
                heapUsed: current.heapUsed,
                heapTotal: current.heapTotal,
                external: current.external,
                rss: current.rss
            },
            history: [...this.memorySnapshots]
        };
    }

    /**
     * Stop APM monitoring
     */
    stop(): void {
        if (this.memoryCheckInterval) {
            clearInterval(this.memoryCheckInterval);
            this.memoryCheckInterval = undefined;
        }
    }
}



// ============================================
// Sentry Client
// ============================================

/**
 * Nexus Sentry Client
 * Lightweight, built-in Sentry integration with APM
 */
export class SentryClient {
    private options: Required<Omit<SentryOptions, 'apm'>> & { apm: APMOptions };
    private dsn: ParsedDSN;
    private breadcrumbs: SentryBreadcrumb[] = [];
    private user?: SentryUser;
    private globalTags: Record<string, string> = {};
    private globalExtra: Record<string, any> = {};
    private activeTransactions: Map<string, SentryTransaction> = new Map();
    private isEnabled: boolean = true;
    private apm: APMIntegration;

    constructor(options: SentryOptions) {
        // Parse and validate DSN
        this.dsn = this.parseDSN(options.dsn);

        this.options = {
            dsn: options.dsn,
            environment: options.environment ?? process.env.NODE_ENV ?? 'production',
            release: options.release ?? process.env.npm_package_version ?? 'unknown',
            serverName: options.serverName ?? this.getServerName(),
            sampleRate: options.sampleRate ?? 1.0,
            tracesSampleRate: options.tracesSampleRate ?? 0.1,
            enableTracing: options.enableTracing ?? true,
            maxBreadcrumbs: options.maxBreadcrumbs ?? 100,
            debug: options.debug ?? false,
            attachStacktrace: options.attachStacktrace ?? false,
            sendDefaultPii: options.sendDefaultPii ?? false,
            beforeSend: options.beforeSend ?? ((event) => event),
            beforeSendTransaction: options.beforeSendTransaction ?? ((tx) => tx),
            tags: options.tags ?? {},
            extra: options.extra ?? {},
            ignorePaths: options.ignorePaths ?? [],
            ignoreErrors: options.ignoreErrors ?? [],
            timeout: options.timeout ?? 5000,
            integrations: {
                http: options.integrations?.http ?? true,
                console: options.integrations?.console ?? false,
                unhandledRejection: options.integrations?.unhandledRejection ?? true,
                uncaughtException: options.integrations?.uncaughtException ?? true
            },
            apm: options.apm ?? {}
        };

        this.globalTags = { ...this.options.tags };
        this.globalExtra = { ...this.options.extra };

        // Initialize APM integration
        this.apm = new APMIntegration(this.options.apm, this);

        // Setup global handlers
        this.setupIntegrations();

        this.log('Sentry initialized', { environment: this.options.environment });
    }

    // ============================================
    // DSN Parsing
    // ============================================

    private parseDSN(dsn: string): ParsedDSN {
        try {
            const url = new URL(dsn);
            const pathParts = url.pathname.split('/').filter(Boolean);
            
            return {
                protocol: url.protocol.replace(':', ''),
                publicKey: url.username,
                host: url.host,
                projectId: pathParts[pathParts.length - 1]
            };
        } catch {
            throw new Error(`Invalid Sentry DSN: ${dsn}`);
        }
    }

    private getEnvelopeEndpoint(): string {
        return `${this.dsn.protocol}://${this.dsn.host}/api/${this.dsn.projectId}/envelope/`;
    }

    private getServerName(): string {
        try {
            return require('os').hostname();
        } catch {
            return 'unknown';
        }
    }

    // ============================================
    // Integrations
    // ============================================

    private setupIntegrations(): void {
        if (this.options.integrations.unhandledRejection) {
            process.on('unhandledRejection', (reason) => {
                this.captureException(reason instanceof Error ? reason : new Error(String(reason)), {
                    tags: { mechanism: 'unhandledRejection' }
                });
            });
        }

        if (this.options.integrations.uncaughtException) {
            process.on('uncaughtException', (error) => {
                this.captureException(error, {
                    tags: { mechanism: 'uncaughtException' },
                    level: 'fatal'
                });
                // Allow time for the event to be sent
                setTimeout(() => process.exit(1), 2000);
            });
        }
    }

    // ============================================
    // Core Methods
    // ============================================

    /**
     * Capture an exception and send to Sentry
     */
    captureException(
        error: Error | unknown,
        options: {
            level?: SeverityLevel;
            tags?: Record<string, string>;
            extra?: Record<string, any>;
            user?: SentryUser;
            fingerprint?: string[];
            contexts?: Record<string, any>;
        } = {}
    ): string {
        if (!this.isEnabled || !this.shouldSample(this.options.sampleRate)) {
            return '';
        }

        const err = error instanceof Error ? error : new Error(String(error));
        
        // Check ignore patterns
        if (this.shouldIgnoreError(err)) {
            return '';
        }

        const eventId = this.generateEventId();
        const event = this.buildErrorEvent(err, eventId, options);

        // Apply beforeSend hook
        const processedEvent = this.options.beforeSend(event, { originalException: err });
        if (!processedEvent) {
            this.log('Event dropped by beforeSend');
            return '';
        }

        this.sendEvent(processedEvent);
        return eventId;
    }

    /**
     * Capture a message
     */
    captureMessage(
        message: string,
        options: {
            level?: SeverityLevel;
            tags?: Record<string, string>;
            extra?: Record<string, any>;
            user?: SentryUser;
            fingerprint?: string[];
        } = {}
    ): string {
        if (!this.isEnabled || !this.shouldSample(this.options.sampleRate)) {
            return '';
        }

        const eventId = this.generateEventId();
        const event: SentryEvent = {
            event_id: eventId,
            timestamp: Date.now() / 1000,
            platform: 'node',
            level: options.level ?? 'info',
            message,
            environment: this.options.environment,
            release: this.options.release,
            server_name: this.options.serverName,
            user: options.user ?? this.user,
            tags: { ...this.globalTags, ...options.tags },
            extra: { ...this.globalExtra, ...options.extra },
            breadcrumbs: [...this.breadcrumbs],
            fingerprint: options.fingerprint
        };

        const processedEvent = this.options.beforeSend(event);
        if (!processedEvent) {
            return '';
        }

        this.sendEvent(processedEvent);
        return eventId;
    }

    /**
     * Add a breadcrumb
     */
    addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
        const crumb: SentryBreadcrumb = {
            timestamp: Date.now() / 1000,
            ...breadcrumb
        };

        this.breadcrumbs.push(crumb);

        // Limit breadcrumbs
        if (this.breadcrumbs.length > this.options.maxBreadcrumbs) {
            this.breadcrumbs.shift();
        }
    }

    /**
     * Set user context
     */
    setUser(user: SentryUser | null): void {
        this.user = user ?? undefined;
    }

    /**
     * Set a global tag
     */
    setTag(key: string, value: string): void {
        this.globalTags[key] = value;
    }

    /**
     * Set multiple tags
     */
    setTags(tags: Record<string, string>): void {
        Object.assign(this.globalTags, tags);
    }

    /**
     * Set extra context
     */
    setExtra(key: string, value: any): void {
        this.globalExtra[key] = value;
    }

    /**
     * Set multiple extra values
     */
    setExtras(extras: Record<string, any>): void {
        Object.assign(this.globalExtra, extras);
    }

    /**
     * Clear breadcrumbs
     */
    clearBreadcrumbs(): void {
        this.breadcrumbs = [];
    }

    // ============================================
    // Performance Monitoring
    // ============================================

    /**
     * Start a transaction for performance monitoring
     */
    startTransaction(options: {
        name: string;
        op: string;
        tags?: Record<string, string>;
        data?: Record<string, any>;
    }): SentryTransaction | null {
        if (!this.options.enableTracing || !this.shouldSample(this.options.tracesSampleRate)) {
            return null;
        }

        const transaction: SentryTransaction = {
            trace_id: this.generateTraceId(),
            span_id: this.generateSpanId(),
            name: options.name,
            op: options.op,
            status: 'ok',
            start_timestamp: Date.now() / 1000,
            tags: options.tags,
            data: options.data,
            spans: []
        };

        this.activeTransactions.set(transaction.span_id, transaction);
        return transaction;
    }

    /**
     * Start a child span within a transaction
     */
    startSpan(
        transaction: SentryTransaction,
        options: {
            op: string;
            description?: string;
            tags?: Record<string, string>;
            data?: Record<string, any>;
        }
    ): SentrySpan {
        const span: SentrySpan = {
            trace_id: transaction.trace_id,
            span_id: this.generateSpanId(),
            parent_span_id: transaction.span_id,
            op: options.op,
            description: options.description,
            start_timestamp: Date.now() / 1000,
            tags: options.tags,
            data: options.data
        };

        transaction.spans = transaction.spans ?? [];
        transaction.spans.push(span);

        return span;
    }

    /**
     * Finish a span
     */
    finishSpan(span: SentrySpan, status?: string): void {
        span.timestamp = Date.now() / 1000;
        span.status = status ?? 'ok';
    }

    /**
     * Finish a transaction and send to Sentry
     */
    finishTransaction(transaction: SentryTransaction, status?: SentryTransaction['status']): void {
        transaction.timestamp = Date.now() / 1000;
        transaction.status = status ?? 'ok';

        this.activeTransactions.delete(transaction.span_id);

        const processedTx = this.options.beforeSendTransaction(transaction);
        if (!processedTx) {
            this.log('Transaction dropped by beforeSendTransaction');
            return;
        }

        this.sendTransaction(processedTx);
    }

    // ============================================
    // Event Building
    // ============================================

    private buildErrorEvent(
        error: Error,
        eventId: string,
        options: {
            level?: SeverityLevel;
            tags?: Record<string, string>;
            extra?: Record<string, any>;
            user?: SentryUser;
            fingerprint?: string[];
            contexts?: Record<string, any>;
        }
    ): SentryEvent {
        const stacktrace = this.parseStackTrace(error);

        return {
            event_id: eventId,
            timestamp: Date.now() / 1000,
            platform: 'node',
            level: options.level ?? 'error',
            logger: 'nexus',
            server_name: this.options.serverName,
            release: this.options.release,
            environment: this.options.environment,
            exception: {
                values: [{
                    type: error.name || 'Error',
                    value: error.message,
                    stacktrace,
                    mechanism: {
                        type: 'generic',
                        handled: true
                    }
                }]
            },
            user: options.user ?? this.user,
            tags: { ...this.globalTags, ...options.tags },
            extra: { 
                ...this.globalExtra, 
                ...options.extra,
                ...(error.cause ? { cause: String(error.cause) } : {})
            },
            contexts: {
                runtime: {
                    name: 'node',
                    version: process.version
                },
                os: {
                    name: process.platform,
                    version: process.arch
                },
                ...options.contexts
            },
            breadcrumbs: [...this.breadcrumbs],
            fingerprint: options.fingerprint
        };
    }

    private parseStackTrace(error: Error): { frames: SentryStackFrame[] } | undefined {
        if (!error.stack) return undefined;

        const lines = error.stack.split('\n').slice(1);
        const frames: SentryStackFrame[] = [];

        for (const line of lines) {
            const match = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
            if (match) {
                frames.unshift({
                    function: match[1] || '<anonymous>',
                    filename: match[2],
                    abs_path: match[2],
                    lineno: parseInt(match[3], 10),
                    colno: parseInt(match[4], 10),
                    in_app: !match[2].includes('node_modules')
                });
            }
        }

        return { frames };
    }

    // ============================================
    // HTTP Transport
    // ============================================

    private async sendEvent(event: SentryEvent): Promise<void> {
        const envelope = this.buildEnvelope(event, 'event');
        await this.sendEnvelope(envelope);
    }

    private async sendTransaction(transaction: SentryTransaction): Promise<void> {
        const envelope = this.buildTransactionEnvelope(transaction);
        await this.sendEnvelope(envelope);
    }

    private buildEnvelope(event: SentryEvent, type: 'event' | 'transaction'): string {
        const header = JSON.stringify({
            event_id: event.event_id,
            sent_at: new Date().toISOString(),
            dsn: this.options.dsn
        });

        const itemHeader = JSON.stringify({
            type,
            content_type: 'application/json'
        });

        const payload = JSON.stringify(event);

        return `${header}\n${itemHeader}\n${payload}`;
    }

    private buildTransactionEnvelope(transaction: SentryTransaction): string {
        const header = JSON.stringify({
            event_id: this.generateEventId(),
            sent_at: new Date().toISOString(),
            dsn: this.options.dsn
        });

        const itemHeader = JSON.stringify({
            type: 'transaction',
            content_type: 'application/json'
        });

        const payload = JSON.stringify({
            ...transaction,
            type: 'transaction',
            platform: 'node',
            environment: this.options.environment,
            release: this.options.release,
            server_name: this.options.serverName,
            contexts: {
                trace: {
                    trace_id: transaction.trace_id,
                    span_id: transaction.span_id,
                    parent_span_id: transaction.parent_span_id,
                    op: transaction.op
                }
            }
        });

        return `${header}\n${itemHeader}\n${payload}`;
    }

    private async sendEnvelope(envelope: string): Promise<void> {
        const endpoint = this.getEnvelopeEndpoint();

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-sentry-envelope',
                    'X-Sentry-Auth': this.buildAuthHeader()
                },
                body: envelope,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                this.log(`Failed to send event: ${response.status} ${response.statusText}`);
            } else {
                this.log('Event sent successfully');
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                this.log('Request timed out');
            } else {
                this.log(`Failed to send event: ${error.message}`);
            }
        }
    }

    private buildAuthHeader(): string {
        return `Sentry sentry_version=7,sentry_client=nexus-sentry/1.0.0,sentry_key=${this.dsn.publicKey}`;
    }

    // ============================================
    // Helpers
    // ============================================

    private generateEventId(): string {
        return randomUUID().replace(/-/g, '');
    }

    private generateTraceId(): string {
        return randomUUID().replace(/-/g, '');
    }

    private generateSpanId(): string {
        return randomUUID().replace(/-/g, '').substring(0, 16);
    }

    private shouldSample(rate: number): boolean {
        return Math.random() < rate;
    }

    private shouldIgnoreError(error: Error): boolean {
        const message = error.message;
        
        for (const pattern of this.options.ignoreErrors) {
            if (typeof pattern === 'string') {
                if (message.includes(pattern)) return true;
            } else {
                if (pattern.test(message)) return true;
            }
        }

        return false;
    }

    private log(message: string, data?: any): void {
        if (this.options.debug) {
            console.log(`[Sentry] ${message}`, data ?? '');
        }
    }

    /**
     * Enable/disable Sentry
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
    }

    /**
     * Get current state
     */
    isInitialized(): boolean {
        return this.isEnabled;
    }

    /**
     * Flush pending events (useful before shutdown)
     */
    async flush(timeout?: number): Promise<boolean> {
        // In a more complete implementation, this would wait for pending requests
        return new Promise((resolve) => {
            setTimeout(() => resolve(true), timeout ?? 2000);
        });
    }

    /**
     * Close the client
     */
    async close(timeout?: number): Promise<boolean> {
        this.apm.stop();
        await this.flush(timeout);
        this.isEnabled = false;
        return true;
    }

    // ============================================
    // APM Methods
    // ============================================

    /**
     * Record a database/external query for slow query tracking
     * 
     * @example
     * ```typescript
     * const start = Date.now();
     * const result = await db.query('SELECT * FROM users');
     * sentry.recordQuery('SELECT * FROM users', Date.now() - start);
     * ```
     */
    recordQuery(query: string, durationMs: number, metadata?: Record<string, any>): void {
        this.apm.recordQuery(query, durationMs, metadata);
    }

    /**
     * Get all recorded slow queries
     */
    getSlowQueries(): SlowQueryRecord[] {
        return this.apm.getSlowQueries();
    }

    /**
     * Get current memory statistics
     */
    getMemoryStats() {
        return this.apm.getMemoryStats();
    }

    /**
     * Get APM integration instance for advanced usage
     */
    getAPM(): APMIntegration {
        return this.apm;
    }
}


/**
 * Create Sentry middleware for Nexus
 */
export function createSentryMiddleware(
    client: SentryClient,
    options: SentryMiddlewareOptions = {}
): Middleware {
    const {
        includeRequestBody = false,
        includeHeaders = true,
        excludeHeaders = ['authorization', 'cookie', 'x-api-key'],
        ignorePaths = [],
        extractUser = () => null,
        getTransactionName = (ctx) => `${ctx.method} ${ctx.path}`
    } = options;

    return async (ctx: Context, next, _deps) => {
        // Check if path should be ignored
        if (ignorePaths.some(p => ctx.path.startsWith(p))) {
            return next(ctx);
        }

        // Add breadcrumb for request
        client.addBreadcrumb({
            type: 'http',
            category: 'http.request',
            message: `${ctx.method} ${ctx.path}`,
            data: {
                method: ctx.method,
                url: ctx.path,
                query: ctx.query
            },
            level: 'info'
        });

        // Set user context
        const user = extractUser(ctx);
        if (user) {
            client.setUser({
                ...user,
                ip_address: ctx.headers['x-forwarded-for'] as string || ctx.headers['x-real-ip'] as string
            });
        }

        // Start transaction for performance monitoring
        const transaction = client.startTransaction({
            name: getTransactionName(ctx),
            op: 'http.server',
            tags: {
                'http.method': ctx.method,
                'http.url': ctx.path
            }
        });

        // Store transaction in context for child spans
        if (transaction) {
            ctx.sentryTransaction = transaction;
            ctx.sentryClient = client;
        }

        const startTime = Date.now();

        try {
            const response = await next(ctx);

            // Finish transaction with success
            if (transaction) {
                transaction.data = {
                    ...transaction.data,
                    'http.status_code': response.statusCode,
                    'http.response_time_ms': Date.now() - startTime
                };
                client.finishTransaction(transaction, 
                    response.statusCode >= 500 ? 'internal_error' : 'ok'
                );
            }

            // Add response breadcrumb
            client.addBreadcrumb({
                type: 'http',
                category: 'http.response',
                message: `${ctx.method} ${ctx.path} - ${response.statusCode}`,
                data: {
                    status_code: response.statusCode,
                    duration_ms: Date.now() - startTime
                },
                level: response.statusCode >= 400 ? 'warning' : 'info'
            });

            return response;

        } catch (error: any) {
            // Build request context
            const requestData: SentryEvent['request'] = {
                url: ctx.url?.toString(),
                method: ctx.method,
                query_string: ctx.url?.search
            };

            if (includeHeaders) {
                const headers: Record<string, string> = {};
                for (const [key, value] of Object.entries(ctx.headers)) {
                    if (!excludeHeaders.includes(key.toLowerCase())) {
                        headers[key] = Array.isArray(value) ? value.join(', ') : (value ?? '');
                    }
                }
                requestData.headers = headers;
            }

            if (includeRequestBody && ctx.body) {
                requestData.data = ctx.body;
            }

            // Capture the exception
            client.captureException(error, {
                tags: {
                    'http.method': ctx.method,
                    'http.url': ctx.path
                },
                extra: {
                    request: requestData,
                    params: ctx.params,
                    query: ctx.query
                },
                user: user ?? undefined
            });

            // Finish transaction with error
            if (transaction) {
                client.finishTransaction(transaction, 'internal_error');
            }

            throw error;
        }
    };
}

// ============================================
// Request Handler Error Wrapper
// ============================================

/**
 * Create an error handler that reports to Sentry
 */
export function createSentryErrorHandler(client: SentryClient) {
    return (error: Error, ctx: Context): Response => {
        client.captureException(error, {
            tags: {
                'http.method': ctx.method,
                'http.url': ctx.path
            },
            extra: {
                params: ctx.params,
                query: ctx.query
            }
        });

        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: process.env.NODE_ENV === 'development' ? error.message : undefined
            })
        };
    };
}

// ============================================
// Context Extensions
// ============================================
declare module '../../core/types' {
    interface Context {
        sentryTransaction?: SentryTransaction;
        sentryClient?: SentryClient;
    }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Create a child span in the current transaction
 */
export function withSpan<T>(
    ctx: Context,
    options: { op: string; description?: string },
    fn: () => T | Promise<T>
): T | Promise<T> {
    const client = ctx.sentryClient;
    const transaction = ctx.sentryTransaction;

    if (!client || !transaction) {
        return fn();
    }

    const span = client.startSpan(transaction, options);

    try {
        const result = fn();

        if (result instanceof Promise) {
            return result.then(
                (value) => {
                    client.finishSpan(span, 'ok');
                    return value;
                },
                (error) => {
                    client.finishSpan(span, 'internal_error');
                    throw error;
                }
            );
        }

        client.finishSpan(span, 'ok');
        return result;

    } catch (error) {
        client.finishSpan(span, 'internal_error');
        throw error;
    }
}

// ============================================
// Factory Functions
// ============================================

let globalClient: SentryClient | null = null;

/**
 * Initialize Sentry
 */
export function initSentry(options: SentryOptions): SentryClient {
    globalClient = new SentryClient(options);
    return globalClient;
}

/**
 * Get the global Sentry client
 */
export function getSentry(): SentryClient | null {
    return globalClient;
}

/**
 * Capture exception using global client
 */
export function captureException(
    error: Error | unknown,
    options?: Parameters<SentryClient['captureException']>[1]
): string {
    if (!globalClient) {
        console.warn('[Sentry] Client not initialized. Call initSentry() first.');
        return '';
    }
    return globalClient.captureException(error, options);
}

/**
 * Capture message using global client
 */
export function captureMessage(
    message: string,
    options?: Parameters<SentryClient['captureMessage']>[1]
): string {
    if (!globalClient) {
        console.warn('[Sentry] Client not initialized. Call initSentry() first.');
        return '';
    }
    return globalClient.captureMessage(message, options);
}

/**
 * Add breadcrumb using global client
 */
export function addBreadcrumb(breadcrumb: SentryBreadcrumb): void {
    globalClient?.addBreadcrumb(breadcrumb);
}

/**
 * Set user using global client
 */
export function setUser(user: SentryUser | null): void {
    globalClient?.setUser(user);
}

/**
 * Set tag using global client
 */
export function setTag(key: string, value: string): void {
    globalClient?.setTag(key, value);
}

/**
 * Set extra using global client
 */
export function setExtra(key: string, value: any): void {
    globalClient?.setExtra(key, value);
}

// ============================================
// Sentry Plugin
// ============================================

export interface SentryPluginOptions extends SentryOptions {
    /**
     * Middleware options
     */
    middleware?: SentryMiddlewareOptions;
}

/**
 * Create Sentry plugin for Nexus
 * 
 * @example
 * ```typescript
 * import { sentry } from './src/advanced/sentry';
 * 
 * app.plugin(sentry({
 *   dsn: 'https://xxx@xxx.ingest.sentry.io/xxx',
 *   environment: 'production',
 *   tracesSampleRate: 0.1,
 *   middleware: {
 *     includeRequestBody: true,
 *     ignorePaths: ['/health', '/metrics']
 *   }
 * }));
 * ```
 */
export function sentry(options: SentryPluginOptions): import('../../core/types').Plugin {
    return {
        name: 'sentry',
        version: '1.0.0',
        install(app) {
            // Initialize Sentry client
            const client = initSentry(options);

            // Add middleware
            app.use(createSentryMiddleware(client, options.middleware));

            // Wrap error handler to capture exceptions
            const originalOnError = app.onError.bind(app);
            app.onError((error, ctx) => {
                client.captureException(error, {
                    tags: {
                        'http.method': ctx.method,
                        'http.url': ctx.path
                    },
                    extra: {
                        params: ctx.params,
                        query: ctx.query
                    }
                });

                // Return default error response
                return {
                    statusCode: 500,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        error: 'Internal Server Error',
                        message: process.env.NODE_ENV === 'development' ? error.message : undefined
                    })
                };
            });

            // Add shutdown hook if graceful shutdown is enabled
            if (typeof app.onShutdown === 'function') {
                app.onShutdown('sentry-flush', async () => {
                    await client.flush(5000);
                }, 1);
            }
        }
    };
}

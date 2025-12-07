// ============================================
// Types & Interfaces
// ============================================

import { Context } from "../../core/types";

export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';


export interface SentryUser {
    id?: string;
    email?: string;
    username?: string;
    ip_address?: string;
    [key: string]: any;
}

export interface SentryBreadcrumb {
    type?: 'default' | 'http' | 'navigation' | 'error' | 'debug' | 'query' | 'info';
    category?: string;
    message?: string;
    data?: Record<string, any>;
    level?: SeverityLevel;
    timestamp?: number;
}

export interface SentryException {
    type: string;
    value: string;
    stacktrace?: {
        frames: SentryStackFrame[];
    };
    mechanism?: {
        type: string;
        handled: boolean;
    };
}

export interface SentryStackFrame {
    filename?: string;
    function?: string;
    module?: string;
    lineno?: number;
    colno?: number;
    abs_path?: string;
    context_line?: string;
    pre_context?: string[];
    post_context?: string[];
    in_app?: boolean;
}

export interface SentryEvent {
    event_id: string;
    timestamp: number;
    platform: string;
    level: SeverityLevel;
    logger?: string;
    transaction?: string;
    server_name?: string;
    release?: string;
    environment?: string;
    message?: string;
    exception?: {
        values: SentryException[];
    };
    user?: SentryUser;
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    contexts?: Record<string, any>;
    breadcrumbs?: SentryBreadcrumb[];
    request?: {
        url?: string;
        method?: string;
        headers?: Record<string, string>;
        query_string?: string;
        data?: any;
    };
    fingerprint?: string[];
}

export interface SentryTransaction {
    trace_id: string;
    span_id: string;
    parent_span_id?: string;
    name: string;
    op: string;
    status: 'ok' | 'cancelled' | 'unknown' | 'invalid_argument' | 'deadline_exceeded' | 
            'not_found' | 'already_exists' | 'permission_denied' | 'resource_exhausted' |
            'failed_precondition' | 'aborted' | 'out_of_range' | 'unimplemented' |
            'internal_error' | 'unavailable' | 'data_loss' | 'unauthenticated';
    start_timestamp: number;
    timestamp?: number;
    tags?: Record<string, string>;
    data?: Record<string, any>;
    spans?: SentrySpan[];
}

export interface SentrySpan {
    trace_id: string;
    span_id: string;
    parent_span_id?: string;
    op: string;
    description?: string;
    status?: string;
    start_timestamp: number;
    timestamp?: number;
    tags?: Record<string, string>;
    data?: Record<string, any>;
}

/**
 * APM (Application Performance Monitoring) Options
 * Integrated into Sentry for unified monitoring
 */
export interface APMOptions {
    /**
     * Enable APM features
     * @default true when Sentry is enabled
     */
    enabled?: boolean;

    /**
     * Slow query threshold in milliseconds
     * @default 1000
     */
    slowQueryThreshold?: number;

    /**
     * Maximum slow queries to store
     * @default 100
     */
    maxSlowQueries?: number;

    /**
     * Memory leak detection options
     */
    memoryLeakDetection?: {
        /**
         * Enable memory monitoring
         * @default true
         */
        enabled?: boolean;

        /**
         * Check interval in milliseconds
         * @default 60000 (1 minute)
         */
        interval?: number;

        /**
         * Growth threshold to trigger warning (0.5 = 50%)
         * @default 0.5
         */
        growthThreshold?: number;

        /**
         * Number of snapshots to keep
         * @default 60
         */
        maxSnapshots?: number;
    };

    /**
     * Callback when memory leak is detected
     */
    onMemoryLeak?: (stats: MemoryLeakStats) => void;

    /**
     * Callback when slow query is detected
     */
    onSlowQuery?: (query: SlowQueryRecord) => void;
}

export interface MemoryLeakStats {
    growth: number;
    growthPercent: string;
    fromMB: string;
    toMB: string;
    snapshots: MemorySnapshot[];
}

export interface MemorySnapshot {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
}

export interface SlowQueryRecord {
    query: string;
    duration: number;
    timestamp: number;
}

export interface SentryOptions {
    /**
     * Sentry DSN (Data Source Name)
     * Format: https://<key>@<organization>.ingest.sentry.io/<project>
     */
    dsn: string;

    /**
     * Environment name (e.g., 'production', 'staging', 'development')
     */
    environment?: string;

    /**
     * Release version
     */
    release?: string;

    /**
     * Server name for identification
     */
    serverName?: string;

    /**
     * Sample rate for error events (0.0 to 1.0)
     * @default 1.0 (100%)
     */
    sampleRate?: number;

    /**
     * Sample rate for performance/transaction events (0.0 to 1.0)
     * @default 0.1 (10%)
     */
    tracesSampleRate?: number;

    /**
     * Enable performance monitoring
     * @default true
     */
    enableTracing?: boolean;

    /**
     * Maximum breadcrumbs to store
     * @default 100
     */
    maxBreadcrumbs?: number;

    /**
     * Debug mode - logs Sentry operations
     * @default false
     */
    debug?: boolean;

    /**
     * Attach stack traces to all messages
     * @default false
     */
    attachStacktrace?: boolean;

    /**
     * Send default PII (Personally Identifiable Information)
     * @default false
     */
    sendDefaultPii?: boolean;

    /**
     * Before send hook - allows modifying or dropping events
     */
    beforeSend?: (event: SentryEvent, hint?: { originalException?: Error }) => SentryEvent | null;

    /**
     * Before send transaction hook
     */
    beforeSendTransaction?: (transaction: SentryTransaction) => SentryTransaction | null;

    /**
     * Tags to add to all events
     */
    tags?: Record<string, string>;

    /**
     * Extra context to add to all events
     */
    extra?: Record<string, any>;

    /**
     * Paths to ignore (no error reporting)
     */
    ignorePaths?: string[];

    /**
     * Error types to ignore
     */
    ignoreErrors?: (string | RegExp)[];

    /**
     * Request timeout in ms
     * @default 5000
     */
    timeout?: number;

    /**
     * Integrations to enable
     */
    integrations?: {
        http?: boolean;
        console?: boolean;
        unhandledRejection?: boolean;
        uncaughtException?: boolean;
    };

    /**
     * APM (Application Performance Monitoring) options
     * Includes memory leak detection and slow query tracking
     */
    apm?: APMOptions;
}

export interface ParsedDSN {
    protocol: string;
    publicKey: string;
    host: string;
    projectId: string;
}


// ============================================
// Nexus Middleware Integration
// ============================================

export interface SentryMiddlewareOptions {
    /**
     * Include request body in error reports
     * @default false
     */
    includeRequestBody?: boolean;

    /**
     * Include request headers
     * @default true
     */
    includeHeaders?: boolean;

    /**
     * Headers to exclude (e.g., 'authorization', 'cookie')
     */
    excludeHeaders?: string[];

    /**
     * Paths to ignore
     */
    ignorePaths?: string[];

    /**
     * Extract user from context
     */
    extractUser?: (ctx: Context) => SentryUser | null;

    /**
     * Extract transaction name
     */
    getTransactionName?: (ctx: Context) => string;
}

export interface MetricDefinition {
    name: string;
    type: 'counter' | 'histogram' | 'gauge';
    help: string;
    buckets?: number[];
    labels?: string[];
}

export interface TracingOptions {
    enabled: boolean;
    exporter?: 'otlp' | 'jaeger' | 'zipkin' | 'console';
    endpoint?: string;
    serviceName?: string;
    sampleRate?: number;
    alwaysTrace?: string[];
    propagation?: 'w3c' | 'b3' | 'jaeger';
}

export interface LoggingOptions {
    level?: 'debug' | 'info' | 'warn' | 'error';
    format?: 'json' | 'pretty';
    requests?: {
        enabled?: boolean;
        includeBody?: boolean;
        excludePaths?: string[];
    };
    mask?: {
        fields?: string[];
        patterns?: RegExp[];
        replacement?: string;
    };
    correlationId?: {
        enabled?: boolean;
        header?: string;
        generator?: () => string;
    };
}

export interface APMOptions {
    /**
     * Enable APM features
     * Note: For full APM, use Sentry integration which includes
     * enhanced APM with memory leak detection and slow query tracking
     * @default true when observability is enabled
     */
    enabled?: boolean;

    /**
     * Slow query threshold in milliseconds
     * @default 1000
     */
    slowQueryThreshold?: number;

    /**
     * Memory leak detection options
     */
    memoryLeakDetection?: {
        enabled?: boolean;
        /** 
         * Memory growth threshold percentage (e.g., "50%" or 0.5)
         * @default "50%"
         */
        threshold?: string | number;
        /**
         * Check interval in milliseconds
         * @default 60000
         */
        interval?: number;
    };

    /**
     * Deadlock detection (experimental)
     * @default false
     */
    deadlockDetection?: boolean;

    /**
     * Profiling options
     */
    profiling?: {
        enabled?: boolean;
        sampleRate?: number;
        includeStackTrace?: boolean;
    };
}

export interface AlertDefinition {
    name: string;
    condition: string;
    window: string;
    channels: string[];
    threshold?: number;
}

export interface AlertingOptions {
    enabled?: boolean;
    alerts?: AlertDefinition[];
    channels?: {
        slack?: { webhookUrl: string };
        email?: { recipients: string[] };
        pagerduty?: { routingKey: string };
        webhook?: { url: string };
        telegram?: { botToken: string; chatId: string };
        discord?: { webhookUrl: string };
        console?: {};
    };
}

export interface HealthCheckDefinition {
    name: string;
    check: () => Promise<{ status: 'up' | 'down'; details?: Record<string, any> }>;
    timeout?: number;
    critical?: boolean;
}

export interface ObservabilityOptions {
    metrics?: {
        enabled?: boolean;
        custom?: MetricDefinition[];
        format?: 'prometheus' | 'json';
        endpoint?: string;
        defaultLabels?: Record<string, string>;
    };
    tracing?: TracingOptions;
    logging?: LoggingOptions;
    apm?: APMOptions;
    alerting?: AlertingOptions;
    health?: {
        endpoint?: string;
        checks?: HealthCheckDefinition[];
    };
}

export type HistogramRecord = {
    count: number;
    sum: number;
    buckets: number[];
    bucketBoundaries: number[];
};

export type LabeledMetric<T> = Map<string, T>;

export interface GaugeRecord {
    value: number;
    timestamp: number;
}

/**
 * Span for distributed tracing
 */
export interface Span {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: 'ok' | 'error' | 'unset';
    attributes: Record<string, any>;
    events: Array<{ name: string; timestamp: number; attributes?: Record<string, any> }>;
}

/**
 * Structured log entry
 */
export interface LogEntry {
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: number;
    correlationId?: string;
    context?: Record<string, any>;
    error?: { message: string; stack?: string };
}
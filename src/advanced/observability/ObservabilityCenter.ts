import { performance } from 'perf_hooks';
import { Context, Response } from '../../core/types';
import { AlertManager } from './AlertManager';
import { APMManager } from './APMManager';
import { MetricRegistry } from './MetricRegistry';
import { StructuredLogger } from './StructuredLogger';
import { TracingManager } from './TracingManager';
import { ObservabilityOptions, Span, LogEntry } from './types';

/**
 * Enhanced Observability Center with full APM, tracing, logging, and alerting
 */


export class ObservabilityCenter {
    private metrics: MetricRegistry = new MetricRegistry();
    private tracing?: TracingManager;
    private logger: StructuredLogger;
    private apm?: APMManager;
    private alertManager?: AlertManager;
    private options: ObservabilityOptions;

    constructor(options: ObservabilityOptions = {}) {
        this.options = options;

        // Initialize logger
        this.logger = new StructuredLogger(options.logging);

        // Initialize tracing if enabled
        if (options.tracing?.enabled) {
            this.tracing = new TracingManager(options.tracing);
        }

        // Initialize APM if enabled
        if (options.apm?.enabled) {
            this.apm = new APMManager(options.apm);
        }

        // Initialize alerting if enabled
        if (options.alerting?.enabled) {
            this.alertManager = new AlertManager(options.alerting);
        }

        // Set default labels for metrics
        if (options.metrics?.defaultLabels) {
            this.metrics.setDefaultLabels(options.metrics.defaultLabels);
        }

        // Register custom metrics
        if (options.metrics?.custom) {
            for (const def of options.metrics.custom) {
                this.metrics.define(def);
            }
        }

        // Register default metrics
        this.metrics.define({ name: 'http_requests_total', type: 'counter', help: 'Total HTTP requests' });
        this.metrics.define({ name: 'http_request_duration_seconds', type: 'histogram', help: 'HTTP request duration in seconds' });
        this.metrics.define({ name: 'http_request_size_bytes', type: 'histogram', help: 'HTTP request size in bytes' });
        this.metrics.define({ name: 'http_response_size_bytes', type: 'histogram', help: 'HTTP response size in bytes' });
    }

    /**
     * Record an HTTP request
     */
    recordRequest(ctx: Context, response: Response, durationMs: number, error?: Error) {
        const labels = {
            method: ctx.method,
            path: this.normalizePath(ctx.path),
            status: String(response.statusCode)
        };

        if (this.options.metrics?.enabled) {
            this.metrics.increment('http_requests_total', 1, labels);
            this.metrics.observe('http_request_duration_seconds', durationMs / 1000, labels);
        }

        // Log request if enabled
        if (this.options.logging?.requests?.enabled) {
            const excludePaths = this.options.logging.requests.excludePaths ?? [];
            if (!excludePaths.some(p => ctx.path.startsWith(p))) {
                this.logger.info('HTTP Request', {
                    method: ctx.method,
                    path: ctx.path,
                    status: response.statusCode,
                    duration: `${durationMs.toFixed(2)}ms`,
                    ...(this.options.logging.requests.includeBody && ctx.body ? { body: ctx.body } : {})
                }, ctx.correlationId);
            }
        }

        // Check for slow requests and alert
        if (this.alertManager && durationMs > (this.options.apm?.slowQueryThreshold ?? 1000)) {
            this.alertManager.checkAndTrigger('High Response Time', durationMs);
        }

        // Record error if present
        if (error) {
            this.logger.error('Request error', error, { path: ctx.path, method: ctx.method }, ctx.correlationId);
            this.metrics.increment('http_errors_total', 1, { method: ctx.method, path: this.normalizePath(ctx.path) });
        }
    }

    /**
     * Start a new trace span
     */
    startSpan(name: string, ctx?: Context): Span | undefined {
        if (!this.tracing) return undefined;

        let traceContext: { traceId?: string; parentSpanId?: string; } = {};
        if (ctx?.headers) {
            traceContext = this.tracing.extractContext(ctx.headers as Record<string, string | string[] | undefined>);
        }

        const shouldSample = ctx ? this.tracing.shouldSample(ctx.path) : true;
        if (!shouldSample) return undefined;

        return this.tracing.startSpan(name, traceContext.parentSpanId, traceContext.traceId);
    }

    /**
     * End a trace span
     */
    endSpan(spanId: string, status: 'ok' | 'error' = 'ok', error?: Error) {
        this.tracing?.endSpan(spanId, status, error);
    }

    /**
     * Add event to a span
     */
    addSpanEvent(spanId: string, name: string, attributes?: Record<string, any>) {
        this.tracing?.addEvent(spanId, name, attributes);
    }

    /**
     * Set span attributes
     */
    setSpanAttributes(spanId: string, attributes: Record<string, any>) {
        this.tracing?.setAttributes(spanId, attributes);
    }

    /**
     * Record a database query for APM
     */
    recordQuery(query: string, durationMs: number) {
        this.apm?.recordQuery(query, durationMs);
    }

    /**
     * Get the structured logger
     */
    getLogger(): StructuredLogger {
        return this.logger;
    }

    /**
     * Metrics endpoint handler
     */
    metricsHandler() {
        return (ctx: Context): Response => {
            const format = this.options.metrics?.format ?? 'prometheus';
            if (format === 'json') {
                return ctx.json(this.metrics.snapshot());
            }
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                body: this.metrics.toPrometheus()
            };
        };
    }

    /**
     * Health check handler
     */
    healthHandler() {
        return async (_ctx: Context): Promise<Response> => {
            const checks = this.options.health?.checks ?? [];
            const results: Record<string, { status: 'up' | 'down'; details?: Record<string, any>; duration?: number; }> = {};

            let overallStatus: 'up' | 'down' = 'up';

            for (const check of checks) {
                const start = performance.now();
                try {
                    const timeout = check.timeout ?? 5000;
                    const result = await Promise.race([
                        check.check(),
                        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Health check timeout')), timeout)
                        )
                    ]);
                    const duration = performance.now() - start;

                    results[check.name] = { ...result, duration };
                    if (result.status === 'down' && check.critical !== false) {
                        overallStatus = 'down';
                    }
                } catch (error: any) {
                    const duration = performance.now() - start;
                    if (check.critical !== false) {
                        overallStatus = 'down';
                    }
                    results[check.name] = {
                        status: 'down',
                        duration,
                        details: { message: error?.message ?? 'Health check failed' }
                    };
                }
            }

            const statusCode = overallStatus === 'up' ? 200 : 503;

            return {
                statusCode,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: overallStatus,
                    timestamp: new Date().toISOString(),
                    checks: results
                })
            };
        };
    }

    /**
     * Get all traces
     */
    getTraces(): Span[] {
        return this.tracing?.getSpans() ?? [];
    }

    /**
     * Get slow queries from APM
     */
    getSlowQueries() {
        return this.apm?.getSlowQueries() ?? [];
    }

    /**
     * Get memory statistics
     */
    getMemoryStats() {
        return this.apm?.getMemoryStats();
    }

    /**
     * Get alert history
     */
    getAlertHistory() {
        return this.alertManager?.getAlertHistory() ?? [];
    }

    /**
     * Get the alert manager
     */
    getAlertManager() {
        return this.alertManager;
    }

    /**
     * Get logs with optional filtering
     */
    getLogs(filter?: { level?: LogEntry['level']; since?: number; limit?: number; }) {
        return this.logger.getLogs(filter);
    }

    /**
     * Increment a custom counter metric
     */
    incrementCounter(name: string, value: number = 1, labels: Record<string, string> = {}) {
        this.metrics.increment(name, value, labels);
    }

    /**
     * Set a gauge metric value
     */
    setGauge(name: string, value: number, labels: Record<string, string> = {}) {
        this.metrics.gauge(name, value, labels);
    }

    /**
     * Observe a histogram metric
     */
    observeHistogram(name: string, value: number, labels: Record<string, string> = {}) {
        this.metrics.observe(name, value, labels);
    }

    /**
     * Cleanup resources
     */
    shutdown() {
        this.apm?.stop();
    }

    /**
     * Normalize path for metrics (replace dynamic segments)
     */
    private normalizePath(path: string): string {
        return path
            .replace(/\/\d+/g, '/:id')
            .replace(/\/[a-f0-9-]{36}/gi, '/:uuid')
            .replace(/\/[a-f0-9]{24}/gi, '/:objectId');
    }
}

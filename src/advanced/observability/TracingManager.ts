import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { Span, TracingOptions } from './types';

/**
 * Distributed tracing manager
 */
export class TracingManager {
    private spans: Span[] = [];
    private activeSpans: Map<string, Span> = new Map();
    private options: TracingOptions;
    private maxSpans: number = 10000;

    constructor(options: TracingOptions) {
        this.options = options;
    }

    shouldSample(path: string): boolean {
        if (this.options.alwaysTrace?.some(p => path.startsWith(p) || new RegExp(p).test(path))) {
            return true;
        }
        return Math.random() < (this.options.sampleRate ?? 1);
    }

    startSpan(name: string, parentSpanId?: string, traceId?: string): Span {
        const span: Span = {
            traceId: traceId || randomUUID(),
            spanId: randomUUID(),
            parentSpanId,
            name,
            startTime: performance.now(),
            status: 'unset',
            attributes: {},
            events: []
        };
        this.activeSpans.set(span.spanId, span);
        return span;
    }

    endSpan(spanId: string, status: 'ok' | 'error' = 'ok', error?: Error) {
        const span = this.activeSpans.get(spanId);
        if (!span) return;

        span.endTime = performance.now();
        span.duration = span.endTime - span.startTime;
        span.status = status;

        if (error) {
            span.attributes['error.message'] = error.message;
            span.attributes['error.stack'] = error.stack;
        }

        this.activeSpans.delete(spanId);

        // Limit stored spans
        if (this.spans.length >= this.maxSpans) {
            this.spans.shift();
        }
        this.spans.push(span);

        // Export if configured
        this.exportSpan(span);
    }

    addEvent(spanId: string, name: string, attributes?: Record<string, any>) {
        const span = this.activeSpans.get(spanId);
        if (span) {
            span.events.push({ name, timestamp: performance.now(), attributes });
        }
    }

    setAttributes(spanId: string, attributes: Record<string, any>) {
        const span = this.activeSpans.get(spanId);
        if (span) {
            Object.assign(span.attributes, attributes);
        }
    }

    getSpans(): Span[] {
        return [...this.spans];
    }

    getActiveSpans(): Span[] {
        return Array.from(this.activeSpans.values());
    }

    private exportSpan(span: Span) {
        if (this.options.exporter === 'console') {
            console.log('[TRACE]', JSON.stringify(span, null, 2));
        }
        // Other exporters would send to external services
    }

    /**
     * Extract trace context from incoming headers (W3C Trace Context)
     */
    extractContext(headers: Record<string, string | string[] | undefined>): { traceId?: string; parentSpanId?: string; } {
        const traceparent = headers['traceparent'];
        if (!traceparent) return {};

        const value = Array.isArray(traceparent) ? traceparent[0] : traceparent;
        const parts = value.split('-');
        if (parts.length >= 3) {
            return { traceId: parts[1], parentSpanId: parts[2] };
        }
        return {};
    }

    /**
     * Inject trace context into outgoing headers
     */
    injectContext(span: Span): Record<string, string> {
        return {
            traceparent: `00-${span.traceId}-${span.spanId}-01`
        };
    }
}

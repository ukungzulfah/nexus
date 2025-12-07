import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { Middleware } from '../../core/types';
import { ObservabilityCenter } from './ObservabilityCenter';
import { ObservabilityOptions } from './types';

/**
 * Create observability middleware
 */


export function createObservabilityMiddleware(
    center: ObservabilityCenter,
    options: ObservabilityOptions
): Middleware {
    const correlationHeader = options.logging?.correlationId?.header ?? 'x-request-id';
    const correlationGenerator = options.logging?.correlationId?.generator ?? (() => randomUUID());

    return async (ctx, next, _deps) => {
        // Set correlation ID
        const correlationId = (ctx.headers[correlationHeader] as string) || correlationGenerator();
        ctx.correlationId = correlationId;

        // Start span if tracing is enabled
        const span = center.startSpan(`${ctx.method} ${ctx.path}`, ctx);
        if (span) {
            ctx.spanId = span.spanId;
            ctx.traceId = span.traceId;
        }

        const start = performance.now();
        try {
            const response = await next(ctx);
            const duration = performance.now() - start;

            center.recordRequest(ctx, response, duration);

            if (span) {
                center.setSpanAttributes(span.spanId, {
                    'http.status_code': response.statusCode,
                    'http.response_size': response.body?.length ?? 0
                });
                center.endSpan(span.spanId, response.statusCode < 400 ? 'ok' : 'error');
            }

            return response;
        } catch (error) {
            const duration = performance.now() - start;
            center.recordRequest(
                ctx,
                { statusCode: 500, headers: {}, body: '' },
                duration,
                error as Error
            );

            if (span) {
                center.endSpan(span.spanId, 'error', error as Error);
            }

            throw error;
        }
    };
}

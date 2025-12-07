import { LogEntry, LoggingOptions } from './types';

/**
 * Structured logger with masking support
 */
export class StructuredLogger {
    private logs: LogEntry[] = [];
    private options: LoggingOptions;
    private maxLogs: number = 10000;
    private levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };

    constructor(options: LoggingOptions = {}) {
        this.options = options;
    }

    private shouldLog(level: LogEntry['level']): boolean {
        const configuredLevel = this.options.level ?? 'info';
        return this.levelPriority[level] >= this.levelPriority[configuredLevel];
    }

    private maskSensitiveData(obj: any): any {
        if (!this.options.mask || typeof obj !== 'object' || obj === null) {
            return obj;
        }

        const result = Array.isArray(obj) ? [...obj] : { ...obj };
        const replacement = this.options.mask.replacement ?? '***REDACTED***';

        for (const key of Object.keys(result)) {
            // Check field names
            if (this.options.mask.fields?.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
                result[key] = replacement;
                continue;
            }

            // Check patterns on string values
            if (typeof result[key] === 'string' && this.options.mask.patterns) {
                for (const pattern of this.options.mask.patterns) {
                    if (pattern.test(result[key])) {
                        result[key] = replacement;
                        break;
                    }
                }
            }

            // Recurse for nested objects
            if (typeof result[key] === 'object' && result[key] !== null) {
                result[key] = this.maskSensitiveData(result[key]);
            }
        }

        return result;
    }

    private formatEntry(entry: LogEntry): string {
        const masked = this.maskSensitiveData(entry);
        if (this.options.format === 'json') {
            return JSON.stringify(masked);
        }

        // Pretty format
        const timestamp = new Date(masked.timestamp).toISOString();
        const level = masked.level.toUpperCase().padEnd(5);
        const correlationId = masked.correlationId ? `[${masked.correlationId}]` : '';
        let msg = `${timestamp} ${level} ${correlationId} ${masked.message}`;
        if (masked.context) {
            msg += ` ${JSON.stringify(masked.context)}`;
        }
        if (masked.error) {
            msg += `\n  Error: ${masked.error.message}`;
            if (masked.error.stack) {
                msg += `\n  ${masked.error.stack}`;
            }
        }
        return msg;
    }

    log(level: LogEntry['level'], message: string, context?: Record<string, any>, correlationId?: string) {
        if (!this.shouldLog(level)) return;

        const entry: LogEntry = {
            level,
            message,
            timestamp: Date.now(),
            correlationId,
            context
        };

        if (this.logs.length >= this.maxLogs) {
            this.logs.shift();
        }
        this.logs.push(entry);

        // Output to console
        const formatted = this.formatEntry(entry);
        switch (level) {
            case 'error':
                console.error(formatted);
                break;
            case 'warn':
                console.warn(formatted);
                break;
            case 'debug':
                console.debug(formatted);
                break;
            default:
                console.log(formatted);
        }
    }

    debug(message: string, context?: Record<string, any>, correlationId?: string) {
        this.log('debug', message, context, correlationId);
    }

    info(message: string, context?: Record<string, any>, correlationId?: string) {
        this.log('info', message, context, correlationId);
    }

    warn(message: string, context?: Record<string, any>, correlationId?: string) {
        this.log('warn', message, context, correlationId);
    }

    error(message: string, error?: Error, context?: Record<string, any>, correlationId?: string) {
        const entry: LogEntry = {
            level: 'error',
            message,
            timestamp: Date.now(),
            correlationId,
            context,
            error: error ? { message: error.message, stack: error.stack } : undefined
        };

        if (this.logs.length >= this.maxLogs) {
            this.logs.shift();
        }
        this.logs.push(entry);

        console.error(this.formatEntry(entry));
    }

    getLogs(filter?: { level?: LogEntry['level']; since?: number; limit?: number; }): LogEntry[] {
        let result = this.logs;
        if (filter?.level) {
            result = result.filter(l => l.level === filter.level);
        }
        if (filter?.since) {
            result = result.filter(l => l.timestamp >= filter.since!);
        }
        if (filter?.limit) {
            result = result.slice(-filter.limit);
        }
        return result;
    }
}

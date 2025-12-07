import crypto from 'crypto';
import { QueryMetrics, SchemaDefinition, TableDefinition } from './types';

export interface OptimizationHint {
    type: 'n-plus-one' | 'missing-index' | 'slow-query';
    table: string;
    message: string;
    context?: Record<string, unknown>;
}

interface TrackedQuery {
    pattern: string;
    occurrences: number;
    lastParams?: unknown[];
    lastTimestamp: number;
    table: string;
}

export interface QueryOptimizerOptions {
    nPlusOneThreshold?: number;
    slowQueryThresholdMs?: number;
}

export class QueryOptimizer {
    private trackedQueries = new Map<string, TrackedQuery>();
    private hints: OptimizationHint[] = [];
    private readonly tablesByName: Record<string, TableDefinition>;

    constructor(
        schema: SchemaDefinition,
        private readonly options: QueryOptimizerOptions = {}
    ) {
        this.tablesByName = schema;
    }

    analyze(metrics: QueryMetrics): void {
        this.detectSlowQuery(metrics);
        this.detectNPlusOne(metrics);
        this.detectMissingIndexes(metrics);
    }

    private detectSlowQuery(metrics: QueryMetrics) {
        const threshold = this.options.slowQueryThresholdMs ?? 25;
        if (metrics.duration > threshold) {
            this.hints.push({
                type: 'slow-query',
                table: metrics.table,
                message: `Query exceeded ${threshold}ms (${metrics.duration.toFixed(2)}ms)`,
                context: { sql: metrics.sql }
            });
        }
    }

    private detectNPlusOne(metrics: QueryMetrics) {
        const hash = this.hashSql(metrics.sql);
        const existing = this.trackedQueries.get(hash);
        const threshold = this.options.nPlusOneThreshold ?? 5;

        if (!existing) {
            this.trackedQueries.set(hash, {
                pattern: metrics.sql,
                occurrences: 1,
                lastParams: metrics.params,
                lastTimestamp: Date.now(),
                table: metrics.table
            });
            return;
        }

        existing.occurrences += 1;
        existing.lastParams = metrics.params;
        existing.lastTimestamp = Date.now();

        if (existing.occurrences >= threshold) {
            this.hints.push({
                type: 'n-plus-one',
                table: metrics.table,
                message: `Potential N+1 detected for query "${metrics.sql.slice(0, 60)}..."`,
                context: { occurrences: existing.occurrences }
            });
            existing.occurrences = 0;
        }
    }

    private detectMissingIndexes(metrics: QueryMetrics) {
        const table = this.tablesByName[metrics.table];
        if (!table) return;

        const whereMatches = metrics.sql.match(/where\s+([a-zA-Z0-9_." =<>$]+)/i);
        if (!whereMatches) return;

        const columns = table.indexes.flatMap((idx) => idx.columns);
        const missingColumns: string[] = [];

        whereMatches[1]
            .split(/\s+and\s+/i)
            .map((condition) => condition.trim().replace(/["`]/g, ''))
            .forEach((condition) => {
                const column = condition.split(/\s+/)[0];
                if (!columns.includes(column)) {
                    missingColumns.push(column);
                }
            });

        if (missingColumns.length > 0) {
            this.hints.push({
                type: 'missing-index',
                table: table.name,
                message: `Consider adding index on columns: ${missingColumns.join(', ')}`,
                context: { whereClause: whereMatches[0] }
            });
        }
    }

    consumeHints(): OptimizationHint[] {
        const hints = [...this.hints];
        this.hints.length = 0;
        return hints;
    }

    private hashSql(sql: string): string {
        return crypto.createHash('sha1').update(sql).digest('hex');
    }
}


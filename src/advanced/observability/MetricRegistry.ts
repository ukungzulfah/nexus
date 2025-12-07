import { LabeledMetric, HistogramRecord, GaugeRecord, MetricDefinition } from './types';

/**
 * Enhanced metric registry with labels, gauges, and proper Prometheus formatting
 */
export class MetricRegistry {
    private counters: LabeledMetric<number> = new Map();
    private histograms: LabeledMetric<HistogramRecord> = new Map();
    private gauges: LabeledMetric<GaugeRecord> = new Map();
    private definitions: Map<string, MetricDefinition> = new Map();
    private defaultLabels: Record<string, string> = {};

    setDefaultLabels(labels: Record<string, string>) {
        this.defaultLabels = labels;
    }

    define(definition: MetricDefinition) {
        this.definitions.set(definition.name, definition);
    }

    private formatLabels(labels: Record<string, string> = {}): string {
        const allLabels = { ...this.defaultLabels, ...labels };
        const entries = Object.entries(allLabels);
        if (entries.length === 0) return '';
        return '{' + entries.map(([k, v]) => `${k}="${v}"`).join(',') + '}';
    }

    private getKey(name: string, labels: Record<string, string> = {}): string {
        return name + this.formatLabels(labels);
    }

    increment(name: string, value: number = 1, labels: Record<string, string> = {}) {
        const key = this.getKey(name, labels);
        this.counters.set(key, (this.counters.get(key) || 0) + value);
    }

    decrement(name: string, value: number = 1, labels: Record<string, string> = {}) {
        this.increment(name, -value, labels);
    }

    gauge(name: string, value: number, labels: Record<string, string> = {}) {
        const key = this.getKey(name, labels);
        this.gauges.set(key, { value, timestamp: Date.now() });
    }

    observe(
        name: string,
        value: number,
        labels: Record<string, string> = {},
        buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    ) {
        const key = this.getKey(name, labels);
        const existing = this.histograms.get(key);
        const record: HistogramRecord = existing || {
            count: 0,
            sum: 0,
            buckets: buckets.map(() => 0),
            bucketBoundaries: buckets
        };

        record.count += 1;
        record.sum += value;
        record.buckets = record.buckets.map((bucketValue, index) => {
            return bucketValue + (value <= record.bucketBoundaries[index] ? 1 : 0);
        });

        this.histograms.set(key, record);
    }

    toPrometheus(): string {
        const lines: string[] = [];
        const processedMetrics = new Set<string>();

        // Counters
        for (const [key, value] of this.counters.entries()) {
            const baseName = key.split('{')[0];
            if (!processedMetrics.has(`counter:${baseName}`)) {
                const def = this.definitions.get(baseName);
                if (def?.help) lines.push(`# HELP ${baseName} ${def.help}`);
                lines.push(`# TYPE ${baseName} counter`);
                processedMetrics.add(`counter:${baseName}`);
            }
            lines.push(`${key} ${value}`);
        }

        // Gauges
        for (const [key, record] of this.gauges.entries()) {
            const baseName = key.split('{')[0];
            if (!processedMetrics.has(`gauge:${baseName}`)) {
                const def = this.definitions.get(baseName);
                if (def?.help) lines.push(`# HELP ${baseName} ${def.help}`);
                lines.push(`# TYPE ${baseName} gauge`);
                processedMetrics.add(`gauge:${baseName}`);
            }
            lines.push(`${key} ${record.value}`);
        }

        // Histograms
        for (const [key, record] of this.histograms.entries()) {
            const baseName = key.split('{')[0];
            const labelsPart = key.includes('{') ? key.slice(key.indexOf('{')) : '';
            const labelsInner = labelsPart.slice(1, -1);

            if (!processedMetrics.has(`histogram:${baseName}`)) {
                const def = this.definitions.get(baseName);
                if (def?.help) lines.push(`# HELP ${baseName} ${def.help}`);
                lines.push(`# TYPE ${baseName} histogram`);
                processedMetrics.add(`histogram:${baseName}`);
            }

            record.bucketBoundaries.forEach((boundary, index) => {
                const bucketLabels = labelsInner ? `${labelsInner},le="${boundary}"` : `le="${boundary}"`;
                lines.push(`${baseName}_bucket{${bucketLabels}} ${record.buckets[index]}`);
            });

            const infLabels = labelsInner ? `${labelsInner},le="+Inf"` : `le="+Inf"`;
            lines.push(`${baseName}_bucket{${infLabels}} ${record.count}`);

            if (labelsPart) {
                lines.push(`${baseName}_sum${labelsPart} ${record.sum}`);
                lines.push(`${baseName}_count${labelsPart} ${record.count}`);
            } else {
                lines.push(`${baseName}_sum ${record.sum}`);
                lines.push(`${baseName}_count ${record.count}`);
            }
        }

        return lines.join('\n');
    }

    snapshot() {
        return {
            counters: Object.fromEntries(this.counters),
            gauges: Object.fromEntries(
                Array.from(this.gauges.entries()).map(([k, v]) => [k, v.value])
            ),
            histograms: Object.fromEntries(
                Array.from(this.histograms.entries()).map(([k, v]) => [
                    k,
                    { count: v.count, sum: v.sum, mean: v.count > 0 ? v.sum / v.count : 0 }
                ])
            )
        };
    }

    reset() {
        this.counters.clear();
        this.histograms.clear();
        this.gauges.clear();
    }
}

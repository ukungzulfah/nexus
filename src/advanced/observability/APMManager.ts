import { APMOptions } from './types';
import { getSentry, SentryClient } from '../sentry';

/**
 * APM (Application Performance Monitoring) manager
 * 
 * This is a lightweight wrapper that delegates to Sentry when available.
 * For full APM features (memory leak detection, slow query tracking),
 * use Sentry integration which has built-in APM support.
 * 
 * @example
 * ```typescript
 * // Recommended: Use Sentry with APM
 * import { initSentry } from 'nexus';
 * 
 * initSentry({
 *   dsn: 'your-dsn',
 *   apm: {
 *     slowQueryThreshold: 500,
 *     memoryLeakDetection: { enabled: true }
 *   }
 * });
 * 
 * // Then use APMManager as facade
 * const apm = new APMManager();
 * apm.recordQuery('SELECT * FROM users', 1200);
 * ```
 */
export class APMManager {
    private options: APMOptions;
    private sentryClient?: SentryClient | null;
    
    // Fallback storage when Sentry is not available
    private slowQueries: Array<{ query: string; duration: number; timestamp: number; }> = [];
    private memorySnapshots: Array<{ timestamp: number; heapUsed: number; heapTotal: number; }> = [];
    private memoryCheckInterval?: NodeJS.Timeout;

    constructor(options: APMOptions = {}) {
        this.options = options;
        this.sentryClient = getSentry();

        // If Sentry is not available and memory leak detection is enabled, use fallback
        if (!this.sentryClient && options.memoryLeakDetection?.enabled) {
            this.startMemoryMonitoring();
        }
    }

    /**
     * Record a database/external query
     * Delegates to Sentry when available
     */
    recordQuery(query: string, durationMs: number, metadata?: Record<string, any>) {
        // Delegate to Sentry if available
        if (this.sentryClient) {
            this.sentryClient.recordQuery(query, durationMs, metadata);
            return;
        }

        // Fallback: store locally
        const threshold = this.options.slowQueryThreshold ?? 1000;
        if (durationMs >= threshold) {
            this.slowQueries.push({
                query,
                duration: durationMs,
                timestamp: Date.now()
            });

            // Keep last 100 slow queries
            if (this.slowQueries.length > 100) {
                this.slowQueries.shift();
            }
        }
    }

    /**
     * Get slow queries
     * Delegates to Sentry when available
     */
    getSlowQueries() {
        if (this.sentryClient) {
            return this.sentryClient.getSlowQueries();
        }
        return [...this.slowQueries];
    }

    private startMemoryMonitoring() {
        const interval = this.options.memoryLeakDetection?.interval ?? 60000;

        this.memoryCheckInterval = setInterval(() => {
            const usage = process.memoryUsage();
            this.memorySnapshots.push({
                timestamp: Date.now(),
                heapUsed: usage.heapUsed,
                heapTotal: usage.heapTotal
            });

            // Keep last 60 snapshots
            if (this.memorySnapshots.length > 60) {
                this.memorySnapshots.shift();
            }

            // Check for potential memory leak
            this.checkMemoryLeak();
        }, interval);
    }

    private checkMemoryLeak() {
        if (this.memorySnapshots.length < 10) return;

        const recent = this.memorySnapshots.slice(-10);
        const oldest = recent[0].heapUsed;
        const newest = recent[recent.length - 1].heapUsed;
        const growth = (newest - oldest) / oldest;

        // Parse threshold
        let threshold = 0.5;
        const thresholdConfig = this.options.memoryLeakDetection?.threshold;
        if (typeof thresholdConfig === 'string') {
            threshold = parseFloat(thresholdConfig.replace('%', '')) / 100;
        } else if (typeof thresholdConfig === 'number') {
            threshold = thresholdConfig;
        }

        // Alert if memory grew more than threshold in the monitoring window
        if (growth > threshold) {
            console.warn('[APM] Potential memory leak detected:', {
                growth: `${(growth * 100).toFixed(1)}%`,
                from: `${(oldest / 1024 / 1024).toFixed(1)}MB`,
                to: `${(newest / 1024 / 1024).toFixed(1)}MB`
            });
        }
    }

    /**
     * Get memory statistics
     * Delegates to Sentry when available
     */
    getMemoryStats() {
        if (this.sentryClient) {
            return this.sentryClient.getMemoryStats();
        }

        const current = process.memoryUsage();
        return {
            current: {
                heapUsed: current.heapUsed,
                heapTotal: current.heapTotal,
                external: current.external,
                rss: current.rss
            },
            history: this.memorySnapshots
        };
    }

    /**
     * Stop APM monitoring
     */
    stop() {
        if (this.memoryCheckInterval) {
            clearInterval(this.memoryCheckInterval);
        }
    }
}

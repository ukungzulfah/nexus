import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { InMemoryQueueStore } from './InMemoryQueueStore';
import { QueueOptions, JobHandler, QueueStore, EnqueueOptions, Job, QueueStats } from './types';

/**
 * Cron expression parser
 * Supports: second minute hour dayOfMonth month dayOfWeek
 * 
 * Examples:
 * - '0 0 * * *' = Every day at midnight
 * - '*\/5 * * * *' = Every 5 minutes
 * - '0 9 * * 1-5' = 9 AM on weekdays
 * - '0 0 1 * *' = First day of every month
 */
export interface CronSchedule {
    /**
     * Cron expression (5 or 6 fields)
     * Standard: minute hour dayOfMonth month dayOfWeek
     * Extended: second minute hour dayOfMonth month dayOfWeek
     */
    cron: string;

    /**
     * Timezone for the schedule (e.g., 'America/New_York')
     * @default 'UTC'
     */
    timezone?: string;
}

/**
 * Scheduled job configuration
 */
export interface ScheduledJobConfig<Data = any> {
    /**
     * Unique name for the scheduled job
     */
    name: string;

    /**
     * Cron schedule or interval
     */
    schedule: CronSchedule | number;

    /**
     * Job data generator or static data
     */
    data: Data | (() => Data | Promise<Data>);

    /**
     * Job handler
     */
    handler: JobHandler<Data, any>;

    /**
     * Whether to run immediately on startup
     * @default false
     */
    runOnStart?: boolean;

    /**
     * Maximum instances that can run concurrently
     * @default 1
     */
    maxConcurrency?: number;
}

/**
 * Simple cron parser
 */
function parseCron(expression: string): { next: (from?: Date) => Date } {
    const parts = expression.trim().split(/\s+/);
    
    // Support both 5-field and 6-field cron expressions
    let minute: string, hour: string, dayOfMonth: string, month: string, dayOfWeek: string;
    
    if (parts.length === 5) {
        [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    } else if (parts.length === 6) {
        // 6-field includes seconds, we ignore it for simplicity
        [, minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    } else {
        throw new Error(`Invalid cron expression: ${expression}`);
    }

    function parseField(field: string, min: number, max: number): number[] {
        const values: Set<number> = new Set();

        for (const part of field.split(',')) {
            if (part === '*') {
                for (let i = min; i <= max; i++) values.add(i);
            } else if (part.includes('/')) {
                const [range, step] = part.split('/');
                const stepNum = parseInt(step, 10);
                const [start, end] = range === '*' 
                    ? [min, max] 
                    : range.includes('-') 
                        ? range.split('-').map(n => parseInt(n, 10))
                        : [parseInt(range, 10), max];
                for (let i = start; i <= end; i += stepNum) values.add(i);
            } else if (part.includes('-')) {
                const [start, end] = part.split('-').map(n => parseInt(n, 10));
                for (let i = start; i <= end; i++) values.add(i);
            } else {
                values.add(parseInt(part, 10));
            }
        }

        return Array.from(values).sort((a, b) => a - b);
    }

    const minutes = parseField(minute, 0, 59);
    const hours = parseField(hour, 0, 23);
    const daysOfMonth = parseField(dayOfMonth, 1, 31);
    const months = parseField(month, 1, 12);
    const daysOfWeek = parseField(dayOfWeek, 0, 6);

    return {
        next(from: Date = new Date()): Date {
            const date = new Date(from);
            date.setSeconds(0, 0);
            date.setMinutes(date.getMinutes() + 1);

            // Find next matching time (max 1 year search)
            const maxIterations = 366 * 24 * 60;
            for (let i = 0; i < maxIterations; i++) {
                const m = date.getMonth() + 1;
                const dom = date.getDate();
                const dow = date.getDay();
                const h = date.getHours();
                const min = date.getMinutes();

                if (
                    months.includes(m) &&
                    daysOfMonth.includes(dom) &&
                    daysOfWeek.includes(dow) &&
                    hours.includes(h) &&
                    minutes.includes(min)
                ) {
                    return date;
                }

                date.setMinutes(date.getMinutes() + 1);
            }

            throw new Error('Could not find next cron execution time within 1 year');
        }
    };
}

/**
 * Background job queue implementation with cron support
 * 
 * @example
 * ```typescript
 * const queue = new JobQueue('tasks');
 * 
 * // Regular job
 * queue.process('sendEmail', async (job) => {
 *   await sendEmail(job.data);
 * });
 * 
 * // Scheduled job (every 5 minutes)
 * queue.schedule({
 *   name: 'cleanup',
 *   schedule: { cron: '*\/5 * * * *' },
 *   data: {},
 *   handler: async () => {
 *     await cleanupOldData();
 *   }
 * });
 * 
 * // Interval job (every 30 seconds)
 * queue.schedule({
 *   name: 'healthCheck',
 *   schedule: 30000,
 *   data: {},
 *   handler: async () => {
 *     await checkHealth();
 *   }
 * });
 * ```
 */
export class JobQueue<Data = any, Result = any> extends EventEmitter {
    name: string;
    private options: Required<Pick<QueueOptions<Data>, 'concurrency' | 'retry'>> & QueueOptions<Data>;
    private handlers: Map<string, JobHandler<Data, Result>> = new Map();
    private store: QueueStore<Data>;
    private activeWorkers = 0;
    private paused = false;
    private limiterWindowStart = 0;
    private processedInWindow = 0;
    
    // Scheduler state
    private scheduledJobs: Map<string, {
        config: ScheduledJobConfig<Data>;
        timer?: NodeJS.Timeout;
        activeCount: number;
    }> = new Map();

    constructor(name: string, options: QueueOptions<Data> = {}) {
        super();
        this.name = name;
        this.options = {
            concurrency: options.concurrency ?? 5,
            retry: {
                attempts: options.retry?.attempts ?? 3,
                backoff: options.retry?.backoff ?? 'exponential',
                delay: options.retry?.delay ?? 1000,
                maxDelay: options.retry?.maxDelay ?? 60000
            },
            ...options
        };

        this.store = options.store ?? new InMemoryQueueStore<Data>();
    }

    /**
     * Add a job to the queue
     */
    async add(
        name: string,
        data: Data,
        options: EnqueueOptions = {}
    ): Promise<Job<Data>> {
        if (!this.handlers.has(name)) {
            throw new Error(`No handler registered for job "${name}"`);
        }

        const now = Date.now();
        const job: Job<Data> = {
            id: randomUUID(),
            name,
            data,
            state: options.delay ? 'delayed' : 'waiting',
            attemptsMade: 0,
            maxAttempts: options.attempts ?? this.options.retry.attempts ?? 3,
            priority: options.priority ?? 0,
            createdAt: now,
            updatedAt: now,
            runAt: options.delay ? now + options.delay : now,
            metadata: options.metadata
        };

        await this.store.enqueue(job);
        this.emit('added', job);
        void this.work();
        return job;
    }

    /**
     * Add many jobs at once
     */
    async addBulk(jobs: Array<{ name: string; data: Data; options?: EnqueueOptions; }>) {
        return Promise.all(jobs.map(job => this.add(job.name, job.data, job.options)));
    }

    /**
     * Register a processor for a given job name
     */
    process(name: string, handler: JobHandler<Data, Result>) {
        this.handlers.set(name, handler);
    }

    /**
     * Schedule a recurring job using cron expression or interval
     * 
     * @example
     * ```typescript
     * // Cron: Every day at 9 AM
     * queue.schedule({
     *   name: 'dailyReport',
     *   schedule: { cron: '0 9 * * *' },
     *   data: { type: 'daily' },
     *   handler: async (job) => generateReport(job.data)
     * });
     * 
     * // Interval: Every 30 seconds
     * queue.schedule({
     *   name: 'heartbeat',
     *   schedule: 30000,
     *   data: {},
     *   handler: async () => sendHeartbeat()
     * });
     * ```
     */
    schedule(config: ScheduledJobConfig<Data>): void {
        const { name, schedule, handler, runOnStart = false, maxConcurrency = 1 } = config;

        if (this.scheduledJobs.has(name)) {
            throw new Error(`Scheduled job "${name}" already exists. Call unschedule() first.`);
        }

        // Register the handler
        this.handlers.set(name, handler);

        const state = {
            config,
            timer: undefined as NodeJS.Timeout | undefined,
            activeCount: 0
        };

        this.scheduledJobs.set(name, state);

        const executeScheduledJob = async () => {
            if (this.paused) return;
            if (state.activeCount >= maxConcurrency) {
                this.emit('schedule:skipped', name, 'max concurrency reached');
                return;
            }

            state.activeCount++;
            try {
                const data = typeof config.data === 'function' 
                    ? await (config.data as () => Data | Promise<Data>)()
                    : config.data;

                await this.add(name, data);
                this.emit('schedule:triggered', name);
            } catch (error) {
                this.emit('schedule:error', name, error);
            } finally {
                state.activeCount--;
            }
        };

        if (typeof schedule === 'number') {
            // Interval-based scheduling
            if (runOnStart) {
                void executeScheduledJob();
            }
            state.timer = setInterval(executeScheduledJob, schedule);
        } else {
            // Cron-based scheduling
            const cron = parseCron(schedule.cron);
            
            const scheduleNext = () => {
                const now = new Date();
                const next = cron.next(now);
                const delay = next.getTime() - now.getTime();

                state.timer = setTimeout(async () => {
                    await executeScheduledJob();
                    scheduleNext();
                }, delay);

                this.emit('schedule:next', name, next);
            };

            if (runOnStart) {
                void executeScheduledJob();
            }
            scheduleNext();
        }

        this.emit('schedule:registered', name, schedule);
    }

    /**
     * Remove a scheduled job
     */
    unschedule(name: string): boolean {
        const state = this.scheduledJobs.get(name);
        if (!state) {
            return false;
        }

        if (state.timer) {
            clearTimeout(state.timer);
            clearInterval(state.timer);
        }

        this.scheduledJobs.delete(name);
        this.emit('schedule:removed', name);
        return true;
    }

    /**
     * Get all scheduled jobs
     */
    getScheduledJobs(): string[] {
        return Array.from(this.scheduledJobs.keys());
    }

    /**
     * Pause job processing
     */
    pause() {
        this.paused = true;
        this.emit('paused');
    }

    /**
     * Resume job processing
     */
    resume() {
        if (!this.paused) return;
        this.paused = false;
        this.emit('resumed');
        void this.work();
    }

    /**
     * Get queue statistics
     */
    async stats(): Promise<QueueStats> {
        return this.store.stats();
    }

    /**
     * Retry a failed job manually
     */
    async retry(jobId: string): Promise<void> {
        const job = await this.store.get(jobId);
        if (!job) {
            throw new Error(`Job ${jobId} not found`);
        }
        job.state = 'waiting';
        job.runAt = Date.now();
        job.updatedAt = Date.now();
        await this.store.update(job);
        void this.work();
    }

    /**
     * Shutdown the queue gracefully
     */
    async shutdown(): Promise<void> {
        this.paused = true;

        // Clear all scheduled jobs
        for (const [name] of this.scheduledJobs) {
            this.unschedule(name);
        }

        // Wait for active workers to finish
        const maxWait = 30000;
        const startTime = Date.now();
        while (this.activeWorkers > 0 && Date.now() - startTime < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.emit('shutdown');
    }

    /**
     * Internal worker loop
     */
    private async work(): Promise<void> {
        if (this.paused) {
            return;
        }

        while (this.activeWorkers < (this.options.concurrency ?? 1)) {
            if (!this.canProcessDueToRateLimit()) {
                break;
            }

            const job = await this.store.dequeue();
            if (!job) {
                break;
            }

            this.activeWorkers++;
            void this.executeJob(job);
        }
    }

    private async executeJob(job: Job<Data>) {
        const handler = this.handlers.get(job.name);
        if (!handler) {
            await this.failJob(job, new Error(`Handler missing for job "${job.name}"`));
            return;
        }

        this.emit('active', job);

        try {
            const result = await handler(job);
            await this.completeJob(job, result);
        } catch (error) {
            await this.failJob(job, error as Error);
        } finally {
            this.activeWorkers = Math.max(0, this.activeWorkers - 1);
            this.processedInWindow++;
            if (!this.paused) {
                void this.work();
            }
        }
    }

    private async completeJob(job: Job<Data>, result: Result) {
        job.state = 'completed';
        job.result = result;
        job.updatedAt = Date.now();
        await this.store.update(job);

        this.emit('completed', job, result);
        await this.options.hooks?.onComplete?.(job, result);
    }

    private async failJob(job: Job<Data>, error: Error) {
        job.attemptsMade++;
        job.error = { message: error.message, stack: error.stack };
        job.updatedAt = Date.now();

        if (job.attemptsMade < job.maxAttempts) {
            const delay = this.calculateRetryDelay(job.attemptsMade);
            job.state = 'delayed';
            job.runAt = Date.now() + delay;
            await this.store.update(job);
            this.emit('retrying', job, job.attemptsMade, delay);
            await this.options.hooks?.onRetry?.(job, job.attemptsMade, delay);
        } else {
            job.state = 'failed';
            await this.store.update(job);
            this.emit('failed', job, error);
            await this.options.hooks?.onFailed?.(job, error);
        }
    }

    private calculateRetryDelay(attempt: number): number {
        const { backoff = 'exponential', delay = 1000, maxDelay = 60000 } = this.options.retry ?? {};
        if (backoff === 'fixed') {
            return Math.min(delay, maxDelay);
        }
        const computed = delay * Math.pow(2, attempt - 1);
        return Math.min(computed, maxDelay);
    }

    private canProcessDueToRateLimit(): boolean {
        const limiter = this.options.limiter;
        if (!limiter) {
            return true;
        }

        const now = Date.now();

        if (now - this.limiterWindowStart > limiter.duration) {
            this.limiterWindowStart = now;
            this.processedInWindow = 0;
        }

        if (this.processedInWindow >= limiter.max) {
            const waitTime = limiter.duration - (now - this.limiterWindowStart);
            setTimeout(() => {
                this.processedInWindow = 0;
                this.limiterWindowStart = Date.now();
                void this.work();
            }, waitTime);
            return false;
        }

        return true;
    }
}

import { QueueStore, Job, JobState, QueueStats } from './types';

/**
 * Redis queue store configuration
 */
export interface RedisQueueConfig {
    /**
     * Redis connection URL
     * @example 'redis://localhost:6379'
     */
    url?: string;

    /**
     * Redis host
     * @default 'localhost'
     */
    host?: string;

    /**
     * Redis port
     * @default 6379
     */
    port?: number;

    /**
     * Redis password
     */
    password?: string;

    /**
     * Redis database number
     * @default 0
     */
    db?: number;

    /**
     * Key prefix for queue data
     * @default 'nexus:queue:'
     */
    prefix?: string;

    /**
     * Poll interval for delayed jobs in milliseconds
     * @default 1000
     */
    pollInterval?: number;
}

/**
 * Redis client interface (compatible with ioredis and node-redis)
 */
export interface RedisClientLike {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<any>;
    del(key: string | string[]): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    lpush(key: string, ...values: string[]): Promise<number>;
    rpop(key: string): Promise<string | null>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;
    lrem(key: string, count: number, value: string): Promise<number>;
    zadd(key: string, ...args: (string | number)[]): Promise<number>;
    zrangebyscore(key: string, min: number | string, max: number | string): Promise<string[]>;
    zrem(key: string, ...members: string[]): Promise<number>;
    hset(key: string, field: string, value: string): Promise<number>;
    hget(key: string, field: string): Promise<string | null>;
    hgetall(key: string): Promise<Record<string, string>>;
    hdel(key: string, ...fields: string[]): Promise<number>;
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    quit?(): Promise<any>;
    disconnect?(): Promise<any>;
}

/**
 * Redis-based queue store implementation
 * Provides persistent job storage with support for distributed workers
 * 
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * import { JobQueue, RedisQueueStore } from 'nexus';
 * 
 * const redis = new Redis();
 * const store = new RedisQueueStore('emails', { client: redis });
 * const queue = new JobQueue('emails', { store });
 * 
 * // Add a job
 * await queue.add('sendEmail', { to: 'user@example.com', subject: 'Hello' });
 * 
 * // Process jobs
 * queue.process('sendEmail', async (job) => {
 *   await sendEmail(job.data);
 *   return { sent: true };
 * });
 * ```
 */
export class RedisQueueStore<Data = any> implements QueueStore<Data> {
    private client: RedisClientLike;
    private prefix: string;
    private queueName: string;
    private pollInterval: number;
    private pollTimer?: NodeJS.Timeout;

    constructor(
        queueName: string,
        options: RedisQueueConfig & { client: RedisClientLike }
    ) {
        this.queueName = queueName;
        this.client = options.client;
        this.prefix = options.prefix ?? 'nexus:queue:';
        this.pollInterval = options.pollInterval ?? 1000;
    }

    /**
     * Build Redis key with prefix
     */
    private key(type: string): string {
        return `${this.prefix}${this.queueName}:${type}`;
    }

    /**
     * Serialize job to JSON
     */
    private serialize(job: Job<Data>): string {
        return JSON.stringify(job);
    }

    /**
     * Deserialize job from JSON
     */
    private deserialize(data: string): Job<Data> {
        return JSON.parse(data);
    }

    /**
     * Add a job to the queue
     */
    async enqueue(job: Job<Data>): Promise<void> {
        const serialized = this.serialize(job);

        // Store job data in hash
        await this.client.hset(this.key('jobs'), job.id, serialized);

        if (job.state === 'delayed') {
            // Add to delayed set with score = runAt timestamp
            await this.client.zadd(this.key('delayed'), job.runAt, job.id);
        } else if (job.state === 'waiting') {
            // Add to waiting list (with priority handling)
            await this.client.lpush(this.key(`waiting:${job.priority}`), job.id);
        }

        // Increment total counter
        await this.client.incr(this.key('total'));
    }

    /**
     * Get the next job to process
     */
    async dequeue(): Promise<Job<Data> | undefined> {
        // First, check delayed jobs that are now ready
        const now = Date.now();
        const readyDelayed = await this.client.zrangebyscore(
            this.key('delayed'),
            '-inf',
            now
        );

        // Move ready delayed jobs to waiting
        for (const jobId of readyDelayed) {
            const jobData = await this.client.hget(this.key('jobs'), jobId);
            if (jobData) {
                const job = this.deserialize(jobData);
                job.state = 'waiting';
                await this.client.hset(this.key('jobs'), jobId, this.serialize(job));
                await this.client.zrem(this.key('delayed'), jobId);
                await this.client.lpush(this.key(`waiting:${job.priority}`), jobId);
            }
        }

        // Check priority queues (high to low: 10, 5, 0, -5, -10, etc.)
        const priorities = [10, 5, 0, -5, -10];
        
        for (const priority of priorities) {
            const jobId = await this.client.rpop(this.key(`waiting:${priority}`));
            if (jobId) {
                const jobData = await this.client.hget(this.key('jobs'), jobId);
                if (jobData) {
                    const job = this.deserialize(jobData);
                    job.state = 'active';
                    job.updatedAt = Date.now();
                    await this.client.hset(this.key('jobs'), jobId, this.serialize(job));
                    return job;
                }
            }
        }

        // Fallback: check default priority (0)
        const jobId = await this.client.rpop(this.key('waiting:0'));
        if (jobId) {
            const jobData = await this.client.hget(this.key('jobs'), jobId);
            if (jobData) {
                const job = this.deserialize(jobData);
                job.state = 'active';
                job.updatedAt = Date.now();
                await this.client.hset(this.key('jobs'), jobId, this.serialize(job));
                return job;
            }
        }

        return undefined;
    }

    /**
     * Update job state
     */
    async update(job: Job<Data>): Promise<void> {
        const serialized = this.serialize(job);
        await this.client.hset(this.key('jobs'), job.id, serialized);

        // Handle state-specific storage
        if (job.state === 'delayed') {
            await this.client.zadd(this.key('delayed'), job.runAt, job.id);
        } else if (job.state === 'waiting') {
            await this.client.lpush(this.key(`waiting:${job.priority}`), job.id);
        } else if (job.state === 'completed') {
            await this.client.lpush(this.key('completed'), job.id);
            // Set expiry for completed jobs (24 hours)
            await this.client.expire(this.key('completed'), 86400);
        } else if (job.state === 'failed') {
            await this.client.lpush(this.key('failed'), job.id);
        }
    }

    /**
     * Get a job by ID
     */
    async get(id: string): Promise<Job<Data> | undefined> {
        const data = await this.client.hget(this.key('jobs'), id);
        if (!data) return undefined;
        return this.deserialize(data);
    }

    /**
     * List jobs by state
     */
    async list(state?: JobState): Promise<Job<Data>[]> {
        const allJobs = await this.client.hgetall(this.key('jobs'));
        const jobs = Object.values(allJobs).map(data => this.deserialize(data));

        if (!state) {
            return jobs;
        }

        return jobs.filter(job => job.state === state);
    }

    /**
     * Get queue statistics
     */
    async stats(): Promise<QueueStats> {
        const allJobs = await this.client.hgetall(this.key('jobs'));
        const stats: QueueStats = {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0
        };

        for (const data of Object.values(allJobs)) {
            const job = this.deserialize(data);
            if (job.state in stats) {
                (stats as any)[job.state]++;
            }
        }

        return stats;
    }

    /**
     * Clean old completed/failed jobs
     */
    async clean(state: 'completed' | 'failed', olderThanMs: number = 86400000): Promise<number> {
        const cutoff = Date.now() - olderThanMs;
        const jobs = await this.list(state);
        let cleaned = 0;

        for (const job of jobs) {
            if (job.updatedAt < cutoff) {
                await this.client.hdel(this.key('jobs'), job.id);
                await this.client.lrem(this.key(state), 0, job.id);
                cleaned++;
            }
        }

        return cleaned;
    }

    /**
     * Disconnect from Redis
     */
    async disconnect(): Promise<void> {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        if (this.client.quit) {
            await this.client.quit();
        } else if (this.client.disconnect) {
            await this.client.disconnect();
        }
    }
}

/**
 * Create a Redis queue store with automatic client creation
 * Requires 'ioredis' or 'redis' package to be installed
 * 
 * @example
 * ```typescript
 * const store = await createRedisQueueStore('emails', {
 *   host: 'localhost',
 *   port: 6379
 * });
 * 
 * const queue = new JobQueue('emails', { store });
 * ```
 */
export async function createRedisQueueStore<Data = any>(
    queueName: string,
    config: RedisQueueConfig = {}
): Promise<RedisQueueStore<Data>> {
    let client: RedisClientLike;

    // Try ioredis first
    try {
        const Redis = require('ioredis');
        client = new Redis({
            host: config.host ?? 'localhost',
            port: config.port ?? 6379,
            password: config.password,
            db: config.db ?? 0
        });
    } catch {
        // Try node-redis
        try {
            const { createClient } = require('redis');
            const url = config.url ?? `redis://${config.host ?? 'localhost'}:${config.port ?? 6379}`;
            
            client = createClient({
                url,
                password: config.password,
                database: config.db ?? 0
            });

            await (client as any).connect();
        } catch {
            throw new Error(
                'Redis client not found. Please install either "ioredis" or "redis" package:\n' +
                '  npm install ioredis\n' +
                '  # or\n' +
                '  npm install redis'
            );
        }
    }

    return new RedisQueueStore<Data>(queueName, { ...config, client });
}

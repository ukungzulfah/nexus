export type JobState = 'waiting' | 'delayed' | 'active' | 'completed' | 'failed' | 'paused';


export interface Job<Data = any, Result = any> {
    id: string;
    name: string;
    data: Data;
    result?: Result;
    error?: { message: string; stack?: string };
    state: JobState;
    attemptsMade: number;
    maxAttempts: number;
    priority: number;
    createdAt: number;
    runAt: number;
    updatedAt: number;
    metadata?: Record<string, any>;
}

export interface RetryOptions {
    attempts?: number;
    backoff?: 'fixed' | 'exponential';
    delay?: number;
    maxDelay?: number;
}

export interface RateLimitOptions {
    max: number;
    duration: number;
}

export interface QueueHooks<Data = any> {
    onComplete?: (job: Job<Data>, result: any) => void | Promise<void>;
    onFailed?: (job: Job<Data>, error: Error) => void | Promise<void>;
    onRetry?: (job: Job<Data>, attempt: number, delay: number) => void | Promise<void>;
}

export interface QueueOptions<Data = any> {
    concurrency?: number;
    retry?: RetryOptions;
    limiter?: RateLimitOptions;
    hooks?: QueueHooks<Data>;
    store?: QueueStore<Data>;
}

export interface EnqueueOptions {
    delay?: number;
    priority?: number;
    metadata?: Record<string, any>;
    attempts?: number;
}

export type JobHandler<Data = any, Result = any> = (job: Job<Data>) => Promise<Result>;

export interface QueueStore<Data = any> {
    enqueue(job: Job<Data>): Promise<void>;
    dequeue(): Promise<Job<Data> | undefined>;
    update(job: Job<Data>): Promise<void>;
    get(id: string): Promise<Job<Data> | undefined>;
    list(state?: JobState): Promise<Job<Data>[]>;
    stats(): Promise<QueueStats>;
}

export interface QueueStats {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
}
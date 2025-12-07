import { QueueStore, Job, JobState, QueueStats } from './types';

/**
 * Simple in-memory queue store implementation
 */


export class InMemoryQueueStore<Data = any> implements QueueStore<Data> {
    private jobs: Map<string, Job<Data>> = new Map();

    async enqueue(job: Job<Data>): Promise<void> {
        this.jobs.set(job.id, job);
    }

    async dequeue(): Promise<Job<Data> | undefined> {
        const candidates = Array.from(this.jobs.values())
            .filter(job => job.state === 'waiting' || (job.state === 'delayed' && job.runAt <= Date.now()))
            .sort((a, b) => {
                if (a.priority === b.priority) {
                    return a.runAt - b.runAt;
                }
                return b.priority - a.priority;
            });

        const job = candidates[0];
        if (!job) {
            return undefined;
        }

        job.state = 'active';
        job.updatedAt = Date.now();
        this.jobs.set(job.id, job);
        return job;
    }

    async update(job: Job<Data>): Promise<void> {
        this.jobs.set(job.id, job);
    }

    async get(id: string): Promise<Job<Data> | undefined> {
        return this.jobs.get(id);
    }

    async list(state?: JobState): Promise<Job<Data>[]> {
        if (!state) {
            return Array.from(this.jobs.values());
        }
        return Array.from(this.jobs.values()).filter(job => job.state === state);
    }

    async stats(): Promise<QueueStats> {
        const stats: QueueStats = {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0
        };

        for (const job of this.jobs.values()) {
            if (job.state in stats) {
                (stats as any)[job.state] += 1;
            }
        }

        return stats;
    }
}

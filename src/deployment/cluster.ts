/**
 * Cluster Manager
 * Provides multi-process clustering for high availability and performance
 */

import cluster, { Worker } from 'cluster';
import { cpus } from 'os';
import { EventEmitter } from 'events';

export interface ClusterOptions {
    /**
     * Number of worker processes
     * @default 'auto' (number of CPU cores)
     */
    workers?: number | 'auto';

    /**
     * Restart strategy for workers
     * @default 'rolling'
     */
    restartStrategy?: 'rolling' | 'all-at-once' | 'none';

    /**
     * Delay between worker restarts (ms)
     * @default 5000
     */
    restartDelay?: number;

    /**
     * Maximum restart attempts per worker
     * @default 10
     */
    maxRestarts?: number;

    /**
     * Time window for counting restarts (ms)
     * @default 60000
     */
    restartWindow?: number;

    /**
     * Callback when a worker starts
     */
    onWorkerStart?: (worker: Worker) => void;

    /**
     * Callback when a worker exits
     */
    onWorkerExit?: (worker: Worker, code: number, signal: string) => void;

    /**
     * Callback when a worker sends a message
     */
    onWorkerMessage?: (worker: Worker, message: any) => void;

    /**
     * Enable sticky sessions for WebSocket support
     * @default false
     */
    stickySessions?: boolean;

    /**
     * Enable verbose logging
     * @default false
     */
    verbose?: boolean;

    /**
     * Environment variables for workers
     */
    env?: Record<string, string>;
}

export interface WorkerInfo {
    id: number;
    pid: number;
    startTime: number;
    restartCount: number;
    lastRestartTime?: number;
    status: 'starting' | 'online' | 'listening' | 'disconnecting' | 'dead';
    memoryUsage?: NodeJS.MemoryUsage;
}

export interface ClusterStats {
    workers: WorkerInfo[];
    totalWorkers: number;
    activeWorkers: number;
    uptime: number;
    totalRestarts: number;
    isPrimary: boolean;
}

/**
 * Cluster Manager for multi-process deployment
 */
export class ClusterManager extends EventEmitter {
    private options: Required<ClusterOptions>;
    private workerRestarts: Map<number, { count: number; timestamps: number[] }> = new Map();
    private workerInfo: Map<number, WorkerInfo> = new Map();
    private startTime: number = Date.now();
    private isShuttingDown: boolean = false;

    constructor(options: ClusterOptions = {}) {
        super();
        const numCPUs = cpus().length;

        this.options = {
            workers: options.workers === 'auto' ? numCPUs : (options.workers ?? numCPUs),
            restartStrategy: options.restartStrategy ?? 'rolling',
            restartDelay: options.restartDelay ?? 5000,
            maxRestarts: options.maxRestarts ?? 10,
            restartWindow: options.restartWindow ?? 60000,
            onWorkerStart: options.onWorkerStart ?? (() => {}),
            onWorkerExit: options.onWorkerExit ?? (() => {}),
            onWorkerMessage: options.onWorkerMessage ?? (() => {}),
            stickySessions: options.stickySessions ?? false,
            verbose: options.verbose ?? false,
            env: options.env ?? {}
        };
    }

    /**
     * Check if current process is the primary/master
     */
    isPrimary(): boolean {
        return cluster.isPrimary || cluster.isMaster;
    }

    /**
     * Check if current process is a worker
     */
    isWorker(): boolean {
        return cluster.isWorker;
    }

    /**
     * Get current worker ID (only valid in worker process)
     */
    getWorkerId(): number | undefined {
        return cluster.worker?.id;
    }

    /**
     * Start the cluster
     */
    start(workerFn: () => void | Promise<void>): void {
        if (this.isPrimary()) {
            this.startPrimary();
        } else {
            this.startWorker(workerFn);
        }
    }

    /**
     * Start the primary process
     */
    private startPrimary(): void {
        const numWorkers = this.options.workers as number;
        this.log(`Primary ${process.pid} is running`);
        this.log(`Starting ${numWorkers} workers...`);

        // Fork workers
        for (let i = 0; i < numWorkers; i++) {
            this.forkWorker();
        }

        // Handle worker events
        cluster.on('online', (worker) => {
            this.updateWorkerStatus(worker.id, 'online');
            this.log(`Worker ${worker.id} (pid: ${worker.process.pid}) is online`);
            this.options.onWorkerStart(worker);
            this.emit('worker:online', worker);
        });

        cluster.on('listening', (worker, address) => {
            this.updateWorkerStatus(worker.id, 'listening');
            this.log(`Worker ${worker.id} is listening on ${address.port}`);
            this.emit('worker:listening', worker, address);
        });

        cluster.on('disconnect', (worker) => {
            this.updateWorkerStatus(worker.id, 'disconnecting');
            this.log(`Worker ${worker.id} disconnected`);
            this.emit('worker:disconnect', worker);
        });

        cluster.on('exit', (worker, code, signal) => {
            this.handleWorkerExit(worker, code, signal);
        });

        cluster.on('message', (worker, message) => {
            this.options.onWorkerMessage(worker, message);
            this.emit('worker:message', worker, message);
        });

        // Handle graceful shutdown
        process.on('SIGTERM', () => this.gracefulShutdown());
        process.on('SIGINT', () => this.gracefulShutdown());
    }

    /**
     * Start a worker process
     */
    private startWorker(workerFn: () => void | Promise<void>): void {
        this.log(`Worker ${cluster.worker?.id} (pid: ${process.pid}) starting...`);
        Promise.resolve(workerFn()).catch((err) => {
            console.error(`Worker ${cluster.worker?.id} failed to start:`, err);
            process.exit(1);
        });
    }

    /**
     * Fork a new worker
     */
    private forkWorker(): Worker {
        const worker = cluster.fork(this.options.env);

        this.workerInfo.set(worker.id, {
            id: worker.id,
            pid: worker.process.pid!,
            startTime: Date.now(),
            restartCount: 0,
            status: 'starting'
        });

        return worker;
    }

    /**
     * Handle worker exit
     */
    private handleWorkerExit(worker: Worker, code: number, signal: string): void {
        this.updateWorkerStatus(worker.id, 'dead');
        this.log(`Worker ${worker.id} exited (code: ${code}, signal: ${signal})`);
        this.options.onWorkerExit(worker, code, signal);
        this.emit('worker:exit', worker, code, signal);

        // Don't restart if shutting down
        if (this.isShuttingDown) {
            return;
        }

        // Check restart limits
        if (!this.canRestart(worker.id)) {
            this.log(`Worker ${worker.id} exceeded restart limit, not restarting`);
            this.emit('worker:restart-limit', worker.id);
            return;
        }

        // Restart based on strategy
        if (this.options.restartStrategy !== 'none') {
            this.scheduleRestart(worker.id);
        }
    }

    /**
     * Check if worker can be restarted
     */
    private canRestart(workerId: number): boolean {
        const now = Date.now();
        const restartInfo = this.workerRestarts.get(workerId) || { count: 0, timestamps: [] };

        // Clean old timestamps
        restartInfo.timestamps = restartInfo.timestamps.filter(
            (t) => now - t < this.options.restartWindow
        );

        return restartInfo.timestamps.length < this.options.maxRestarts;
    }

    /**
     * Schedule worker restart
     */
    private scheduleRestart(workerId: number): void {
        const delay = this.options.restartStrategy === 'rolling' ? this.options.restartDelay : 0;

        this.log(`Scheduling restart for worker ${workerId} in ${delay}ms`);

        setTimeout(() => {
            if (this.isShuttingDown) return;

            const restartInfo = this.workerRestarts.get(workerId) || { count: 0, timestamps: [] };
            restartInfo.count++;
            restartInfo.timestamps.push(Date.now());
            this.workerRestarts.set(workerId, restartInfo);

            const newWorker = this.forkWorker();
            const info = this.workerInfo.get(newWorker.id);
            if (info) {
                info.restartCount = restartInfo.count;
                info.lastRestartTime = Date.now();
            }

            this.log(`Restarted worker ${workerId} as worker ${newWorker.id}`);
            this.emit('worker:restart', newWorker, workerId);
        }, delay);
    }

    /**
     * Update worker status
     */
    private updateWorkerStatus(workerId: number, status: WorkerInfo['status']): void {
        const info = this.workerInfo.get(workerId);
        if (info) {
            info.status = status;
        }
    }

    /**
     * Send message to all workers
     */
    broadcast(message: any): void {
        if (!this.isPrimary()) return;

        for (const id in cluster.workers) {
            const worker = cluster.workers[id];
            if (worker) {
                worker.send(message);
            }
        }
    }

    /**
     * Send message to specific worker
     */
    sendToWorker(workerId: number, message: any): boolean {
        if (!this.isPrimary()) return false;

        const worker = cluster.workers?.[workerId];
        if (worker) {
            worker.send(message);
            return true;
        }
        return false;
    }

    /**
     * Rolling restart all workers
     */
    async rollingRestart(): Promise<void> {
        if (!this.isPrimary()) return;

        this.log('Starting rolling restart...');
        const workerIds = Object.keys(cluster.workers || {}).map(Number);

        for (const id of workerIds) {
            const worker = cluster.workers?.[id];
            if (worker) {
                // Fork new worker first
                const newWorker = this.forkWorker();

                // Wait for new worker to be listening
                await new Promise<void>((resolve) => {
                    const onListening = (w: Worker) => {
                        if (w.id === newWorker.id) {
                            cluster.off('listening', onListening);
                            resolve();
                        }
                    };
                    cluster.on('listening', onListening);

                    // Timeout after 30 seconds
                    setTimeout(resolve, 30000);
                });

                // Gracefully kill old worker
                worker.disconnect();

                // Wait for restart delay
                await new Promise((resolve) => setTimeout(resolve, this.options.restartDelay));
            }
        }

        this.log('Rolling restart complete');
        this.emit('cluster:rolling-restart-complete');
    }

    /**
     * Get cluster statistics
     */
    getStats(): ClusterStats {
        const workers: WorkerInfo[] = [];
        let activeWorkers = 0;
        let totalRestarts = 0;

        for (const [id, info] of this.workerInfo) {
            // Update memory usage if worker is alive
            const worker = cluster.workers?.[id];
            if (worker) {
                activeWorkers++;
            }
            workers.push({ ...info });
            totalRestarts += info.restartCount;
        }

        return {
            workers,
            totalWorkers: this.workerInfo.size,
            activeWorkers,
            uptime: Date.now() - this.startTime,
            totalRestarts,
            isPrimary: this.isPrimary()
        };
    }

    /**
     * Graceful shutdown of all workers
     */
    async gracefulShutdown(): Promise<void> {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        this.log('Initiating graceful shutdown...');
        this.emit('cluster:shutdown:start');

        const workers = Object.values(cluster.workers || {}).filter(Boolean) as Worker[];

        // Disconnect all workers
        for (const worker of workers) {
            worker.disconnect();
        }

        // Wait for all workers to exit (with timeout)
        await Promise.race([
            Promise.all(
                workers.map(
                    (worker) =>
                        new Promise<void>((resolve) => {
                            if (worker.isDead()) {
                                resolve();
                            } else {
                                worker.on('exit', () => resolve());
                            }
                        })
                )
            ),
            new Promise((resolve) => setTimeout(resolve, 30000))
        ]);

        this.log('All workers shut down');
        this.emit('cluster:shutdown:complete');

        process.exit(0);
    }

    private log(message: string): void {
        if (this.options.verbose) {
            const prefix = this.isPrimary() ? '[Primary]' : `[Worker ${cluster.worker?.id}]`;
            console.log(`${prefix} ${message}`);
        }
    }
}

/**
 * Create a cluster manager
 */
export function createCluster(options?: ClusterOptions): ClusterManager {
    return new ClusterManager(options);
}

/**
 * Simple cluster helper for common use case
 */
export function runClustered(
    workerFn: () => void | Promise<void>,
    options?: ClusterOptions
): ClusterManager {
    const manager = createCluster(options);
    manager.start(workerFn);
    return manager;
}

/**
 * Graceful Shutdown Manager
 * Handles zero-downtime deployment with proper connection draining
 */

import { Server } from 'http';
import { EventEmitter } from 'events';

export interface ShutdownHook {
    name: string;
    handler: () => Promise<void>;
    timeout?: number;
    priority?: number; // Higher priority runs first
}

export interface GracefulShutdownOptions {
    /**
     * Maximum time to wait for ongoing requests to complete (ms)
     * @default 30000
     */
    timeout?: number;

    /**
     * Whether to stop accepting new connections immediately
     * @default true
     */
    stopAcceptingConnections?: boolean;

    /**
     * Signals to listen for shutdown
     * @default ['SIGTERM', 'SIGINT']
     */
    signals?: NodeJS.Signals[];

    /**
     * Custom health check during shutdown
     */
    healthCheck?: () => Promise<{ status: 'healthy' | 'unhealthy' | 'draining'; details?: Record<string, any> }>;

    /**
     * Hooks to run during shutdown (closing DB connections, etc.)
     */
    hooks?: ShutdownHook[];

    /**
     * Callback when shutdown is initiated
     */
    onShutdownStart?: () => void | Promise<void>;

    /**
     * Callback when shutdown is complete
     */
    onShutdownComplete?: () => void | Promise<void>;

    /**
     * Enable verbose logging
     * @default false
     */
    verbose?: boolean;
}

export interface ActiveConnection {
    id: string;
    startTime: number;
    path?: string;
    method?: string;
}

/**
 * Graceful Shutdown Manager
 * Ensures zero-downtime deployments by:
 * 1. Stopping new connections
 * 2. Waiting for ongoing requests to complete
 * 3. Running cleanup hooks in order
 * 4. Closing the server gracefully
 */
export class GracefulShutdownManager extends EventEmitter {
    private server?: Server;
    private options: Required<GracefulShutdownOptions>;
    private isShuttingDown: boolean = false;
    private activeConnections: Map<string, ActiveConnection> = new Map();
    private hooks: ShutdownHook[] = [];
    private connectionCounter: number = 0;
    private shutdownPromise?: Promise<void>;

    constructor(options: GracefulShutdownOptions = {}) {
        super();
        this.options = {
            timeout: options.timeout ?? 30000,
            stopAcceptingConnections: options.stopAcceptingConnections ?? true,
            signals: options.signals ?? ['SIGTERM', 'SIGINT'],
            healthCheck: options.healthCheck ?? (async () => ({ status: 'healthy' as const })),
            hooks: options.hooks ?? [],
            onShutdownStart: options.onShutdownStart ?? (() => {}),
            onShutdownComplete: options.onShutdownComplete ?? (() => {}),
            verbose: options.verbose ?? false
        };

        this.hooks = [...this.options.hooks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }

    /**
     * Attach to an HTTP server
     */
    attach(server: Server): this {
        this.server = server;

        // Register signal handlers
        for (const signal of this.options.signals) {
            process.on(signal, () => {
                this.log(`Received ${signal}, initiating graceful shutdown...`);
                this.shutdown();
            });
        }

        // Track connections
        server.on('connection', (socket) => {
            const connectionId = `conn_${++this.connectionCounter}`;
            (socket as any).__connectionId = connectionId;

            socket.on('close', () => {
                this.activeConnections.delete(connectionId);
            });
        });

        return this;
    }

    /**
     * Register a connection as active (called when request starts)
     */
    trackRequest(_connectionId: string, info: { path?: string; method?: string }): string {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.activeConnections.set(requestId, {
            id: requestId,
            startTime: Date.now(),
            path: info.path,
            method: info.method
        });
        return requestId;
    }

    /**
     * Mark a request as complete
     */
    untrackRequest(requestId: string): void {
        this.activeConnections.delete(requestId);
    }

    /**
     * Add a shutdown hook
     */
    addHook(hook: ShutdownHook): this {
        this.hooks.push(hook);
        this.hooks.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
        return this;
    }

    /**
     * Check if shutdown is in progress
     */
    isInShutdown(): boolean {
        return this.isShuttingDown;
    }

    /**
     * Get the current health status
     */
    async getHealthStatus(): Promise<{ status: 'healthy' | 'unhealthy' | 'draining'; details?: Record<string, any> }> {
        if (this.isShuttingDown) {
            return {
                status: 'draining',
                details: {
                    activeConnections: this.activeConnections.size,
                    shutdownInProgress: true
                }
            };
        }
        return this.options.healthCheck();
    }

    /**
     * Get active connections count
     */
    getActiveConnectionsCount(): number {
        return this.activeConnections.size;
    }

    /**
     * Get active connections details
     */
    getActiveConnections(): ActiveConnection[] {
        return Array.from(this.activeConnections.values());
    }

    /**
     * Initiate graceful shutdown
     */
    async shutdown(): Promise<void> {
        if (this.shutdownPromise) {
            return this.shutdownPromise;
        }

        this.isShuttingDown = true;
        this.emit('shutdown:start');

        this.shutdownPromise = this.performShutdown();
        return this.shutdownPromise;
    }

    private async performShutdown(): Promise<void> {
        const startTime = Date.now();

        try {
            // Notify shutdown start
            await this.options.onShutdownStart();
            this.log('Shutdown initiated');

            // Stop accepting new connections
            if (this.server && this.options.stopAcceptingConnections) {
                await this.stopAcceptingConnections();
            }

            // Wait for active connections to drain
            await this.drainConnections();

            // Run shutdown hooks
            await this.runHooks();

            // Close server
            if (this.server) {
                await this.closeServer();
            }

            const duration = Date.now() - startTime;
            this.log(`Shutdown completed in ${duration}ms`);

            await this.options.onShutdownComplete();
            this.emit('shutdown:complete', { duration });

        } catch (error) {
            this.log(`Shutdown error: ${error}`);
            this.emit('shutdown:error', error);
            throw error;
        } finally {
            // Force exit if still running after timeout
            setTimeout(() => {
                this.log('Forcing exit after timeout');
                process.exit(1);
            }, 5000).unref();

            process.exit(0);
        }
    }

    private async stopAcceptingConnections(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.server) {
                resolve();
                return;
            }

            this.server.on('request', (_req, res) => {
                // Return 503 for new requests during shutdown
                res.writeHead(503, {
                    'Content-Type': 'application/json',
                    'Connection': 'close',
                    'Retry-After': '30'
                });
                res.end(JSON.stringify({
                    error: 'Service Unavailable',
                    message: 'Server is shutting down',
                    retryAfter: 30
                }));
            });

            this.log('Stopped accepting new connections');
            resolve();
        });
    }

    private async drainConnections(): Promise<void> {
        const startTime = Date.now();
        const checkInterval = 100; // Check every 100ms

        this.log(`Waiting for ${this.activeConnections.size} active connections to drain...`);

        return new Promise((resolve) => {
            const check = () => {
                const elapsed = Date.now() - startTime;

                if (this.activeConnections.size === 0) {
                    this.log('All connections drained');
                    resolve();
                    return;
                }

                if (elapsed >= this.options.timeout) {
                    this.log(`Timeout reached with ${this.activeConnections.size} connections still active`);
                    // Log remaining connections
                    for (const conn of this.activeConnections.values()) {
                        this.log(`  - ${conn.method} ${conn.path} (started ${Date.now() - conn.startTime}ms ago)`);
                    }
                    resolve();
                    return;
                }

                setTimeout(check, checkInterval);
            };

            check();
        });
    }

    private async runHooks(): Promise<void> {
        this.log(`Running ${this.hooks.length} shutdown hooks...`);

        for (const hook of this.hooks) {
            const hookTimeout = hook.timeout ?? 10000;
            const startTime = Date.now();

            try {
                this.log(`Running hook: ${hook.name}`);

                await Promise.race([
                    hook.handler(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Hook timeout: ${hook.name}`)), hookTimeout)
                    )
                ]);

                const duration = Date.now() - startTime;
                this.log(`Hook completed: ${hook.name} (${duration}ms)`);

            } catch (error: any) {
                this.log(`Hook failed: ${hook.name} - ${error.message}`);
                this.emit('hook:error', { hook: hook.name, error });
            }
        }
    }

    private async closeServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }

            this.server.close((err) => {
                if (err) {
                    this.log(`Error closing server: ${err.message}`);
                    reject(err);
                } else {
                    this.log('Server closed');
                    resolve();
                }
            });
        });
    }

    private log(message: string): void {
        if (this.options.verbose) {
            console.log(`[GracefulShutdown] ${message}`);
        }
    }
}

/**
 * Create a graceful shutdown manager
 */
export function createGracefulShutdown(options?: GracefulShutdownOptions): GracefulShutdownManager {
    return new GracefulShutdownManager(options);
}

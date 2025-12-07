/**
 * Mock server for testing external API calls
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { parse as parseUrl } from 'url';
import { EventEmitter } from 'events';

export interface MockServerRoute {
    method: string;
    path: string | RegExp;
    handler: MockServerHandler;
    delay?: number;
    times?: number;
    callCount: number;
}

export interface MockServerRequest {
    method: string;
    path: string;
    query: Record<string, string | string[]>;
    headers: Record<string, string | string[] | undefined>;
    body: any;
    params: Record<string, string>;
}

export interface MockServerResponse {
    status?: number;
    headers?: Record<string, string>;
    body?: any;
}

export type MockServerHandler = (req: MockServerRequest) => MockServerResponse | Promise<MockServerResponse>;

/**
 * Mock HTTP server for testing
 */
export class MockServer extends EventEmitter {
    private server?: Server;
    private routes: MockServerRoute[] = [];
    private requests: MockServerRequest[] = [];
    private port?: number;
    private host: string = '127.0.0.1';

    /**
     * Register a GET route
     */
    get(path: string | RegExp, handler: MockServerHandler): MockRouteConfig {
        return this.route('GET', path, handler);
    }

    /**
     * Register a POST route
     */
    post(path: string | RegExp, handler: MockServerHandler): MockRouteConfig {
        return this.route('POST', path, handler);
    }

    /**
     * Register a PUT route
     */
    put(path: string | RegExp, handler: MockServerHandler): MockRouteConfig {
        return this.route('PUT', path, handler);
    }

    /**
     * Register a PATCH route
     */
    patch(path: string | RegExp, handler: MockServerHandler): MockRouteConfig {
        return this.route('PATCH', path, handler);
    }

    /**
     * Register a DELETE route
     */
    delete(path: string | RegExp, handler: MockServerHandler): MockRouteConfig {
        return this.route('DELETE', path, handler);
    }

    /**
     * Register a route for any method
     */
    any(path: string | RegExp, handler: MockServerHandler): MockRouteConfig {
        return this.route('*', path, handler);
    }

    /**
     * Register a route
     */
    route(method: string, path: string | RegExp, handler: MockServerHandler): MockRouteConfig {
        const route: MockServerRoute = {
            method: method.toUpperCase(),
            path,
            handler,
            callCount: 0
        };
        this.routes.push(route);
        return new MockRouteConfig(route);
    }

    /**
     * Start the server
     */
    async start(port: number = 0): Promise<string> {
        return new Promise((resolve, reject) => {
            this.server = createServer(async (req, res) => {
                try {
                    await this.handleRequest(req, res);
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Internal server error' }));
                }
            });

            this.server.on('error', reject);

            this.server.listen(port, this.host, () => {
                const addr = this.server!.address();
                if (typeof addr === 'object' && addr) {
                    this.port = addr.port;
                    resolve(`http://${this.host}:${this.port}`);
                }
            });
        });
    }

    /**
     * Stop the server
     */
    async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }

            this.server.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Get the server URL
     */
    get url(): string {
        if (!this.port) {
            throw new Error('Server not started');
        }
        return `http://${this.host}:${this.port}`;
    }

    /**
     * Get all requests received
     */
    getRequests(): MockServerRequest[] {
        return [...this.requests];
    }

    /**
     * Check if a path was called
     */
    wasCalled(path: string | RegExp, method?: string): boolean {
        return this.requests.some(req => {
            if (method && req.method !== method.toUpperCase()) {
                return false;
            }
            if (typeof path === 'string') {
                return req.path === path;
            }
            return path.test(req.path);
        });
    }

    /**
     * Get call count for a path
     */
    callCount(path: string | RegExp, method?: string): number {
        return this.requests.filter(req => {
            if (method && req.method !== method.toUpperCase()) {
                return false;
            }
            if (typeof path === 'string') {
                return req.path === path;
            }
            return path.test(req.path);
        }).length;
    }

    /**
     * Reset all routes and requests
     */
    reset(): void {
        this.routes = [];
        this.requests = [];
    }

    /**
     * Clear just the request history
     */
    clearRequests(): void {
        this.requests = [];
        for (const route of this.routes) {
            route.callCount = 0;
        }
    }

    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const parsed = parseUrl(req.url || '', true);
        const path = parsed.pathname || '/';
        const method = req.method?.toUpperCase() || 'GET';

        // Parse body
        const body = await this.parseBody(req);

        // Find matching route
        let matchedRoute: MockServerRoute | undefined;
        let params: Record<string, string> = {};

        for (const route of this.routes) {
            if (route.method !== '*' && route.method !== method) {
                continue;
            }

            // Check times limit
            if (route.times !== undefined && route.callCount >= route.times) {
                continue;
            }

            if (typeof route.path === 'string') {
                const paramMatch = this.matchPath(route.path, path);
                if (paramMatch) {
                    matchedRoute = route;
                    params = paramMatch;
                    break;
                }
            } else if (route.path.test(path)) {
                matchedRoute = route;
                break;
            }
        }

        const mockRequest: MockServerRequest = {
            method,
            path,
            query: parsed.query as Record<string, string | string[]>,
            headers: req.headers,
            body,
            params
        };

        this.requests.push(mockRequest);
        this.emit('request', mockRequest);

        if (!matchedRoute) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found', path, method }));
            return;
        }

        matchedRoute.callCount++;

        // Apply delay if configured
        if (matchedRoute.delay) {
            await new Promise(resolve => setTimeout(resolve, matchedRoute.delay));
        }

        try {
            const response = await matchedRoute.handler(mockRequest);
            const status = response.status ?? 200;
            const headers = {
                'Content-Type': 'application/json',
                ...response.headers
            };

            res.writeHead(status, headers);

            if (response.body !== undefined) {
                const bodyString = typeof response.body === 'string'
                    ? response.body
                    : JSON.stringify(response.body);
                res.end(bodyString);
            } else {
                res.end();
            }
        } catch (error: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    }

    private async parseBody(req: IncomingMessage): Promise<any> {
        return new Promise((resolve) => {
            const chunks: Buffer[] = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf-8');
                if (!raw) {
                    resolve(undefined);
                    return;
                }

                const contentType = req.headers['content-type'] || '';
                if (contentType.includes('application/json')) {
                    try {
                        resolve(JSON.parse(raw));
                    } catch {
                        resolve(raw);
                    }
                } else {
                    resolve(raw);
                }
            });
        });
    }

    private matchPath(pattern: string, path: string): Record<string, string> | null {
        // Handle exact match
        if (pattern === path) {
            return {};
        }

        // Handle path parameters like /users/:id
        const patternParts = pattern.split('/');
        const pathParts = path.split('/');

        if (patternParts.length !== pathParts.length) {
            return null;
        }

        const params: Record<string, string> = {};

        for (let i = 0; i < patternParts.length; i++) {
            const patternPart = patternParts[i];
            const pathPart = pathParts[i];

            if (patternPart.startsWith(':')) {
                params[patternPart.slice(1)] = pathPart;
            } else if (patternPart === '*') {
                // Wildcard matches anything
                continue;
            } else if (patternPart !== pathPart) {
                return null;
            }
        }

        return params;
    }
}

/**
 * Route configuration builder
 */
class MockRouteConfig {
    private route: MockServerRoute;

    constructor(route: MockServerRoute) {
        this.route = route;
    }

    /**
     * Add delay before responding
     */
    delay(ms: number): this {
        this.route.delay = ms;
        return this;
    }

    /**
     * Limit how many times this route responds
     */
    times(count: number): this {
        this.route.times = count;
        return this;
    }
}

/**
 * Create a mock server
 */
export function createMockServer(): MockServer {
    return new MockServer();
}

// ============================================================================
// Convenience helpers for common mock responses
// ============================================================================

export const mockResponses = {
    /**
     * Return JSON response
     */
    json: (data: any, status: number = 200): MockServerHandler => {
        return () => ({ status, body: data });
    },

    /**
     * Return empty success response
     */
    ok: (): MockServerHandler => {
        return () => ({ status: 200 });
    },

    /**
     * Return created response
     */
    created: (data?: any): MockServerHandler => {
        return () => ({ status: 201, body: data });
    },

    /**
     * Return no content response
     */
    noContent: (): MockServerHandler => {
        return () => ({ status: 204 });
    },

    /**
     * Return bad request response
     */
    badRequest: (message: string = 'Bad request'): MockServerHandler => {
        return () => ({ status: 400, body: { error: message } });
    },

    /**
     * Return unauthorized response
     */
    unauthorized: (message: string = 'Unauthorized'): MockServerHandler => {
        return () => ({ status: 401, body: { error: message } });
    },

    /**
     * Return forbidden response
     */
    forbidden: (message: string = 'Forbidden'): MockServerHandler => {
        return () => ({ status: 403, body: { error: message } });
    },

    /**
     * Return not found response
     */
    notFound: (message: string = 'Not found'): MockServerHandler => {
        return () => ({ status: 404, body: { error: message } });
    },

    /**
     * Return internal server error
     */
    serverError: (message: string = 'Internal server error'): MockServerHandler => {
        return () => ({ status: 500, body: { error: message } });
    },

    /**
     * Echo the request back
     */
    echo: (): MockServerHandler => {
        return (req) => ({
            status: 200,
            body: {
                method: req.method,
                path: req.path,
                query: req.query,
                headers: req.headers,
                body: req.body,
                params: req.params
            }
        });
    },

    /**
     * Paginated response helper
     */
    paginated: <T>(
        items: T[],
        pageSize: number = 10
    ): MockServerHandler => {
        return (req) => {
            const page = parseInt(req.query.page as string, 10) || 1;
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const paginatedItems = items.slice(start, end);

            return {
                status: 200,
                body: {
                    data: paginatedItems,
                    meta: {
                        page,
                        pageSize,
                        total: items.length,
                        totalPages: Math.ceil(items.length / pageSize)
                    }
                }
            };
        };
    }
};

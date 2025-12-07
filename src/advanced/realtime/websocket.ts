import { IncomingMessage, Server as HTTPServer } from 'http';
import { parse as parseUrl } from 'url';
import { EventEmitter } from 'events';

let WebSocket: any;
let WebSocketServer: any;
let RawData: any;

try {
    const wsModule = require('ws');
    WebSocket = wsModule.default || wsModule;
    WebSocketServer = wsModule.WebSocketServer;
    RawData = wsModule.RawData;
} catch (error) {
    // ws module not installed
}

export interface WebSocketContext {
    path: string;
    query: Record<string, string | string[]>;
    headers: IncomingMessage['headers'];
    user?: any;
    metadata?: Record<string, any>;
    raw: {
        req: IncomingMessage;
    };
}

export interface WebSocketRouteConfig {
    auth?: (ctx: WebSocketContext) => Promise<any>;
    beforeConnect?: (socket: WebSocket, ctx: WebSocketContext) => Promise<void>;
    onConnect?: (socket: WebSocket, ctx: WebSocketContext) => Promise<void>;
    onMessage?: (socket: WebSocket, message: any, ctx: WebSocketContext) => Promise<void>;
    onClose?: (socket: WebSocket, ctx: WebSocketContext, code: number, reason?: Buffer) => Promise<void>;
    onError?: (socket: WebSocket, error: Error, ctx: WebSocketContext) => Promise<void>;
    rooms?: boolean;
}

export interface WebSocketRoute extends WebSocketRouteConfig {
    path: string;
}

export interface ConnectionState {
    ctx: WebSocketContext;
    route: WebSocketRoute;
}

/**
 * WebSocket gateway with room management and authentication hooks
 */
export class WebSocketGateway extends EventEmitter {
    private routes: Map<string, WebSocketRoute> = new Map();
    private wss?: any;
    private connections: WeakMap<any, ConnectionState> = new WeakMap();
    private rooms: Map<string, Set<any>> = new Map();
    private socketRooms: WeakMap<any, Set<string>> = new WeakMap();

    register(path: string, config: WebSocketRouteConfig) {
        if (!path.startsWith('/')) {
            throw new Error('WebSocket route path must start with "/"');
        }
        this.routes.set(path, { ...config, path });
    }

    attach(server: HTTPServer) {
        if (this.wss) {
            return;
        }

        if (!WebSocketServer) {
            throw new Error(
                'WebSocket support requires the "ws" package to be installed.\n' +
                'Install it with: npm install ws\n' +
                'Or if using the CLI: nexus create my-app --skip-install && npm install'
            );
        }

        this.wss = new WebSocketServer({ noServer: true });

        server.on('upgrade', async (req, socket, head) => {
            try {
                const pathname = parseUrl(req.url || '').pathname || '/';
                const route = this.routes.get(pathname);

                if (!route) {
                    socket.destroy();
                    return;
                }

                const ctx = this.createContext(req, pathname);
                if (route.auth) {
                    ctx.user = await route.auth(ctx);
                }

                this.wss!.handleUpgrade(req, socket, head, (ws: WebSocket) => {
                    this.bindConnection(ws, route, ctx);
                });
            } catch (error) {
                socket.destroy();
            }
        });
    }

    broadcast(room: string, payload: any) {
        const sockets = this.rooms.get(room);
        if (!sockets) return;

        for (const socket of sockets) {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(payload));
            }
        }
    }

    createRoom(name: string) {
        if (!this.rooms.has(name)) {
            this.rooms.set(name, new Set());
        }
    }

    joinRoom(room: string, socket: WebSocket) {
        this.createRoom(room);
        const sockets = this.rooms.get(room)!;
        sockets.add(socket);

        const joinedRooms = this.socketRooms.get(socket) ?? new Set<string>();
        joinedRooms.add(room);
        this.socketRooms.set(socket, joinedRooms);
    }

    leaveRoom(room: string, socket: WebSocket) {
        const sockets = this.rooms.get(room);
        if (!sockets) return;
        sockets.delete(socket);

        const joinedRooms = this.socketRooms.get(socket);
        joinedRooms?.delete(room);
    }

    private bindConnection(socket: any, route: WebSocketRoute, ctx: WebSocketContext) {
        this.connections.set(socket, { ctx, route });
        this.emit('connection', socket, ctx);

        socket.on('message', async (data: any) => {
            try {
                const payload = this.parseMessage(data);
                await route.onMessage?.(socket, payload, ctx);
                this.emit('message', socket, payload, ctx);
            } catch (error) {
                await route.onError?.(socket, error as Error, ctx);
                this.emit('error', error, socket, ctx);
            }
        });

        socket.on('close', async (code: number, buffer: Buffer) => {
            await route.onClose?.(socket, ctx, code, buffer);
            this.cleanupSocket(socket);
            this.emit('close', socket, ctx);
        });

        socket.on('error', async (error: Error) => {
            await route.onError?.(socket, error, ctx);
            this.emit('error', error, socket, ctx);
        });

        void (async () => {
            if (route.beforeConnect) {
                await route.beforeConnect(socket, ctx);
            }
            await route.onConnect?.(socket, ctx);
        })();
    }

    private createContext(req: IncomingMessage, path: string): WebSocketContext {
        const parsed = parseUrl(req.url || '', true);
        return {
            path,
            query: parsed.query as Record<string, string | string[]>,
            headers: req.headers,
            raw: { req }
        };
    }

    private parseMessage(data: any): any {
        if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
            const stringPayload = buffer.toString('utf-8');
            try {
                return JSON.parse(stringPayload);
            } catch {
                return stringPayload;
            }
        }

        if (Array.isArray(data)) {
            return data.map((item): any => this.parseMessage(item));
        }

        // Handle string case
        try {
            return JSON.parse(data as string);
        } catch {
            return data as string;
        }
    }

    private cleanupSocket(socket: any) {
        const rooms = this.socketRooms.get(socket);
        if (rooms) {
            for (const room of rooms) {
                this.rooms.get(room)?.delete(socket);
            }
        }
        this.socketRooms.delete(socket);
        this.connections.delete(socket);
    }

    /**
     * Helper object to expose room operations in a structured way
     */
    get roomManager() {
        return {
            create: (name: string) => this.createRoom(name),
            join: (name: string, socket: WebSocket) => this.joinRoom(name, socket),
            leave: (name: string, socket: WebSocket) => this.leaveRoom(name, socket),
            broadcast: (name: string, payload: any) => this.broadcast(name, payload),
            list: () => Array.from(this.rooms.keys())
        };
    }
}


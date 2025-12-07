/**
 * Context implementation
 * Provides a unified request/response context with immutable properties
 */

import { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import { parse as parseQueryString } from 'querystring';
import {
    Context,
    Headers,
    Cookies,
    CookieOptions,
    ResponseBuilder,
    Response,
    HTTPMethod
} from './types';
import { ContextStore, StoreConstructor, StoreRegistry, RequestStore, RequestStoreConstructor, RequestStoreRegistry } from './store';

/**
 * Cookie manager implementation
 */
class CookieManager implements Cookies {
    private cookies: Map<string, string>;
    private setCookies: Array<{ name: string; value: string; options?: CookieOptions }> = [];

    constructor(cookieHeader?: string) {
        this.cookies = new Map();
        if (cookieHeader) {
            const pairs = cookieHeader.split(';');
            for (const pair of pairs) {
                const [name, value] = pair.trim().split('=');
                if (name && value) {
                    this.cookies.set(name, decodeURIComponent(value));
                }
            }
        }
    }

    get(name: string): string | undefined {
        return this.cookies.get(name);
    }

    set(name: string, value: string, options?: CookieOptions): void {
        this.cookies.set(name, value);
        this.setCookies.push({ name, value, options });
    }

    delete(name: string): void {
        this.cookies.delete(name);
        this.setCookies.push({
            name,
            value: '',
            options: { expires: new Date(0) }
        });
    }

    getSetCookieHeaders(): string[] {
        return this.setCookies.map(({ name, value, options }) => {
            let cookie = `${name}=${encodeURIComponent(value)}`;

            if (options) {
                if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`;
                if (options.expires) cookie += `; Expires=${options.expires.toUTCString()}`;
                if (options.path) cookie += `; Path=${options.path}`;
                if (options.domain) cookie += `; Domain=${options.domain}`;
                if (options.secure) cookie += '; Secure';
                if (options.httpOnly) cookie += '; HttpOnly';
                if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;
            }

            return cookie;
        });
    }
}

/**
 * Response builder implementation
 */
class ResponseBuilderImpl implements ResponseBuilder {
    private _status: number = 200;
    private _headers: Headers = {};

    status(code: number): ResponseBuilder {
        this._status = code;
        return this;
    }

    header(name: string, value: string): ResponseBuilder {
        this._headers[name] = value;
        return this;
    }

    json<T>(data: T): Response {
        return {
            statusCode: this._status,
            headers: {
                ...this._headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        };
    }

    html(content: string): Response {
        return {
            statusCode: this._status,
            headers: {
                ...this._headers,
                'Content-Type': 'text/html; charset=utf-8'
            },
            body: content
        };
    }

    text(content: string): Response {
        return {
            statusCode: this._status,
            headers: {
                ...this._headers,
                'Content-Type': 'text/plain; charset=utf-8'
            },
            body: content
        };
    }

    redirect(url: string, status: number = 302): Response {
        return {
            statusCode: status,
            headers: {
                ...this._headers,
                'Location': url
            },
            body: ''
        };
    }

    stream(readable: NodeJS.ReadableStream): Response {
        return {
            statusCode: this._status,
            headers: this._headers,
            body: null,
            stream: readable
        };
    }
}

/**
 * Context implementation
 */
export class ContextImpl implements Context {
    method: HTTPMethod;
    path: string;
    url: URL;
    params: Record<string, string> = {};
    query: Record<string, any> = {};
    body: any = null;
    headers: Headers;
    cookies: Cookies;
    raw: { req: IncomingMessage; res: ServerResponse };
    response: ResponseBuilder;
    
    // Store registry reference (set by Application)
    private _storeRegistry?: StoreRegistry;
    
    // Request-scoped store registry (created per request)
    private _requestStoreRegistry: RequestStoreRegistry;
    
    // Request-scoped simple key-value storage
    private _data: Map<string, any> = new Map();
    
    // Debug mode
    private _debug: boolean = false;

    constructor(req: IncomingMessage, res: ServerResponse) {
        this.raw = { req, res };

        // Parse method
        this.method = (req.method?.toUpperCase() || 'GET') as HTTPMethod;

        // Parse URL and query
        const parsedUrl = parseUrl(req.url || '/', true);
        this.path = parsedUrl.pathname || '/';
        this.url = new URL(this.path, `http://${req.headers.host || 'localhost'}`);
        this.query = parsedUrl.query as Record<string, any>;

        // Parse headers
        this.headers = req.headers as Headers;

        // Parse cookies
        this.cookies = new CookieManager(req.headers.cookie);

        // Create response builder
        this.response = new ResponseBuilderImpl();
        
        // Create request-scoped store registry
        this._requestStoreRegistry = new RequestStoreRegistry(this._debug);
    }

    // Convenience methods
    json<T>(data: T, status?: number): Response {
        if (status !== undefined) {
            return this.response.status(status).json(data);
        }
        return this.response.json(data);
    }

    html(content: string, status?: number): Response {
        if (status !== undefined) {
            return this.response.status(status).html(content);
        }
        return this.response.html(content);
    }

    text(content: string, status?: number): Response {
        if (status !== undefined) {
            return this.response.status(status).text(content);
        }
        return this.response.text(content);
    }

    redirect(url: string, status?: number): Response {
        return this.response.redirect(url, status);
    }

    stream(readable: NodeJS.ReadableStream): Response {
        return this.response.stream(readable);
    }

    /**
     * Access a registered global store by its class
     * Store persist across all requests (singleton)
     * 
     * @param StoreClass - Store constructor class
     * @returns Store instance
     * 
     * @example
     * ```typescript
     * app.get('/users', async (ctx) => {
     *   const userStore = ctx.store(UserStore);
     *   return { users: userStore.state.users };
     * });
     * ```
     */
    store<T extends ContextStore<any>>(StoreClass: StoreConstructor<T>): T {
        if (!this._storeRegistry) {
            throw new Error(
                '[Context] Store registry not initialized. ' +
                'Make sure to call app.stores([...]) before accessing stores.'
            );
        }
        return this._storeRegistry.get(StoreClass);
    }

    /**
     * Access a request-scoped store by its class
     * Store only exists for this request, disposed after response
     * 
     * @param StoreClass - RequestStore constructor class
     * @returns Store instance (created on first access)
     * 
     * @example
     * ```typescript
     * class CheckoutStore extends RequestStore<CheckoutState> {
     *   protected initial() { return { items: [], total: 0 }; }
     *   
     *   addItem(item: Item) {
     *     this.update({ 
     *       items: [...this.state.items, item],
     *       total: this.state.total + item.price
     *     });
     *   }
     * }
     * 
     * app.post('/checkout', async (ctx) => {
     *   const checkout = ctx.requestStore(CheckoutStore);
     *   checkout.addItem(ctx.body.item);
     *   return { total: checkout.state.total };
     * });
     * // checkout store is automatically disposed after response
     * ```
     */
    requestStore<T extends RequestStore<any>>(StoreClass: RequestStoreConstructor<T>): T {
        return this._requestStoreRegistry.get(StoreClass);
    }

    /**
     * Set a value in request-scoped storage
     * Data is automatically cleared after the request completes
     * 
     * @param key - Storage key
     * @param value - Value to store
     * 
     * @example
     * ```typescript
     * // In middleware or onBefore
     * ctx.set('user', { id: '123', name: 'John' });
     * ctx.set('startTime', Date.now());
     * 
     * // In handler
     * const user = ctx.get('user');
     * ```
     */
    set<T = any>(key: string, value: T): void {
        this._data.set(key, value);
    }

    /**
     * Get a value from request-scoped storage
     * 
     * @param key - Storage key
     * @returns The stored value or undefined
     * 
     * @example
     * ```typescript
     * const user = ctx.get<User>('user');
     * const startTime = ctx.get<number>('startTime');
     * ```
     */
    get<T = any>(key: string): T | undefined {
        return this._data.get(key) as T | undefined;
    }

    /**
     * Set store registry (called by Application)
     * @internal
     */
    setStoreRegistry(registry: StoreRegistry): void {
        this._storeRegistry = registry;
    }
    
    /**
     * Set debug mode (called by Application)
     * @internal
     */
    setDebugMode(debug: boolean): void {
        this._debug = debug;
        // Re-create request store registry with debug mode
        this._requestStoreRegistry = new RequestStoreRegistry(debug);
    }

    /**
     * Dispose request-scoped stores and data (called after response)
     * @internal
     */
    disposeRequestStores(): void {
        this._requestStoreRegistry.dispose();
        this._data.clear();
    }

    /**
     * Get request store registry for advanced usage
     * @internal
     */
    getRequestStoreRegistry(): RequestStoreRegistry {
        return this._requestStoreRegistry;
    }

    /**
     * Set route parameters (called by router)
     */
    setParams(params: Record<string, string>): void {
        this.params = params;
    }

    /**
     * Set request body (called after parsing)
     */
    setBody(body: any): void {
        this.body = body;
    }

    /**
     * Get all Set-Cookie headers
     */
    getSetCookieHeaders(): string[] {
        return (this.cookies as CookieManager).getSetCookieHeaders();
    }
}

/**
 * Parse request body based on Content-Type
 */
export async function parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        const contentType = req.headers['content-type'] || '';
        const chunks: Buffer[] = [];

        req.on('data', (chunk: Buffer) => chunks.push(chunk));

        req.on('end', () => {
            try {
                const buffer = Buffer.concat(chunks);
                const body = buffer.toString('utf-8');

                if (contentType.includes('application/json')) {
                    resolve(body ? JSON.parse(body) : {});
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                    resolve(parseQueryString(body));
                } else if (contentType.includes('text/')) {
                    resolve(body);
                } else {
                    resolve(buffer);
                }
            } catch (error) {
                reject(error);
            }
        });

        req.on('error', reject);
    });
}

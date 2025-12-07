/**
 * Context implementation
 * Provides a unified request/response context with immutable properties
 */

import { IncomingMessage, ServerResponse } from 'http';
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
 * Pre-cached headers for common content types
 * This avoids object creation on every response
 */
const CACHED_HEADERS = {
    JSON: { 'Content-Type': 'application/json' } as Headers,
    HTML: { 'Content-Type': 'text/html; charset=utf-8' } as Headers,
    TEXT: { 'Content-Type': 'text/plain; charset=utf-8' } as Headers,
};

/**
 * Response builder implementation
 */
class ResponseBuilderImpl implements ResponseBuilder {
    private _status: number = 200;
    private _headers: Headers = {};
    private _hasCustomHeaders: boolean = false;

    status(code: number): ResponseBuilder {
        this._status = code;
        return this;
    }

    header(name: string, value: string): ResponseBuilder {
        this._headers[name] = value;
        this._hasCustomHeaders = true;
        return this;
    }

    json<T>(data: T): Response {
        return {
            statusCode: this._status,
            headers: this._hasCustomHeaders 
                ? { ...this._headers, 'Content-Type': 'application/json' }
                : CACHED_HEADERS.JSON,
            body: JSON.stringify(data)
        };
    }

    html(content: string): Response {
        return {
            statusCode: this._status,
            headers: this._hasCustomHeaders 
                ? { ...this._headers, 'Content-Type': 'text/html; charset=utf-8' }
                : CACHED_HEADERS.HTML,
            body: content
        };
    }

    text(content: string): Response {
        return {
            statusCode: this._status,
            headers: this._hasCustomHeaders 
                ? { ...this._headers, 'Content-Type': 'text/plain; charset=utf-8' }
                : CACHED_HEADERS.TEXT,
            body: content
        };
    }

    redirect(url: string, status: number = 302): Response {
        return {
            statusCode: status,
            headers: this._hasCustomHeaders 
                ? { ...this._headers, 'Location': url }
                : { 'Location': url },
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
    
    /**
     * Reset for reuse (object pooling)
     */
    reset(): void {
        this._status = 200;
        this._headers = {};
        this._hasCustomHeaders = false;
    }
}

/**
 * Reusable response builder pool
 */
const responseBuilderPool: ResponseBuilderImpl[] = [];
const RESPONSE_BUILDER_POOL_SIZE = 100;

function acquireResponseBuilder(): ResponseBuilderImpl {
    if (responseBuilderPool.length > 0) {
        const builder = responseBuilderPool.pop()!;
        builder.reset();
        return builder;
    }
    return new ResponseBuilderImpl();
}

function releaseResponseBuilder(builder: ResponseBuilderImpl): void {
    if (responseBuilderPool.length < RESPONSE_BUILDER_POOL_SIZE) {
        responseBuilderPool.push(builder);
    }
}

/**
 * Context implementation
 */
export class ContextImpl implements Context {
    method: HTTPMethod;
    path: string;
    private _url: URL | null = null;  // Lazy URL creation
    private _host: string = 'localhost';
    params: Record<string, string> = {};
    private _query: Record<string, any> | null = null;  // Lazy query parsing
    private _queryString: string = '';  // Raw query string for lazy parsing
    headers: Headers;
    private _cookieHeader: string | undefined;
    private _cookies: CookieManager | null = null;  // Lazy cookie parsing
    raw: { req: IncomingMessage; res: ServerResponse };
    response: ResponseBuilder;
    
    // Lazy body parsing - key optimization!
    private _parsedBody: any = undefined;
    private _bodyPromise: Promise<any> | null = null;
    private _bodyParsed: boolean = false;
    
    // Store registry reference (set by Application)
    private _storeRegistry?: StoreRegistry;
    
    // Request-scoped store registry - now lazy!
    private _requestStoreRegistry: RequestStoreRegistry | null = null;
    
    // Request-scoped simple key-value storage - now lazy!
    private _data: Map<string, any> | null = null;
    
    // Debug mode
    private _debug: boolean = false;

    constructor(req: IncomingMessage, res: ServerResponse) {
        this.raw = { req, res };

        // Parse method - use direct access, avoid optional chaining overhead
        this.method = (req.method ? req.method.toUpperCase() : 'GET') as HTTPMethod;

        // Fast URL parsing - just extract path, delay query parsing
        const url = req.url || '/';
        const queryIndex = url.indexOf('?');
        
        if (queryIndex === -1) {
            this.path = url;
            this._queryString = '';
            this._query = null;  // Will be {} when accessed
        } else {
            this.path = url.substring(0, queryIndex);
            // Store query string for lazy parsing
            this._queryString = url.substring(queryIndex + 1);
            this._query = null;  // Parse lazily
        }
        
        // Store host for lazy URL creation
        this._host = (req.headers.host as string) || 'localhost';
        
        // URL is now lazy - don't create here!
        this._url = null;

        // Parse headers (direct reference, no copy)
        this.headers = req.headers as Headers;

        // Store cookie header for lazy parsing
        this._cookieHeader = req.headers.cookie;
        this._cookies = null;

        // Get response builder from pool
        this.response = acquireResponseBuilder();
    }

    /**
     * Lazy URL getter - only create URL object when accessed
     * Most handlers don't need the full URL object
     */
    get url(): URL {
        if (!this._url) {
            this._url = new URL(this.path, `http://${this._host}`);
        }
        return this._url;
    }

    set url(value: URL) {
        this._url = value;
    }

    /**
     * Lazy query getter - only parse query string when accessed
     * Most simple endpoints like /json don't need query parsing
     */
    get query(): Record<string, any> {
        if (this._query === null) {
            this._query = this._queryString 
                ? this.parseQueryStringFast(this._queryString)
                : {};
        }
        return this._query;
    }

    set query(value: Record<string, any>) {
        this._query = value;
    }

    /**
     * Lazy cookies getter - only parse cookies when accessed
     */
    get cookies(): Cookies {
        if (!this._cookies) {
            this._cookies = new CookieManager(this._cookieHeader);
        }
        return this._cookies;
    }

    set cookies(value: Cookies) {
        this._cookies = value as CookieManager;
    }

    /**
     * Decode URI component only if needed (has encoded chars)
     * This is a performance optimization - indexOf is much faster than decodeURIComponent
     */
    private decodeIfNeeded(str: string): string {
        // Check for encoded characters: % (percent encoding) or + (space in form data)
        if (str.indexOf('%') === -1 && str.indexOf('+') === -1) {
            return str;  // Fast path: no decoding needed
        }
        // Replace + with space (form data encoding) then decode percent encoding
        return decodeURIComponent(str.replace(/\+/g, ' '));
    }

    /**
     * Fast query string parser - optimized for common cases
     * Skips decodeURIComponent for simple ASCII strings (90% of cases)
     */
    private parseQueryStringFast(queryString: string): Record<string, any> {
        if (!queryString) return {};
        
        const result: Record<string, any> = {};
        const pairs = queryString.split('&');
        
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const eqIndex = pair.indexOf('=');
            
            if (eqIndex === -1) {
                // Key only, no value
                result[this.decodeIfNeeded(pair)] = '';
            } else {
                const key = this.decodeIfNeeded(pair.substring(0, eqIndex));
                const value = this.decodeIfNeeded(pair.substring(eqIndex + 1));
                
                // Handle array values (key[]=value or repeated keys)
                if (result[key] !== undefined) {
                    if (Array.isArray(result[key])) {
                        result[key].push(value);
                    } else {
                        result[key] = [result[key], value];
                    }
                } else {
                    result[key] = value;
                }
            }
        }
        
        return result;
    }

    /**
     * Reinitialize context for pooling (avoids new object creation)
     */
    reinitialize(req: IncomingMessage, res: ServerResponse): void {
        this.raw = { req, res };
        this.method = (req.method ? req.method.toUpperCase() : 'GET') as HTTPMethod;
        
        // Fast URL parsing - delay query parsing
        const url = req.url || '/';
        const queryIndex = url.indexOf('?');
        
        if (queryIndex === -1) {
            this.path = url;
            this._queryString = '';
            this._query = null;
        } else {
            this.path = url.substring(0, queryIndex);
            this._queryString = url.substring(queryIndex + 1);
            this._query = null;  // Parse lazily
        }
        
        // Lazy URL - don't create here
        this._host = (req.headers.host as string) || 'localhost';
        this._url = null;
        
        this.headers = req.headers as Headers;
        
        // Lazy cookies
        this._cookieHeader = req.headers.cookie;
        this._cookies = null;
        
        // Reuse or get new response builder from pool
        if (this.response && typeof (this.response as ResponseBuilderImpl).reset === 'function') {
            (this.response as ResponseBuilderImpl).reset();
        } else {
            this.response = acquireResponseBuilder();
        }
        
        // Reset body state
        this._parsedBody = undefined;
        this._bodyPromise = null;
        this._bodyParsed = false;
        
        // Reset params
        this.params = {};
        
        // Lazy data and store - just null them, create on access
        if (this._data) {
            this._data.clear();
        }
        this._requestStoreRegistry = null;
    }

    /**
     * Lazy body getter - parses body on first access
     * This is the KEY optimization that fixes POST performance!
     */
    get body(): any {
        // If already parsed synchronously, return it
        if (this._bodyParsed) {
            return this._parsedBody;
        }
        
        // Return undefined if not parsed yet
        // Use getBody() for async access
        return this._parsedBody;
    }

    /**
     * Set body directly (for backwards compatibility)
     */
    set body(value: any) {
        this._parsedBody = value;
        this._bodyParsed = true;
    }

    /**
     * Async body getter - use this in handlers for POST/PUT/PATCH
     * @example
     * ```typescript
     * app.post('/data', async (ctx) => {
     *   const body = await ctx.getBody();
     *   return { received: body };
     * });
     * ```
     */
    async getBody<T = any>(): Promise<T> {
        // Already parsed
        if (this._bodyParsed) {
            return this._parsedBody as T;
        }
        
        // Already parsing (dedup concurrent calls)
        if (this._bodyPromise) {
            return this._bodyPromise as Promise<T>;
        }
        
        // Start parsing with optimized parser
        this._bodyPromise = this.parseBodyOptimized();
        this._parsedBody = await this._bodyPromise;
        this._bodyParsed = true;
        this._bodyPromise = null;
        
        return this._parsedBody as T;
    }

    /**
     * Ultra-optimized body parser inspired by Fastify's approach
     * Key optimizations:
     * 1. Pre-check content-type before reading data
     * 2. Use direct string concatenation with setEncoding
     * 3. Minimal closure allocation
     * 4. Fast-path for JSON (most common case)
     */
    private parseBodyOptimized(): Promise<any> {
        const req = this.raw.req;
        const contentType = req.headers['content-type'];
        
        // Fast path: determine parser type once, before data collection
        const isJSON = contentType ? contentType.charCodeAt(0) === 97 && contentType.startsWith('application/json') : false;
        const isForm = !isJSON && contentType ? contentType.includes('x-www-form-urlencoded') : false;
        
        return new Promise((resolve, reject) => {
            // Set encoding for string mode - avoids Buffer.toString() overhead
            req.setEncoding('utf8');
            
            let body = '';
            
            const onData = (chunk: string) => {
                body += chunk;
            };
            
            const onEnd = () => {
                // Cleanup listeners immediately
                req.removeListener('data', onData);
                req.removeListener('end', onEnd);
                req.removeListener('error', onError);
                
                if (!body) {
                    resolve({});
                    return;
                }
                
                try {
                    if (isJSON) {
                        resolve(JSON.parse(body));
                    } else if (isForm) {
                        resolve(this.parseQueryStringFast(body));
                    } else {
                        resolve(body);
                    }
                } catch (e) {
                    reject(e);
                }
            };
            
            const onError = (err: Error) => {
                req.removeListener('data', onData);
                req.removeListener('end', onEnd);
                req.removeListener('error', onError);
                reject(err);
            };
            
            req.on('data', onData);
            req.on('end', onEnd);
            req.on('error', onError);
        });
    }

    /**
     * Internal body parser - optimized for performance
     * Uses string accumulation instead of Buffer.concat for better perf
     * @deprecated Use parseBodyOptimized instead
     */
    private parseBodyInternal(): Promise<any> {
        return new Promise((resolve, reject) => {
            const req = this.raw.req;
            const contentType = req.headers['content-type'] || '';
            
            // Use setEncoding to get strings directly - faster than Buffer.toString()
            req.setEncoding('utf8');
            
            let body = '';
            
            req.on('data', (chunk: string) => {
                body += chunk;
            });
            
            req.on('end', () => {
                if (!body) {
                    resolve({});
                    return;
                }
                
                try {
                    // Inline content type check for hot path (JSON)
                    if (contentType.includes('application/json')) {
                        resolve(JSON.parse(body));
                    } else if (contentType.includes('application/x-www-form-urlencoded')) {
                        resolve(this.parseQueryStringFast(body));
                    } else {
                        resolve(body);
                    }
                } catch (error) {
                    reject(error);
                }
            });
            
            req.on('error', reject);
        });
    }

    /**
     * Parse body based on content type
     */
    private parseContentType(body: string, contentType: string): any {
        if (contentType.includes('application/json')) {
            return body ? JSON.parse(body) : {};
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
            return this.parseQueryStringFast(body);
        } else if (contentType.includes('text/')) {
            return body;
        }
        return body;
    }

    /**
     * Clear body state (for pooling)
     */
    clearBody(): void {
        this._parsedBody = undefined;
        this._bodyPromise = null;
        this._bodyParsed = false;
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
     * Lazy getter for request store registry
     */
    private getOrCreateRequestStoreRegistry(): RequestStoreRegistry {
        if (!this._requestStoreRegistry) {
            this._requestStoreRegistry = new RequestStoreRegistry(this._debug);
        }
        return this._requestStoreRegistry;
    }

    /**
     * Lazy getter for request data map
     */
    private getOrCreateData(): Map<string, any> {
        if (!this._data) {
            this._data = new Map();
        }
        return this._data;
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
        return this.getOrCreateRequestStoreRegistry().get(StoreClass);
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
        this.getOrCreateData().set(key, value);
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
        return this._data?.get(key) as T | undefined;
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
        // Reset request store registry - will be created lazily with new debug mode
        this._requestStoreRegistry = null;
    }

    /**
     * Dispose request-scoped stores and data (called after response)
     * @internal
     */
    disposeRequestStores(): void {
        if (this._requestStoreRegistry) {
            this._requestStoreRegistry.dispose();
            this._requestStoreRegistry = null;
        }
        if (this._data) {
            this._data.clear();
        }
        // Release response builder back to pool
        if (this.response && typeof (this.response as ResponseBuilderImpl).reset === 'function') {
            releaseResponseBuilder(this.response as ResponseBuilderImpl);
        }
    }

    /**
     * Get request store registry for advanced usage
     * @internal
     */
    getRequestStoreRegistry(): RequestStoreRegistry {
        return this.getOrCreateRequestStoreRegistry();
    }

    /**
     * Set route parameters (called by router)
     */
    setParams(params: Record<string, string>): void {
        this.params = params;
    }

    /**
     * Set request body (called after parsing or by middleware)
     * @deprecated Use ctx.getBody() for async body access
     */
    setBody(body: any): void {
        this._parsedBody = body;
        this._bodyParsed = true;
    }

    /**
     * Get all Set-Cookie headers
     */
    getSetCookieHeaders(): string[] {
        // Use _cookies directly to avoid creating CookieManager if not needed
        if (!this._cookies) {
            return [];
        }
        return this._cookies.getSetCookieHeaders();
    }
}

/**
 * Parse request body based on Content-Type
 * @deprecated Use ctx.getBody() instead for lazy parsing
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

/**
 * Radix Tree implementation for efficient routing
 * Provides O(log n) route lookup performance
 */

import { Handler, Middleware } from '../types';
import { SerializerFunction } from '../serializer';

/**
 * Parsed parameter info for pattern segments
 */
interface PatternParam {
    name: string;
    pattern?: string;  // regex pattern if specified
}

/**
 * Node in the radix tree
 */
export class RadixNode {
    // The path segment this node represents
    segment: string;

    // Full path for this node (used for debugging)
    fullPath: string;

    // Handler if this is a terminal node
    handler: Handler | null = null;

    // Middleware for this route
    middlewares: Middleware[] = [];

    // Child nodes
    children: RadixNode[] = [];

    // Pattern type: 'static', 'param', 'regex', 'pattern', or 'wildcard'
    // - static: exact match like /users
    // - param: simple param like :id
    // - regex: param with regex like :id(\d+)
    // - pattern: inline pattern like category-:slug or file.:ext
    // - wildcard: catch-all like *
    type: 'static' | 'param' | 'regex' | 'pattern' | 'wildcard' = 'static';

    // Parameter name for param/regex nodes
    paramName?: string;

    // Compiled regex for regex/pattern nodes (compiled once at startup)
    regex?: RegExp;

    // Parameter names for pattern type (can have multiple params in one segment)
    patternParams?: string[];

    // Compiled serializers for response (status code → serializer)
    serializers: Map<number | string, SerializerFunction> | null = null;

    constructor(segment: string, fullPath: string, enableRegex: boolean = false) {
        this.segment = segment;
        this.fullPath = fullPath;

        // Detect node type
        if (segment.startsWith(':')) {
            // Check for regex pattern: :param(pattern)
            const regexMatch = enableRegex ? segment.match(/^:([^(]+)\((.+)\)$/) : null;
            
            if (regexMatch) {
                // Regex parameter: :id(\d+)
                this.type = 'regex';
                this.paramName = regexMatch[1];
                this.regex = new RegExp(`^${regexMatch[2]}$`);
            } else {
                // Simple parameter: :id
                this.type = 'param';
                this.paramName = segment.slice(1);
            }
        } else if (segment === '*' || segment.startsWith('*')) {
            this.type = 'wildcard';
            this.paramName = segment.length > 1 ? segment.slice(1) : 'wildcard';
        } else if (enableRegex && segment.includes(':')) {
            // Inline pattern like: category-:slug, file.:ext, prefix-:id-suffix
            this.type = 'pattern';
            this.patternParams = [];
            
            // Parse the segment and build regex
            // Example: "category-:slug" -> regex: /^category-(.+)$/, params: ['slug']
            // Example: "file.:ext(jpg|png)" -> regex: /^file\.(jpg|png)$/, params: ['ext']
            let regexStr = '^';
            let remaining = segment;
            
            while (remaining.length > 0) {
                // Find next param
                const paramStart = remaining.indexOf(':');
                
                if (paramStart === -1) {
                    // No more params, add rest as literal
                    regexStr += this.escapeRegex(remaining);
                    break;
                }
                
                // Add literal part before param
                if (paramStart > 0) {
                    regexStr += this.escapeRegex(remaining.slice(0, paramStart));
                }
                
                remaining = remaining.slice(paramStart + 1);
                
                // Parse param name and optional pattern
                const paramMatch = remaining.match(/^([^(./-]+)(?:\(([^)]+)\))?/);
                if (paramMatch) {
                    const paramName = paramMatch[1];
                    const paramPattern = paramMatch[2] || '.+';  // default: match anything
                    
                    this.patternParams.push(paramName);
                    regexStr += `(${paramPattern})`;
                    
                    // Move past the param (name + optional pattern)
                    remaining = remaining.slice(paramMatch[0].length);
                }
            }
            
            regexStr += '$';
            this.regex = new RegExp(regexStr);
        }
    }

    /**
     * Escape special regex characters in a string
     */
    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Add a child node
     */
    addChild(node: RadixNode): void {
        // Insert maintaining order: static > param > wildcard
        const priority = this.getTypePriority(node.type);
        let inserted = false;

        for (let i = 0; i < this.children.length; i++) {
            const childPriority = this.getTypePriority(this.children[i].type);
            if (priority < childPriority) {
                this.children.splice(i, 0, node);
                inserted = true;
                break;
            }
        }

        if (!inserted) {
            this.children.push(node);
        }
    }

    /**
     * Find a child by segment
     */
    findChild(segment: string): RadixNode | null {
        for (const child of this.children) {
            if (child.segment === segment) {
                return child;
            }
        }
        return null;
    }

    /**
     * Get type priority for ordering (lower = higher priority)
     */
    private getTypePriority(type: 'static' | 'param' | 'regex' | 'pattern' | 'wildcard'): number {
        switch (type) {
            case 'static': return 0;
            case 'pattern': return 1;  // inline patterns like category-:slug
            case 'regex': return 2;    // regex param like :id(\d+)
            case 'param': return 3;    // simple param like :id
            case 'wildcard': return 4;
        }
    }
}

/**
 * Radix tree for route storage and matching
 */
export class RadixTree {
    private root: RadixNode;
    private enableRegex: boolean;

    constructor(enableRegex: boolean = false) {
        this.root = new RadixNode('', '/', enableRegex);
        this.enableRegex = enableRegex;
    }

    /**
     * Insert a route into the tree
     */
    insert(
        path: string, 
        handler: Handler, 
        middlewares: Middleware[] = [],
        serializers?: Map<number | string, SerializerFunction>
    ): void {
        const segments = this.splitPath(path);
        let current = this.root;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            let child = current.findChild(segment);

            if (!child) {
                const fullPath = '/' + segments.slice(0, i + 1).join('/');
                child = new RadixNode(segment, fullPath, this.enableRegex);
                current.addChild(child);
            }

            current = child;
        }

        // Set handler, middleware, and serializers at terminal node
        current.handler = handler;
        current.middlewares = middlewares;
        current.serializers = serializers || null;
    }

    /**
     * Search for a route match
     */
    search(path: string): { 
        handler: Handler; 
        params: Record<string, string>; 
        middlewares: Middleware[];
        serializers: Map<number | string, SerializerFunction> | null;
    } | null {
        const segments = this.splitPath(path);
        const params: Record<string, string> = {};

        const result = this.searchNode(this.root, segments, 0, params);

        if (result) {
            return {
                handler: result.handler!,
                params,
                middlewares: result.middlewares,
                serializers: result.serializers
            };
        }

        return null;
    }

    /**
     * Recursively search nodes
     */
    private searchNode(
        node: RadixNode,
        segments: string[],
        index: number,
        params: Record<string, string>
    ): RadixNode | null {
        // Reached end of path
        if (index === segments.length) {
            return node.handler ? node : null;
        }

        const segment = segments[index];

        // Try children in priority order
        for (const child of node.children) {
            if (child.type === 'static') {
                // Exact match required
                if (child.segment === segment) {
                    const result = this.searchNode(child, segments, index + 1, params);
                    if (result) return result;
                }
            } else if (child.type === 'pattern') {
                // Inline pattern match - test regex and extract multiple params
                const match = child.regex!.exec(segment);
                if (match) {
                    // Save old values for backtracking
                    const oldValues: Record<string, string | undefined> = {};
                    for (let i = 0; i < child.patternParams!.length; i++) {
                        const paramName = child.patternParams![i];
                        oldValues[paramName] = params[paramName];
                        params[paramName] = match[i + 1];  // match[0] is full match
                    }

                    const result = this.searchNode(child, segments, index + 1, params);
                    if (result) return result;

                    // Backtrack
                    for (const paramName of child.patternParams!) {
                        if (oldValues[paramName] === undefined) {
                            delete params[paramName];
                        } else {
                            params[paramName] = oldValues[paramName]!;
                        }
                    }
                }
            } else if (child.type === 'regex') {
                // Regex match - test pattern and capture value if matches
                if (child.regex!.test(segment)) {
                    const oldValue = params[child.paramName!];
                    params[child.paramName!] = segment;

                    const result = this.searchNode(child, segments, index + 1, params);
                    if (result) return result;

                    // Backtrack
                    if (oldValue === undefined) {
                        delete params[child.paramName!];
                    } else {
                        params[child.paramName!] = oldValue;
                    }
                }
            } else if (child.type === 'param') {
                // Parameter match - capture value
                const oldValue = params[child.paramName!];
                params[child.paramName!] = segment;

                const result = this.searchNode(child, segments, index + 1, params);
                if (result) return result;

                // Backtrack
                if (oldValue === undefined) {
                    delete params[child.paramName!];
                } else {
                    params[child.paramName!] = oldValue;
                }
            } else if (child.type === 'wildcard') {
                // Wildcard match - capture remaining path
                params[child.paramName!] = segments.slice(index).join('/');
                return child;
            }
        }

        return null;
    }

    /**
     * Split path into segments
     */
    private splitPath(path: string): string[] {
        // Remove leading/trailing slashes and split
        const normalized = path.replace(/^\/+|\/+$/g, '');
        return normalized ? normalized.split('/') : [];
    }

    /**
     * Get all routes (for debugging/introspection)
     */
    getAllRoutes(): Array<{ path: string; hasHandler: boolean }> {
        const routes: Array<{ path: string; hasHandler: boolean }> = [];
        this.collectRoutes(this.root, routes);
        return routes;
    }

    /**
     * Recursively collect all routes
     */
    private collectRoutes(node: RadixNode, routes: Array<{ path: string; hasHandler: boolean }>): void {
        if (node.handler) {
            routes.push({ path: node.fullPath, hasHandler: true });
        }

        for (const child of node.children) {
            this.collectRoutes(child, routes);
        }
    }
}

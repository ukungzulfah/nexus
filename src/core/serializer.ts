/**
 * Fast JSON Serializer Module
 * Uses fast-json-stringify for 2-3x faster JSON serialization
 * 
 * @example
 * ```typescript
 * // Define response schema
 * const userSchema = {
 *   type: 'object',
 *   properties: {
 *     id: { type: 'number' },
 *     name: { type: 'string' },
 *     email: { type: 'string' }
 *   }
 * };
 * 
 * // Create serializer
 * const serialize = createSerializer(userSchema);
 * 
 * // Use in handler (2-3x faster than JSON.stringify)
 * app.get('/user', {
 *   responseSchema: userSchema,
 *   handler: async (ctx) => ({ id: 1, name: 'John', email: 'john@example.com' })
 * });
 * ```
 */

import fastJson from 'fast-json-stringify';

/**
 * JSON Schema type definition for fast-json-stringify
 */
export interface JSONSchema {
    type?: string;
    properties?: Record<string, JSONSchema>;
    items?: JSONSchema | JSONSchema[];
    additionalProperties?: boolean | JSONSchema;
    required?: string[];
    nullable?: boolean;
    default?: any;
    enum?: any[];
    const?: any;
    format?: string;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    $ref?: string;
    $id?: string;
    definitions?: Record<string, JSONSchema>;
    allOf?: JSONSchema[];
    anyOf?: JSONSchema[];
    oneOf?: JSONSchema[];
    if?: JSONSchema;
    then?: JSONSchema;
    else?: JSONSchema;
    // Array specific
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    // Object specific
    minProperties?: number;
    maxProperties?: number;
    patternProperties?: Record<string, JSONSchema>;
}

/**
 * Response schema configuration for routes
 */
export interface ResponseSchemaConfig {
    /** Schema for 2xx responses */
    '2xx'?: JSONSchema;
    /** Schema for specific status codes */
    200?: JSONSchema;
    201?: JSONSchema;
    204?: JSONSchema;
    /** Schema for error responses */
    '4xx'?: JSONSchema;
    400?: JSONSchema;
    401?: JSONSchema;
    403?: JSONSchema;
    404?: JSONSchema;
    '5xx'?: JSONSchema;
    500?: JSONSchema;
    /** Default schema for any status code */
    default?: JSONSchema;
}

/**
 * Serializer function type
 */
export type SerializerFunction = (data: any) => string;

/**
 * Serializer options for fast-json-stringify
 */
export interface SerializerOptions {
    /** Use strict mode for schema validation */
    mode?: 'debug' | 'standalone';
    /** Rounding mode for numbers */
    rounding?: 'ceil' | 'floor' | 'round' | 'trunc';
    /** Large array mode optimization */
    largeArrayMechanism?: 'default' | 'json-stringify';
    /** Large array size threshold */
    largeArraySize?: number;
}

/**
 * Compiled serializers cache
 * Maps route path + method to serializer functions
 */
class SerializerRegistry {
    private serializers: Map<string, Map<number | string, SerializerFunction>> = new Map();
    private schemaCache: WeakMap<JSONSchema, SerializerFunction> = new WeakMap();
    private options: SerializerOptions;

    constructor(options: SerializerOptions = {}) {
        this.options = {
            mode: 'standalone',
            rounding: 'trunc',
            largeArrayMechanism: 'default',
            largeArraySize: 20000,
            ...options
        };
    }

    /**
     * Compile a schema into a serializer function
     */
    compile(schema: JSONSchema): SerializerFunction {
        // Check cache first
        const cached = this.schemaCache.get(schema);
        if (cached) return cached;

        // Compile new serializer
        const serializer = fastJson(schema as any, {
            mode: this.options.mode,
            rounding: this.options.rounding,
            largeArrayMechanism: this.options.largeArrayMechanism,
            largeArraySize: this.options.largeArraySize
        });

        // Cache it
        this.schemaCache.set(schema, serializer);
        return serializer;
    }

    /**
     * Register serializers for a route
     */
    register(routeKey: string, schemas: ResponseSchemaConfig): void {
        const routeSerializers = new Map<number | string, SerializerFunction>();

        for (const [statusKey, schema] of Object.entries(schemas)) {
            if (schema) {
                const serializer = this.compile(schema);
                routeSerializers.set(statusKey, serializer);
            }
        }

        this.serializers.set(routeKey, routeSerializers);
    }

    /**
     * Get serializer for a route and status code
     */
    get(routeKey: string, statusCode: number): SerializerFunction | null {
        const routeSerializers = this.serializers.get(routeKey);
        if (!routeSerializers) return null;

        // Try exact match first
        const exactMatch = routeSerializers.get(statusCode);
        if (exactMatch) return exactMatch;

        // Try status code ranges (2xx, 4xx, 5xx)
        const range = `${Math.floor(statusCode / 100)}xx`;
        const rangeMatch = routeSerializers.get(range);
        if (rangeMatch) return rangeMatch;

        // Try default
        return routeSerializers.get('default') || null;
    }

    /**
     * Check if route has registered serializers
     */
    has(routeKey: string): boolean {
        return this.serializers.has(routeKey);
    }

    /**
     * Clear all serializers
     */
    clear(): void {
        this.serializers.clear();
    }

    /**
     * Get route key from method and path
     */
    static getRouteKey(method: string, path: string): string {
        return `${method}:${path}`;
    }
}

/**
 * Global serializer registry instance
 */
export const serializerRegistry = new SerializerRegistry();

/**
 * Create a standalone serializer from schema
 * Use this for manual serialization outside of routes
 * 
 * @example
 * ```typescript
 * const userSerializer = createSerializer({
 *   type: 'object',
 *   properties: {
 *     id: { type: 'number' },
 *     name: { type: 'string' }
 *   }
 * });
 * 
 * const json = userSerializer({ id: 1, name: 'John' });
 * // Much faster than JSON.stringify!
 * ```
 */
export function createSerializer(schema: JSONSchema, options?: SerializerOptions): SerializerFunction {
    return fastJson(schema as any, {
        mode: options?.mode || 'standalone',
        rounding: options?.rounding || 'trunc',
        largeArrayMechanism: options?.largeArrayMechanism || 'default',
        largeArraySize: options?.largeArraySize || 20000
    });
}

/**
 * Create an array serializer optimized for large arrays
 * 
 * @example
 * ```typescript
 * const usersSerializer = createArraySerializer({
 *   type: 'object',
 *   properties: {
 *     id: { type: 'number' },
 *     name: { type: 'string' }
 *   }
 * });
 * 
 * // Optimized for arrays with 100+ items
 * const json = usersSerializer(users);
 * ```
 */
export function createArraySerializer(itemSchema: JSONSchema, options?: SerializerOptions): SerializerFunction {
    const arraySchema: JSONSchema = {
        type: 'array',
        items: itemSchema
    };

    return fastJson(arraySchema as any, {
        mode: options?.mode || 'standalone',
        rounding: options?.rounding || 'trunc',
        // For large arrays, use optimized mechanism
        largeArrayMechanism: options?.largeArrayMechanism || 'default',
        largeArraySize: options?.largeArraySize || 20000
    });
}

/**
 * Common schemas for quick use
 */
export const CommonSchemas = {
    /** String type */
    string: { type: 'string' } as JSONSchema,
    
    /** Number type */
    number: { type: 'number' } as JSONSchema,
    
    /** Integer type */
    integer: { type: 'integer' } as JSONSchema,
    
    /** Boolean type */
    boolean: { type: 'boolean' } as JSONSchema,
    
    /** Null type */
    null: { type: 'null' } as JSONSchema,
    
    /** Any type (no validation, uses JSON.stringify internally) */
    any: {} as JSONSchema,
    
    /** UUID string format */
    uuid: { type: 'string', format: 'uuid' } as JSONSchema,
    
    /** Email string format */
    email: { type: 'string', format: 'email' } as JSONSchema,
    
    /** Date-time string format */
    datetime: { type: 'string', format: 'date-time' } as JSONSchema,
    
    /** Date string format */
    date: { type: 'string', format: 'date' } as JSONSchema,
    
    /** URI string format */
    uri: { type: 'string', format: 'uri' } as JSONSchema,

    /**
     * Create object schema helper
     * @example
     * ```typescript
     * const userSchema = CommonSchemas.object({
     *   id: CommonSchemas.number,
     *   name: CommonSchemas.string,
     *   email: CommonSchemas.email
     * });
     * ```
     */
    object: (properties: Record<string, JSONSchema>, required?: string[]): JSONSchema => ({
        type: 'object',
        properties,
        required,
        additionalProperties: false
    }),

    /**
     * Create array schema helper
     * @example
     * ```typescript
     * const usersSchema = CommonSchemas.array(userSchema);
     * ```
     */
    array: (items: JSONSchema): JSONSchema => ({
        type: 'array',
        items
    }),

    /**
     * Create nullable schema helper
     * @example
     * ```typescript
     * const nullableString = CommonSchemas.nullable(CommonSchemas.string);
     * ```
     */
    nullable: (schema: JSONSchema): JSONSchema => ({
        ...schema,
        nullable: true
    }),

    /**
     * Standard error response schema
     */
    error: {
        type: 'object',
        properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'number' }
        }
    } as JSONSchema,

    /**
     * Standard pagination response schema helper
     * @example
     * ```typescript
     * const paginatedUsers = CommonSchemas.paginated(userSchema);
     * ```
     */
    paginated: (itemSchema: JSONSchema): JSONSchema => ({
        type: 'object',
        properties: {
            data: { type: 'array', items: itemSchema },
            total: { type: 'number' },
            page: { type: 'number' },
            limit: { type: 'number' },
            totalPages: { type: 'number' }
        }
    })
};

/**
 * Serialize data with fast-json-stringify
 * Falls back to JSON.stringify if no schema is provided
 */
export function serialize(data: any, schema?: JSONSchema): string {
    if (!schema) {
        return JSON.stringify(data);
    }
    
    const serializer = serializerRegistry.compile(schema);
    return serializer(data);
}

/**
 * Export SerializerRegistry class for advanced usage
 */
export { SerializerRegistry };

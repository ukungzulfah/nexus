import { HTTPMethod, RouteMeta, SchemaConfig } from "../../core/types";

/**
 * Configuration options for the API Playground
 */
export interface PlaygroundConfig {
    /** URL path where the playground will be accessible (default: '/playground') */
    path?: string;
    
    /** Title displayed in the playground UI (default: 'API Playground') */
    title?: string;
    
    /** Color theme for the playground interface (default: 'dark') */
    theme?: 'dark' | 'light';
    
    /** Default HTTP headers to include in API requests */
    defaultHeaders?: Record<string, string>;
    
    /** Enable/disable request history tracking (default: true) */
    enableHistory?: boolean;
    
    /** Maximum number of requests to keep in history (default: 50) */
    maxHistory?: number;
    
    /** Enable/disable variable substitution in requests (default: true) */
    enableVariables?: boolean;
    
    /** Predefined variables for use in requests (e.g., {{baseUrl}}, {{token}}) */
    variables?: Record<string, string>;
    
    /** Enable only in development mode (default: true) */
    developmentOnly?: boolean;
    
    /** Basic authentication configuration to protect playground access */
    auth?: {
        /** Username for basic authentication */
        username: string;
        /** Password for basic authentication */
        password: string;
    };
}


export interface StoredRoute {
    method: HTTPMethod;
    path: string;
    schema?: SchemaConfig;
    meta?: RouteMeta;
}
import { HTTPMethod, RouteMeta, SchemaConfig } from "../../core/types";

export interface PlaygroundConfig {
    path?: string;
    title?: string;
    theme?: 'dark' | 'light';
    defaultHeaders?: Record<string, string>;
    enableHistory?: boolean;
    maxHistory?: number;
    enableVariables?: boolean;
    variables?: Record<string, string>;
}


export interface StoredRoute {
    method: HTTPMethod;
    path: string;
    schema?: SchemaConfig;
    meta?: RouteMeta;
}
import { Context } from 'vm';
import { Application } from '../../core/application';
import { HTTPMethod, SchemaConfig, RouteMeta, RouteConfig } from '../../core/types';
import { Plugin } from '../static/spa';

/**
 * Extended Application interface for Swagger plugin
 */

export interface SwaggerApplication extends Application {
  swaggerSchema?: (name: string, schema: OpenAPISchema) => SwaggerApplication;
  [key: string]: unknown;
}

// ============================================
// TYPES & INTERFACES
// ============================================

/**
 * OpenAPI Info object
 */
export interface SwaggerInfo {
  title?: string;
  version?: string;
  description?: string;
  termsOfService?: string;
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

/**
 * Custom theme for Swagger UI
 */
export interface SwaggerTheme {
  primaryColor?: string;
  backgroundColor?: string;
  headerColor?: string;
  textColor?: string;
  fontFamily?: string;
}

/**
 * Swagger configuration options
 */
export interface SwaggerConfig {
  /** Path to serve Swagger UI (default: /docs) */
  path?: string;
  /** Path to serve OpenAPI JSON spec (default: /openapi.json) */
  specPath?: string;
  /** API info - auto-detected from package.json if not provided */
  info?: SwaggerInfo;
  /** Server URLs - auto-detected if not provided */
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  /** Security schemes */
  securitySchemes?: Record<string, SecurityScheme>;
  /** Default security for all routes */
  security?: Array<Record<string, string[]>>;
  /** External docs */
  externalDocs?: {
    description?: string;
    url: string;
  };
  /** Custom CSS for Swagger UI */
  customCss?: string;
  /** Custom favicon URL */
  favicon?: string;
  /** Theme: 'light' | 'dark' | custom theme object */
  theme?: 'light' | 'dark' | SwaggerTheme;
  /** Tags to group endpoints */
  tags?: Array<{ name: string; description?: string }>;
  /** Hide routes that don't have meta.tags */
  hideUntagged?: boolean;
  /** Sort tags alphabetically */
  sortTags?: boolean;
  /** Expand operations by default: 'list' | 'full' | 'none' */
  docExpansion?: 'list' | 'full' | 'none';
  /** Filter operations by tag */
  filter?: boolean;
  /** Try it out enabled by default */
  tryItOutEnabled?: boolean;
  /** Persist authorization */
  persistAuthorization?: boolean;
}

/**
 * Security scheme types
 */
export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: OAuthFlows;
  openIdConnectUrl?: string;
}

export interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
}

export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

/**
 * OpenAPI Schema object
 */
export interface OpenAPISchema {
  type?: string;
  format?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  enum?: any[];
  description?: string;
  example?: any;
  default?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  nullable?: boolean;
  $ref?: string;
}

/**
 * OpenAPI Operation object
 */
export interface OpenAPIOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
  deprecated?: boolean;
  security?: Array<Record<string, string[]>>;
}

export interface OpenAPIParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema: OpenAPISchema;
  example?: any;
}

export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: Record<string, { schema: OpenAPISchema; example?: any }>;
}

export interface OpenAPIResponse {
  description: string;
  content?: Record<string, { schema: OpenAPISchema; example?: any }>;
  headers?: Record<string, { description?: string; schema: OpenAPISchema }>;
}

/**
 * Full OpenAPI specification
 */
export interface OpenAPISpec {
  openapi: string;
  info: SwaggerInfo & { title: string; version: string };
  servers?: Array<{ url: string; description?: string }>;
  paths: Record<string, Record<string, OpenAPIOperation>>;
  components?: {
    schemas?: Record<string, OpenAPISchema>;
    securitySchemes?: Record<string, SecurityScheme>;
  };
  security?: Array<Record<string, string[]>>;
  tags?: Array<{ name: string; description?: string }>;
  externalDocs?: { description?: string; url: string };
}

/**
 * Internal route storage with full config
 */
export interface StoredRoute {
  method: HTTPMethod;
  path: string;
  schema?: SchemaConfig;
  meta?: RouteMeta;
}

import { HTTPMethod, SchemaConfig, RouteMeta } from '../../core/types';

// ============================================
// TYPES & INTERFACES
// ============================================
/**
 * Postman configuration options
 */

export interface PostmanConfig {
  /** Path to serve Postman endpoints (default: /postman) */
  path?: string;
  /** Collection name */
  name?: string;
  /** Collection description */
  description?: string;
  /** Base URL for requests (auto-detected if not provided) */
  baseUrl?: string;
  /** Environment name */
  environmentName?: string;
  /** Additional environment variables */
  variables?: Record<string, string>;
  /** Auth type for collection */
  auth?: PostmanAuth;
  /** Include example responses */
  includeExamples?: boolean;
}


/**
 * Postman auth configuration
 */
export interface PostmanAuth {
  type: 'bearer' | 'apikey' | 'basic' | 'oauth2';
  bearer?: { token: string };
  apikey?: { key: string; value: string; in: 'header' | 'query' };
  basic?: { username: string; password: string };
}

/**
 * Postman Collection v2.1 format
 */
export interface PostmanCollection {
  info: {
    _postman_id: string;
    name: string;
    description?: string;
    schema: string;
  };
  item: PostmanItem[];
  auth?: any;
  variable?: PostmanVariable[];
}

export interface PostmanItem {
  name: string;
  item?: PostmanItem[];
  request?: PostmanRequest;
  response?: PostmanResponse[];
}

export interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  url: PostmanUrl;
  body?: PostmanBody;
  description?: string;
  auth?: any;
}

export interface PostmanHeader {
  key: string;
  value: string;
  type: string;
  disabled?: boolean;
}

export interface PostmanUrl {
  raw: string;
  host: string[];
  path: string[];
  query?: PostmanQuery[];
  variable?: PostmanVariable[];
}

export interface PostmanQuery {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
}

export interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
  description?: string;
}

export interface PostmanBody {
  mode: 'raw' | 'formdata' | 'urlencoded';
  raw?: string;
  options?: {
    raw: { language: string };
  };
}

export interface PostmanResponse {
  name: string;
  status: string;
  code: number;
  body?: string;
}

/**
 * Postman Environment format
 */
export interface PostmanEnvironment {
  id: string;
  name: string;
  values: PostmanEnvVariable[];
  _postman_variable_scope: string;
}

export interface PostmanEnvVariable {
  key: string;
  value: string;
  type: string;
  enabled: boolean;
}

/**
 * Internal route storage
 */
export interface StoredRoute {
  method: HTTPMethod;
  path: string;
  schema?: SchemaConfig;
  meta?: RouteMeta;
}
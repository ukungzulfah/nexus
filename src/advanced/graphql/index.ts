/**
 * Nexus GraphQL Module
 * 
 * Optional GraphQL integration for Nexus framework.
 * Requires `graphql` as peer dependency.
 * 
 * Install: npm install graphql
 * 
 * Usage:
 * import { GraphQLServer, SimpleDataLoader } from '@engjts/server/graphql';
 */

export { GraphQLServer } from './server';
export { SimpleDataLoader } from './SimpleDataLoader';
export type {
    GraphQLComplexityOptions,
    GraphQLCacheOptions,
    GraphQLRequestPayload,
    GraphQLServerOptions,
    SimpleDataLoaderBatch,
    DataLoaderFactory
} from './types';

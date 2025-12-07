import { GraphQLSchema } from "graphql";
import { Context } from "vm";
import { MultiTierCache } from "../cache";
import { SimpleDataLoader } from "./SimpleDataLoader";

export interface GraphQLComplexityOptions {
    limit: number;
    cost?: Record<string, number>;
    defaultCost?: number;
}

export interface GraphQLCacheOptions {
    instance: MultiTierCache<any>;
    ttl?: number;
    keyGenerator?: (payload: GraphQLRequestPayload) => string;
}

export interface GraphQLRequestPayload {
    query?: string;
    variables?: Record<string, any>;
    operationName?: string;
}

export interface GraphQLServerOptions {
    schema: GraphQLSchema;
    context?: (args: { ctx: Context }) => Promise<Record<string, any>> | Record<string, any>;
    playground?: boolean;
    introspection?: boolean;
    cache?: GraphQLCacheOptions;
    complexity?: GraphQLComplexityOptions;
    depthLimit?: number;
    dataloaders?: boolean;
    formatError?: (error: any) => any;
    logger?: { debug?: (...args: any[]) => void; error?: (...args: any[]) => void };
}

export interface SimpleDataLoaderBatch<Key = any, Value = any> {
    keys: Key[];
    resolvers: Array<{ resolve: (value: Value) => void; reject: (error: Error) => void }>;
}

export type DataLoaderFactory = (ctx: Context) => Record<string, SimpleDataLoader>;

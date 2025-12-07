import { z, ZodObject, ZodRawShape } from 'zod';

export type ColumnShape = ZodRawShape;

export type RelationType = 'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany';

export interface RelationDefinition<
    TRelated extends string = string,
    TLocalKey extends string = string,
    TForeignKey extends string = string
> {
    type: RelationType;
    relatedTable: TRelated;
    localKey?: TLocalKey;
    foreignKey: TForeignKey;
    through?: {
        table: string;
        localPivotKey: string;
        foreignPivotKey: string;
    };
    eager?: {
        strategy: 'join' | 'separate';
        limit?: number;
    };
}

export interface IndexDefinition<TColumn extends string = string> {
    name?: string;
    columns: TColumn[];
    unique?: boolean;
    concurrent?: boolean;
    suggestion?: string;
}

export interface TableDefinition<
    TName extends string = string,
    TShape extends ColumnShape = ColumnShape,
    TRelations extends Record<string, RelationDefinition> = Record<string, RelationDefinition>
> {
    name: TName;
    schema: ZodObject<TShape>;
    primaryKey: keyof TShape & string;
    timestamps?: boolean;
    relations: TRelations;
    indexes: IndexDefinition<keyof TShape & string>[];
    meta?: Record<string, unknown>;
}

export type InferRow<TDefinition extends TableDefinition> = z.infer<TDefinition['schema']>;

export type SchemaDefinition = Record<string, TableDefinition>;

export interface DatabaseOptions {
    readonly name?: string;
    readonly logQueries?: boolean;
    readonly optimizer?: {
        nPlusOneThreshold?: number;
        slowQueryThresholdMs?: number;
    };
    readonly realtime?: {
        enabled?: boolean;
        bufferSize?: number;
    };
}

export interface QueryMetrics {
    sql: string;
    params: unknown[];
    duration: number;
    timestamp: number;
    table: string;
    plan?: string;
}

export interface QueryContext {
    label?: string;
    requestId?: string;
    route?: string;
    metadata?: Record<string, unknown>;
}

export interface TransactionContext {
    id: string;
    depth: number;
    savepoints: string[];
}


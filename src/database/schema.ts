import { z, ZodRawShape } from 'zod';
import {
    IndexDefinition,
    RelationDefinition,
    SchemaDefinition,
    TableDefinition
} from './types';

export interface DefineTableOptions<
    TName extends string,
    TShape extends ZodRawShape,
    TRelations extends Record<string, RelationDefinition> = Record<string, RelationDefinition>
> {
    name: TName;
    schema: z.ZodObject<TShape>;
    primaryKey?: keyof TShape & string;
    timestamps?: boolean;
    indexes?: IndexDefinition<keyof TShape & string>[];
    relations?: TRelations;
    meta?: Record<string, unknown>;
}

export function defineTable<
    TName extends string,
    TShape extends ZodRawShape,
    TRelations extends Record<string, RelationDefinition> = Record<string, RelationDefinition>
>(
    options: DefineTableOptions<TName, TShape, TRelations>
): TableDefinition<TName, TShape, TRelations> {
    return {
        name: options.name,
        schema: options.schema,
        primaryKey: (options.primaryKey || 'id') as keyof TShape & string,
        timestamps: options.timestamps ?? true,
        relations: options.relations ?? ({} as TRelations),
        indexes: options.indexes ?? [],
        meta: options.meta
    };
}

export function defineSchema<TTables extends SchemaDefinition>(tables: TTables): TTables {
    return tables;
}

export class SchemaInspector<TSchema extends SchemaDefinition> {
    constructor(private readonly schema: TSchema) {}

    table<TName extends keyof TSchema & string>(name: TName): TSchema[TName] {
        const table = this.schema[name];
        if (!table) {
            throw new Error(`Table "${name}" is not defined in the schema`);
        }
        return table;
    }

    listTables(): Array<[string, TableDefinition]> {
        return Object.entries(this.schema);
    }

    describe(tableName: keyof TSchema & string) {
        const table = this.table(tableName);
        return {
            name: table.name,
            columns: table.schema.keyof().options,
            primaryKey: table.primaryKey,
            relations: table.relations,
            indexes: table.indexes
        };
    }
}


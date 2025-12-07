import { DatabaseAdapter, MigrationAdapter } from './adapter';
import { MigrationCLI } from './migrations';
import { QueryOptimizer, QueryOptimizerOptions } from './optimizer';
import { QueryBuilder } from './query-builder';
import { RealtimeConfig, RealtimeDatabase } from './realtime';
import { SchemaDefinition, TableDefinition, DatabaseOptions, QueryContext } from './types';
import { TransactionManager } from './transactions';

export interface DatabaseConfig extends DatabaseOptions {
    optimizer?: QueryOptimizerOptions;
    realtime?: RealtimeConfig;
}

export class Database<TSchema extends SchemaDefinition> {
    private readonly optimizer: QueryOptimizer;
    private readonly realtime: RealtimeDatabase;
    private readonly transactions: TransactionManager;

    constructor(
        private readonly schema: TSchema,
        private readonly adapter: DatabaseAdapter,
        options: DatabaseConfig = {}
    ) {
        this.optimizer = new QueryOptimizer(schema, options.optimizer);
        this.realtime = new RealtimeDatabase(options.realtime);
        this.transactions = new TransactionManager(adapter);
    }

    table<TName extends keyof TSchema & string>(name: TName): QueryBuilder<TSchema, TName> {
        const definition = this.getTable(name);
        return new QueryBuilder<TSchema, TName>({
            schema: this.schema,
            table: definition,
            adapter: this.adapter,
            optimizer: this.optimizer,
            realtime: this.realtime
        });
    }

    async transaction<T>(callback: (db: this) => Promise<T>, context?: QueryContext) {
        return this.transactions.run(async () => callback(this), {
            label: context?.label
        });
    }

    migrations(options?: { directory?: string }) {
        const adapter = this.adapter as MigrationAdapter;
        if (!('runMigration' in adapter)) {
            throw new Error('Adapter does not implement migration capabilities');
        }
        return new MigrationCLI(adapter, options);
    }

    realtimeChanges() {
        return this.realtime;
    }

    getOptimizer() {
        return this.optimizer;
    }

    private getTable<TName extends keyof TSchema & string>(name: TName): TableDefinition {
        const table = this.schema[name];
        if (!table) {
            throw new Error(`Table "${name}" is not registered in the schema`);
        }
        return table;
    }
}


import { performance } from 'perf_hooks';
import { DatabaseAdapter } from './adapter';
import { detectDialect, SQLDialect } from './dialect';
import { QueryOptimizer } from './optimizer';
import { RealtimeDatabase } from './realtime';
import { InferRow, QueryContext, QueryMetrics, SchemaDefinition, TableDefinition } from './types';

interface BuilderState {
    selects: string[];
    joins: string[];
    where: string[];
    params: unknown[];
    orderBy: string[];
    limit?: number;
    offset?: number;
    relations: string[];
    alias?: string;
}

interface QueryBuilderOptions<TSchema extends SchemaDefinition> {
    schema: TSchema;
    table: TableDefinition;
    adapter: DatabaseAdapter;
    optimizer?: QueryOptimizer;
    realtime?: RealtimeDatabase;
    dialect?: SQLDialect;
}

type Direction = 'asc' | 'desc';

export class QueryBuilder<
    TSchema extends SchemaDefinition,
    TName extends keyof TSchema & string,
    TResult = InferRow<TSchema[TName]>,
    TSelection extends InferRow<TSchema[TName]> = InferRow<TSchema[TName]>
> {
    private readonly table: TableDefinition;
    private readonly adapter: DatabaseAdapter;
    private readonly schema: TSchema;
    private readonly optimizer?: QueryOptimizer;
    private readonly realtime?: RealtimeDatabase;
    private readonly dialect: SQLDialect;
    private state: BuilderState = {
        selects: [],
        joins: [],
        where: [],
        params: [],
        orderBy: [],
        relations: []
    };
    private latestHints: ReturnType<QueryOptimizer['consumeHints']> = [];

    constructor(options: QueryBuilderOptions<TSchema>) {
        this.table = options.table;
        this.adapter = options.adapter;
        this.schema = options.schema;
        this.optimizer = options.optimizer;
        this.realtime = options.realtime;
        this.dialect = options.dialect ?? detectDialect(options.adapter.name);
    }

    select<K extends readonly (keyof InferRow<TSchema[TName]>)[]>(
        ...columns: K
    ): QueryBuilder<TSchema, TName, TResult, Pick<InferRow<TSchema[TName]>, K[number]>> {
        this.state.selects = columns.map((column) => this.quote(column as string));
        return (this as unknown) as QueryBuilder<TSchema, TName, TResult, Pick<InferRow<TSchema[TName]>, K[number]>>;
    }

    alias(name: string) {
        this.state.alias = name;
        return this;
    }

    where(column: keyof InferRow<TSchema[TName]> | string, operatorOrValue: unknown, value?: unknown) {
        const operator = value === undefined ? '=' : operatorOrValue;
        const val = value === undefined ? operatorOrValue : value;
        const paramIndex = this.state.params.length + 1;
        const clause = `${this.quote(column as string)} ${operator} ${this.dialect.paramPlaceholder(paramIndex)}`;
        this.state.where.push(clause);
        this.state.params.push(val);
        return this;
    }

    whereIn(column: keyof InferRow<TSchema[TName]> | string, values: unknown[]) {
        if (!values || values.length === 0) {
            return this;
        }
        const placeholders = values.map((_, idx) => this.dialect.paramPlaceholder(this.state.params.length + idx + 1));
        this.state.where.push(`${this.quote(column as string)} IN (${placeholders.join(', ')})`);
        this.state.params.push(...values);
        return this;
    }

    whereRaw(sql: string, params: unknown[] = []) {
        this.state.where.push(sql);
        this.state.params.push(...params);
        return this;
    }

    join(table: string, localKey: string, foreignKey: string, type: 'inner' | 'left' = 'inner') {
        const clause = `${type.toUpperCase()} JOIN ${this.quote(table)} ON ${this.quote(localKey)} = ${this.quote(foreignKey)}`;
        this.state.joins.push(clause);
        return this;
    }

    orderBy(column: keyof InferRow<TSchema[TName]> | string, direction: Direction = 'asc') {
        this.state.orderBy.push(`${this.quote(column as string)} ${direction.toUpperCase()}`);
        return this;
    }

    limit(limit: number) {
        this.state.limit = limit;
        return this;
    }

    offset(offset: number) {
        this.state.offset = offset;
        return this;
    }

    withRelations(...relations: string[]): this {
        relations.forEach((relation) => {
            if (!this.table.relations[relation]) {
                throw new Error(`Relation "${relation}" is not defined on table "${this.table.name}"`);
            }
            if (!this.state.relations.includes(relation)) {
                this.state.relations.push(relation);
            }
        });
        return this;
    }

    async execute(context?: QueryContext): Promise<TSelection[]> {
        const { sql, params } = this.buildSelectQuery();
        const start = performance.now();
        const result = await this.adapter.query<TSelection>(sql, params, context);
        const duration = performance.now() - start;

        this.recordQuery({
            sql,
            params,
            duration,
            timestamp: Date.now(),
            table: this.table.name
        });

        let rows = result.rows;

        if (this.state.relations.length > 0) {
            rows = (await this.eagerLoad(rows, context)) as TSelection[];
        }

        return rows;
    }

    async first(context?: QueryContext): Promise<TSelection | null> {
        const rows = await this.limit(1).execute(context);
        return rows[0] ?? null;
    }

    async insert(data: Partial<InferRow<TSchema[TName]>> | Array<Partial<InferRow<TSchema[TName]>>>, context?: QueryContext) {
        const rows = Array.isArray(data) ? data : [data];
        if (rows.length === 0) {
            throw new Error('Insert requires at least one row');
        }

        const columns = Object.keys(rows[0]);
        const columnList = columns.map((col) => this.quote(col)).join(', ');
        const valueGroups = rows.map((_row, rowIndex) => {
            const placeholders = columns.map((_, colIndex) => 
                this.dialect.paramPlaceholder(rowIndex * columns.length + colIndex + 1)
            );
            return `(${placeholders.join(', ')})`;
        });
        const params = rows.flatMap((row) => columns.map((column) => (row as Record<string, unknown>)[column]));

        const returning = this.dialect.returning();
        const sql = `INSERT INTO ${this.quote(this.table.name)} (${columnList}) VALUES ${valueGroups.join(', ')}${returning ? ' ' + returning : ''}`;
        const start = performance.now();
        const result = await this.adapter.query(sql, params, context);
        const duration = performance.now() - start;

        this.recordQuery({
            sql,
            params,
            duration,
            timestamp: Date.now(),
            table: this.table.name
        });

        result.rows.forEach((row) => {
            this.realtime?.emit({
                table: this.table.name,
                type: 'insert',
                payload: row,
                timestamp: Date.now()
            });
        });

        return result;
    }

    async update(values: Partial<InferRow<TSchema[TName]>>, context?: QueryContext) {
        if (Object.keys(values).length === 0) {
            throw new Error('Update requires at least one value');
        }

        const setClauses = Object.keys(values).map((key, idx) => 
            `${this.quote(key)} = ${this.dialect.paramPlaceholder(idx + 1)}`
        );
        const params = Object.values(values);
        const whereClause = this.buildWhereClause(params.length + 1);

        const returning = this.dialect.returning();
        const sql = [
            `UPDATE ${this.quote(this.table.name)}`,
            `SET ${setClauses.join(', ')}`,
            whereClause ? `WHERE ${whereClause}` : '',
            returning
        ]
            .filter(Boolean)
            .join(' ');

        const start = performance.now();
        const result = await this.adapter.query(sql, [...params, ...this.state.params], context);
        const duration = performance.now() - start;

        this.recordQuery({
            sql,
            params: [...params, ...this.state.params],
            duration,
            timestamp: Date.now(),
            table: this.table.name
        });

        result.rows.forEach((row) => {
            this.realtime?.emit({
                table: this.table.name,
                type: 'update',
                payload: row,
                timestamp: Date.now()
            });
        });

        return result;
    }

    async delete(context?: QueryContext) {
        const whereClause = this.buildWhereClause(1);
        const returning = this.dialect.returning();
        const sql = [
            `DELETE FROM ${this.quote(this.table.name)}`,
            whereClause ? `WHERE ${whereClause}` : '',
            returning
        ]
            .filter(Boolean)
            .join(' ');

        const start = performance.now();
        const result = await this.adapter.query(sql, this.state.params, context);
        const duration = performance.now() - start;

        this.recordQuery({
            sql,
            params: this.state.params,
            duration,
            timestamp: Date.now(),
            table: this.table.name
        });

        result.rows.forEach((row) => {
            this.realtime?.emit({
                table: this.table.name,
                type: 'delete',
                payload: row,
                timestamp: Date.now()
            });
        });

        return result;
    }

    getOptimizerHints() {
        return this.latestHints;
    }

    private buildSelectQuery() {
        const columns = this.state.selects.length ? this.state.selects.join(', ') : '*';
        const alias = this.state.alias ? ` AS ${this.state.alias}` : '';
        let sql = `SELECT ${columns} FROM ${this.quote(this.table.name)}${alias}`;

        if (this.state.joins.length) {
            sql += ` ${this.state.joins.join(' ')}`;
        }
        if (this.state.where.length) {
            sql += ` WHERE ${this.state.where.join(' AND ')}`;
        }
        if (this.state.orderBy.length) {
            sql += ` ORDER BY ${this.state.orderBy.join(', ')}`;
        }
        
        const limitOffset = this.dialect.limitOffset(this.state.limit, this.state.offset);
        if (limitOffset) {
            sql += ` ${limitOffset}`;
        }

        return { sql, params: [...this.state.params] };
    }

    private buildWhereClause(offset: number) {
        if (this.state.where.length === 0) return '';
        return this.state.where
            .map((clause) => {
                // Replace parameter placeholders with offset-adjusted ones
                let paramIndex = 0;
                return clause.replace(/\$(\d+)|\?(\d+)?|\?/g, () => {
                    paramIndex++;
                    return this.dialect.paramPlaceholder(paramIndex + offset - 1);
                });
            })
            .join(' AND ');
    }

    private quote(identifier: string) {
        return this.dialect.quoteIdentifier(identifier);
    }

    private async eagerLoad(rows: TSelection[], context?: QueryContext) {
        if (rows.length === 0) {
            return rows;
        }

        for (const relationName of this.state.relations) {
            const relation = this.table.relations[relationName];
            if (!relation) continue;

            const relatedTable = this.schema[relation.relatedTable];
            if (!relatedTable) {
                throw new Error(`Related table "${relation.relatedTable}" not found for relation "${relationName}"`);
            }

            const localKey = (relation.localKey ?? this.table.primaryKey) as string;
            const foreignKey = relation.foreignKey as string;
            const localValues = Array.from(
                new Set(
                    rows
                        .map((row) => (row as Record<string, unknown>)[localKey] as string | number | undefined)
                        .filter((value): value is string | number => value !== undefined && value !== null)
                )
            );

            if (localValues.length === 0) continue;

            const relatedRows = await this.createBuilderForTable(relation.relatedTable as keyof TSchema & string, relatedTable)
                .whereIn(foreignKey, localValues)
                .execute(context);

            const grouped = relatedRows.reduce<Record<string | number, unknown[]>>((acc, row) => {
                const key = (row as Record<string, unknown>)[foreignKey] as string | number | undefined;
                if (key === undefined || key === null) return acc;
                acc[key] = acc[key] || [];
                acc[key].push(row);
                return acc;
            }, {});

            rows.forEach((row) => {
                const key = (row as Record<string, unknown>)[localKey] as string | number | undefined;
                if (key === undefined || key === null) {
                    if (relation.type === 'hasOne' || relation.type === 'belongsTo') {
                        (row as Record<string, unknown>)[relationName] = null;
                    } else {
                        (row as Record<string, unknown>)[relationName] = [];
                    }
                    return;
                }
                if (relation.type === 'hasOne' || relation.type === 'belongsTo') {
                    (row as Record<string, unknown>)[relationName] = grouped[key]?.[0] ?? null;
                } else {
                    (row as Record<string, unknown>)[relationName] = grouped[key] ?? [];
                }
            });
        }

        return rows;
    }

    private createBuilderForTable<TName extends keyof TSchema & string>(_name: TName, table: TableDefinition) {
        return new QueryBuilder<TSchema, TName>({
            schema: this.schema,
            table,
            adapter: this.adapter,
            optimizer: this.optimizer,
            realtime: this.realtime,
            dialect: this.dialect
        });
    }

    private recordQuery(metrics: QueryMetrics) {
        if (!this.optimizer) return;
        this.optimizer.analyze(metrics);
        this.latestHints = this.optimizer.consumeHints();
    }
}


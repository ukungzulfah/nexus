import { QueryContext } from './types';

export interface QueryResult<T = unknown> {
    rows: T[];
    rowCount: number;
    fields?: string[];
    meta?: Record<string, unknown>;
}

export interface DatabaseAdapter {
    name: string;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    query<T = unknown>(sql: string, params?: unknown[], context?: QueryContext): Promise<QueryResult<T>>;
    stream?<T = unknown>(sql: string, params?: unknown[], context?: QueryContext): AsyncGenerator<T, void, unknown>;
    beginTransaction?(): Promise<void>;
    commitTransaction?(): Promise<void>;
    rollbackTransaction?(savepoint?: string): Promise<void>;
    createSavepoint?(name: string): Promise<void>;
    releaseSavepoint?(name: string): Promise<void>;
    listen?(channel: string): Promise<void>;
    notify?(channel: string, payload: unknown): Promise<void>;
    capabilities?: {
        json?: boolean;
        streaming?: boolean;
        realtime?: boolean;
        transactional?: boolean;
    };
}

export interface MigrationAdapter extends DatabaseAdapter {
    runMigration(sql: string): Promise<void>;
    ensureMigrationsTable(): Promise<void>;
}


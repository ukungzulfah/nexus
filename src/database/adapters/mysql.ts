import { EventEmitter } from 'events';
import { DatabaseAdapter, MigrationAdapter, QueryResult } from '../adapter';
import { QueryContext } from '../types';

/**
 * MySQL connection configuration
 */
export interface MySQLConnectionConfig {
    host: string;
    port?: number;
    user: string;
    password: string;
    database: string;
    charset?: string;
    timezone?: string;
    connectTimeout?: number;
    ssl?: {
        ca?: string;
        cert?: string;
        key?: string;
        rejectUnauthorized?: boolean;
    };
}

/**
 * MySQL pool configuration
 */
export interface MySQLPoolConfig extends MySQLConnectionConfig {
    pool?: {
        min?: number;
        max?: number;
        idleTimeout?: number;
        acquireTimeout?: number;
        createTimeout?: number;
        destroyTimeout?: number;
        reapInterval?: number;
        createRetryInterval?: number;
    };
}

/**
 * MySQL replica configuration for read scaling
 */
export interface MySQLReplicaConfig {
    primary: MySQLPoolConfig;
    replicas?: MySQLPoolConfig[];
    readPreference?: 'primary' | 'replica' | 'nearest';
}

/**
 * Internal connection interface (abstracted from mysql2)
 */
interface MySQLConnection {
    query(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
    execute(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
    end(): Promise<void>;
    ping(): Promise<void>;
}

/**
 * Internal pool interface (abstracted from mysql2)
 */
interface MySQLPool {
    getConnection(): Promise<MySQLConnection>;
    query(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
    execute(sql: string, params?: unknown[]): Promise<[unknown[], unknown]>;
    end(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
}

/**
 * MySQL2 library interface for dynamic import
 */
interface MySQL2Library {
    createPool(config: Record<string, unknown>): MySQLPool;
}

/**
 * Pool statistics for monitoring
 */
export interface MySQLPoolStats {
    totalConnections: number;
    idleConnections: number;
    pendingRequests: number;
    maxConnections: number;
}

/**
 * MySQL Adapter implementing DatabaseAdapter and MigrationAdapter interfaces.
 * Provides connection pooling, replica support, and MySQL-specific features.
 */
export class MySQLAdapter implements DatabaseAdapter, MigrationAdapter {
    readonly name = 'mysql';

    readonly capabilities = {
        json: true,
        streaming: true,
        realtime: false, // MySQL doesn't have native LISTEN/NOTIFY like PostgreSQL
        transactional: true
    };

    private pool: MySQLPool | null = null;
    private replicaPools: MySQLPool[] = [];
    private currentReplicaIndex = 0;
    private mysql2: MySQL2Library | null = null;
    private activeConnection: MySQLConnection | null = null;
    private readonly emitter = new EventEmitter();
    private connected = false;

    constructor(private readonly config: MySQLReplicaConfig | MySQLPoolConfig) {}

    /**
     * Establish connection to MySQL database with connection pooling
     */
    async connect(): Promise<void> {
        if (this.connected) {
            return;
        }

        // Load MySQL driver first - throw immediately if not installed
        // Don't emit error event for missing dependency
        this.mysql2 = await this.loadMySQLDriver();

        try {
            const primaryConfig = this.isPrimaryReplicaConfig(this.config)
                ? this.config.primary
                : this.config;

            this.pool = this.createPool(primaryConfig);

            // Setup replica pools if configured
            if (this.isPrimaryReplicaConfig(this.config) && this.config.replicas) {
                for (const replicaConfig of this.config.replicas) {
                    const replicaPool = this.createPool(replicaConfig);
                    this.replicaPools.push(replicaPool);
                }
            }

            // Test connection
            await this.pool.query('SELECT 1');
            this.connected = true;
            this.emitter.emit('connected');
        } catch (error) {
            this.emitter.emit('error', error);
            throw new Error(`Failed to connect to MySQL: ${(error as Error).message}`);
        }
    }

    /**
     * Gracefully disconnect from MySQL database
     */
    async disconnect(): Promise<void> {
        if (!this.connected) {
            return;
        }

        try {
            // Close replica pools
            for (const replicaPool of this.replicaPools) {
                await replicaPool.end();
            }
            this.replicaPools = [];

            // Close primary pool
            if (this.pool) {
                await this.pool.end();
                this.pool = null;
            }

            this.connected = false;
            this.emitter.emit('disconnected');
        } catch (error) {
            this.emitter.emit('error', error);
            throw error;
        }
    }

    /**
     * Execute a query against the database
     */
    async query<T = unknown>(
        sql: string,
        params?: unknown[],
        context?: QueryContext
    ): Promise<QueryResult<T>> {
        this.ensureConnected();

        const pool = this.selectPool(sql);
        const normalizedSql = this.normalizeQuery(sql);
        const normalizedParams = this.normalizeParams(params);

        try {
            const startTime = Date.now();
            const [rows, fields] = await pool.execute(normalizedSql, normalizedParams);
            const duration = Date.now() - startTime;

            this.emitter.emit('query', {
                sql: normalizedSql,
                params: normalizedParams,
                duration,
                context
            });

            // Handle different result types
            if (Array.isArray(rows)) {
                return {
                    rows: rows as T[],
                    rowCount: rows.length,
                    fields: this.extractFieldNames(fields),
                    meta: { duration }
                };
            }

            // For INSERT/UPDATE/DELETE, mysql2 returns ResultSetHeader
            const resultHeader = rows as {
                affectedRows?: number;
                insertId?: number;
                changedRows?: number;
            };

            return {
                rows: [] as T[],
                rowCount: resultHeader.affectedRows ?? 0,
                meta: {
                    insertId: resultHeader.insertId,
                    affectedRows: resultHeader.affectedRows,
                    changedRows: resultHeader.changedRows,
                    duration
                }
            };
        } catch (error) {
            this.emitter.emit('error', { error, sql: normalizedSql, params: normalizedParams });
            throw this.wrapError(error as Error, normalizedSql);
        }
    }

    /**
     * Stream query results for large datasets
     */
    async *stream<T = unknown>(
        sql: string,
        params?: unknown[],
        context?: QueryContext
    ): AsyncGenerator<T, void, unknown> {
        this.ensureConnected();

        const pool = this.selectPool(sql);
        const normalizedSql = this.normalizeQuery(sql);
        const normalizedParams = this.normalizeParams(params);

        const connection = await pool.getConnection();

        try {
            this.emitter.emit('stream:start', { sql: normalizedSql, context });

            // Execute query and yield rows one by one
            const [rows] = await connection.execute(normalizedSql, normalizedParams);

            if (Array.isArray(rows)) {
                for (const row of rows) {
                    yield row as T;
                }
            }

            this.emitter.emit('stream:end', { sql: normalizedSql, context });
        } catch (error) {
            this.emitter.emit('error', { error, sql: normalizedSql, params: normalizedParams });
            throw this.wrapError(error as Error, normalizedSql);
        } finally {
            connection.release();
        }
    }

    /**
     * Begin a new transaction
     */
    async beginTransaction(): Promise<void> {
        this.ensureConnected();

        if (this.activeConnection) {
            throw new Error('Transaction already in progress');
        }

        this.activeConnection = await this.pool!.getConnection();
        await this.activeConnection.beginTransaction();
        this.emitter.emit('transaction:begin');
    }

    /**
     * Commit the current transaction
     */
    async commitTransaction(): Promise<void> {
        if (!this.activeConnection) {
            throw new Error('No active transaction to commit');
        }

        try {
            await this.activeConnection.commit();
            this.emitter.emit('transaction:commit');
        } finally {
            this.activeConnection.release();
            this.activeConnection = null;
        }
    }

    /**
     * Rollback the current transaction
     */
    async rollbackTransaction(savepoint?: string): Promise<void> {
        if (!this.activeConnection) {
            throw new Error('No active transaction to rollback');
        }

        try {
            if (savepoint) {
                await this.activeConnection.query(`ROLLBACK TO SAVEPOINT ${this.quote(savepoint)}`);
            } else {
                await this.activeConnection.rollback();
            }
            this.emitter.emit('transaction:rollback', { savepoint });
        } finally {
            if (!savepoint) {
                this.activeConnection.release();
                this.activeConnection = null;
            }
        }
    }

    /**
     * Create a savepoint within a transaction
     */
    async createSavepoint(name: string): Promise<void> {
        if (!this.activeConnection) {
            throw new Error('Cannot create savepoint outside of transaction');
        }

        await this.activeConnection.query(`SAVEPOINT ${this.quote(name)}`);
        this.emitter.emit('savepoint:create', { name });
    }

    /**
     * Release a savepoint
     */
    async releaseSavepoint(name: string): Promise<void> {
        if (!this.activeConnection) {
            throw new Error('Cannot release savepoint outside of transaction');
        }

        await this.activeConnection.query(`RELEASE SAVEPOINT ${this.quote(name)}`);
        this.emitter.emit('savepoint:release', { name });
    }

    /**
     * Run a migration SQL statement
     */
    async runMigration(sql: string): Promise<void> {
        this.ensureConnected();

        // Split multiple statements and execute them separately
        const statements = this.splitStatements(sql);

        for (const statement of statements) {
            const trimmed = statement.trim();
            if (trimmed) {
                await this.pool!.query(trimmed);
            }
        }
    }

    /**
     * Ensure migrations table exists
     */
    async ensureMigrationsTable(): Promise<void> {
        this.ensureConnected();

        const sql = `
            CREATE TABLE IF NOT EXISTS \`migrations\` (
                \`id\` INT AUTO_INCREMENT PRIMARY KEY,
                \`name\` VARCHAR(255) NOT NULL,
                \`executed_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                \`batch\` INT NOT NULL DEFAULT 1,
                UNIQUE KEY \`unique_migration_name\` (\`name\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `;

        await this.pool!.query(sql);
    }

    /**
     * Get pool statistics for monitoring
     */
    getPoolStats(): MySQLPoolStats {
        // Note: mysql2 pool doesn't expose these directly
        // This is a placeholder for monitoring integration
        return {
            totalConnections: 0,
            idleConnections: 0,
            pendingRequests: 0,
            maxConnections: this.getPoolConfig().pool?.max ?? 10
        };
    }

    /**
     * Health check - ping the database
     */
    async ping(): Promise<boolean> {
        if (!this.connected || !this.pool) {
            return false;
        }

        try {
            await this.pool.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Subscribe to adapter events
     */
    on(event: string, listener: (...args: unknown[]) => void): void {
        this.emitter.on(event, listener);
    }

    /**
     * Unsubscribe from adapter events
     */
    off(event: string, listener: (...args: unknown[]) => void): void {
        this.emitter.off(event, listener);
    }

    /**
     * Quote an identifier (table name, column name, etc.)
     */
    quote(identifier: string): string {
        // MySQL uses backticks for identifiers
        if (identifier.includes('.')) {
            return identifier
                .split('.')
                .map((part) => `\`${part.replace(/`/g, '``')}\``)
                .join('.');
        }
        return `\`${identifier.replace(/`/g, '``')}\``;
    }

    /**
     * Escape a string value
     */
    escape(value: string): string {
        return value
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\x00/g, '\\0')
            .replace(/\x1a/g, '\\Z');
    }

    // ==================== Private Methods ====================

    private async loadMySQLDriver(): Promise<MySQL2Library> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mysql2 = require('mysql2/promise');
            return mysql2.default || mysql2;
        } catch (error) {
            throw new Error(
                `mysql2 package is required for MySQLAdapter. Install it with: npm install mysql2`
            );
        }
    }

    private createPool(config: MySQLPoolConfig): MySQLPool {
        if (!this.mysql2) {
            throw new Error('MySQL driver not loaded');
        }

        const poolConfig = {
            host: config.host,
            port: config.port ?? 3306,
            user: config.user,
            password: config.password,
            database: config.database,
            charset: config.charset ?? 'utf8mb4',
            timezone: config.timezone ?? 'Z',
            connectTimeout: config.connectTimeout ?? 10000,
            waitForConnections: true,
            connectionLimit: config.pool?.max ?? 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            ...(config.ssl && {
                ssl: {
                    ca: config.ssl.ca,
                    cert: config.ssl.cert,
                    key: config.ssl.key,
                    rejectUnauthorized: config.ssl.rejectUnauthorized ?? true
                }
            })
        };

        const pool = this.mysql2.createPool(poolConfig);

        // Setup error handling
        pool.on('error', (err: unknown) => {
            this.emitter.emit('pool:error', err);
        });

        return pool;
    }

    private isPrimaryReplicaConfig(config: MySQLReplicaConfig | MySQLPoolConfig): config is MySQLReplicaConfig {
        return 'primary' in config;
    }

    private getPoolConfig(): MySQLPoolConfig {
        return this.isPrimaryReplicaConfig(this.config) ? this.config.primary : this.config;
    }

    private selectPool(sql: string): MySQLPool {
        // Use primary for write operations or if no replicas
        if (this.replicaPools.length === 0 || this.isWriteQuery(sql) || this.activeConnection) {
            return this.pool!;
        }

        // Round-robin selection for read queries
        const readPreference = this.isPrimaryReplicaConfig(this.config)
            ? this.config.readPreference ?? 'replica'
            : 'primary';

        if (readPreference === 'primary') {
            return this.pool!;
        }

        // Select replica using round-robin
        const replica = this.replicaPools[this.currentReplicaIndex];
        this.currentReplicaIndex = (this.currentReplicaIndex + 1) % this.replicaPools.length;
        return replica;
    }

    private isWriteQuery(sql: string): boolean {
        const normalized = sql.trim().toUpperCase();
        return (
            normalized.startsWith('INSERT') ||
            normalized.startsWith('UPDATE') ||
            normalized.startsWith('DELETE') ||
            normalized.startsWith('CREATE') ||
            normalized.startsWith('ALTER') ||
            normalized.startsWith('DROP') ||
            normalized.startsWith('TRUNCATE') ||
            normalized.startsWith('REPLACE')
        );
    }

    private normalizeQuery(sql: string): string {
        // Convert PostgreSQL-style parameters ($1, $2, etc.) to MySQL-style (?)
        let paramIndex = 0;
        return sql.replace(/\$(\d+)/g, () => {
            paramIndex++;
            return '?';
        });
    }

    private normalizeParams(params?: unknown[]): unknown[] {
        if (!params) return [];

        return params.map((param) => {
            // Handle undefined as null
            if (param === undefined) return null;

            // Handle Date objects
            if (param instanceof Date) {
                return param.toISOString().slice(0, 19).replace('T', ' ');
            }

            // Handle objects/arrays as JSON
            if (typeof param === 'object' && param !== null) {
                return JSON.stringify(param);
            }

            return param;
        });
    }

    private extractFieldNames(fields: unknown): string[] {
        if (!Array.isArray(fields)) return [];
        return fields.map((field: { name?: string }) => field.name ?? '');
    }

    private splitStatements(sql: string): string[] {
        // Simple statement splitter - handles basic cases
        // For complex migrations, consider using a proper SQL parser
        const statements: string[] = [];
        let current = '';
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < sql.length; i++) {
            const char = sql[i];
            const prevChar = sql[i - 1];

            // Track string literals
            if ((char === "'" || char === '"') && prevChar !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            // Split on semicolon if not in string
            if (char === ';' && !inString) {
                const stmt = current.trim();
                if (stmt) {
                    statements.push(stmt);
                }
                current = '';
            } else {
                current += char;
            }
        }

        // Don't forget the last statement
        const lastStmt = current.trim();
        if (lastStmt) {
            statements.push(lastStmt);
        }

        return statements;
    }

    private ensureConnected(): void {
        if (!this.connected || !this.pool) {
            throw new Error('MySQLAdapter is not connected. Call connect() first.');
        }
    }

    private wrapError(error: Error, sql: string): Error {
        const mysqlError = error as Error & { code?: string; errno?: number; sqlState?: string };
        
        const enhancedError = new Error(
            `MySQL Error: ${mysqlError.message}\nQuery: ${sql.slice(0, 200)}...`
        );

        // Preserve original error properties
        Object.assign(enhancedError, {
            code: mysqlError.code,
            errno: mysqlError.errno,
            sqlState: mysqlError.sqlState,
            originalError: error
        });

        return enhancedError;
    }
}

/**
 * Factory function to create a MySQL adapter
 */
export function createMySQLAdapter(config: MySQLReplicaConfig | MySQLPoolConfig): MySQLAdapter {
    return new MySQLAdapter(config);
}

/**
 * SQL Dialect abstraction for cross-database compatibility.
 * Handles differences in SQL syntax between MySQL and PostgreSQL.
 */

export interface SQLDialect {
    /** Dialect name identifier */
    readonly name: 'mysql' | 'postgresql' | 'sqlite';

    /** Quote an identifier (table/column name) */
    quoteIdentifier(identifier: string): string;

    /** Create a parameter placeholder for the given index (1-based) */
    paramPlaceholder(index: number): string;

    /** Format a LIMIT/OFFSET clause */
    limitOffset(limit?: number, offset?: number): string;

    /** Format RETURNING clause for INSERT/UPDATE/DELETE */
    returning(columns?: string[]): string;

    /** Whether the dialect supports RETURNING */
    supportsReturning: boolean;

    /** Format boolean value */
    formatBoolean(value: boolean): string;

    /** Format date/timestamp for insertion */
    formatDate(date: Date): string;

    /** Format JSON value */
    formatJson(value: unknown): string;

    /** Get current timestamp expression */
    currentTimestamp(): string;

    /** Get auto-increment column definition */
    autoIncrement(): string;

    /** Get primary key column type */
    serialType(): string;

    /** String concatenation operator or function */
    concat(...parts: string[]): string;

    /** ILIKE or case-insensitive LIKE support */
    ilike(column: string, pattern: string): string;

    /** JSON extraction operator/function */
    jsonExtract(column: string, path: string): string;

    /** Upsert (INSERT ... ON CONFLICT/DUPLICATE) syntax */
    upsert(
        table: string,
        columns: string[],
        values: string[],
        conflictColumns: string[],
        updateColumns: string[]
    ): string;
}

/**
 * MySQL Dialect implementation
 */
export class MySQLDialect implements SQLDialect {
    readonly name = 'mysql' as const;
    readonly supportsReturning = false; // Standard MySQL doesn't support RETURNING

    quoteIdentifier(identifier: string): string {
        if (identifier.includes('.')) {
            return identifier
                .split('.')
                .map((part) => `\`${part.replace(/`/g, '``')}\``)
                .join('.');
        }
        return `\`${identifier.replace(/`/g, '``')}\``;
    }

    paramPlaceholder(_index: number): string {
        return '?';
    }

    limitOffset(limit?: number, offset?: number): string {
        const parts: string[] = [];
        if (limit !== undefined) {
            parts.push(`LIMIT ${limit}`);
        }
        if (offset !== undefined) {
            // MySQL requires LIMIT when using OFFSET
            if (limit === undefined) {
                parts.push('LIMIT 18446744073709551615'); // Max BIGINT
            }
            parts.push(`OFFSET ${offset}`);
        }
        return parts.join(' ');
    }

    returning(_columns?: string[]): string {
        // MySQL doesn't support RETURNING, use LAST_INSERT_ID() instead
        return '';
    }

    formatBoolean(value: boolean): string {
        return value ? '1' : '0';
    }

    formatDate(date: Date): string {
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }

    formatJson(value: unknown): string {
        return JSON.stringify(value);
    }

    currentTimestamp(): string {
        return 'CURRENT_TIMESTAMP';
    }

    autoIncrement(): string {
        return 'AUTO_INCREMENT';
    }

    serialType(): string {
        return 'INT AUTO_INCREMENT';
    }

    concat(...parts: string[]): string {
        return `CONCAT(${parts.join(', ')})`;
    }

    ilike(column: string, pattern: string): string {
        // MySQL LIKE is case-insensitive for non-binary strings by default
        return `${column} LIKE ${pattern}`;
    }

    jsonExtract(column: string, path: string): string {
        // MySQL 5.7+ JSON support
        return `JSON_EXTRACT(${column}, '${path}')`;
    }

    upsert(
        table: string,
        columns: string[],
        values: string[],
        _conflictColumns: string[],
        updateColumns: string[]
    ): string {
        const columnList = columns.join(', ');
        const valueList = values.join(', ');
        const updateList = updateColumns
            .map((col) => `${col} = VALUES(${col})`)
            .join(', ');

        return `INSERT INTO ${table} (${columnList}) VALUES (${valueList}) ON DUPLICATE KEY UPDATE ${updateList}`;
    }
}

/**
 * PostgreSQL Dialect implementation
 */
export class PostgreSQLDialect implements SQLDialect {
    readonly name = 'postgresql' as const;
    readonly supportsReturning = true;

    quoteIdentifier(identifier: string): string {
        if (identifier.includes('.')) {
            return identifier
                .split('.')
                .map((part) => `"${part.replace(/"/g, '""')}"`)
                .join('.');
        }
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    paramPlaceholder(index: number): string {
        return `$${index}`;
    }

    limitOffset(limit?: number, offset?: number): string {
        const parts: string[] = [];
        if (limit !== undefined) {
            parts.push(`LIMIT ${limit}`);
        }
        if (offset !== undefined) {
            parts.push(`OFFSET ${offset}`);
        }
        return parts.join(' ');
    }

    returning(columns?: string[]): string {
        if (!columns || columns.length === 0) {
            return 'RETURNING *';
        }
        return `RETURNING ${columns.join(', ')}`;
    }

    formatBoolean(value: boolean): string {
        return value ? 'TRUE' : 'FALSE';
    }

    formatDate(date: Date): string {
        return date.toISOString();
    }

    formatJson(value: unknown): string {
        return JSON.stringify(value);
    }

    currentTimestamp(): string {
        return 'NOW()';
    }

    autoIncrement(): string {
        return ''; // PostgreSQL uses SERIAL type instead
    }

    serialType(): string {
        return 'SERIAL';
    }

    concat(...parts: string[]): string {
        return parts.join(' || ');
    }

    ilike(column: string, pattern: string): string {
        return `${column} ILIKE ${pattern}`;
    }

    jsonExtract(column: string, path: string): string {
        // PostgreSQL JSONB operators
        const pathParts = path.split('.');
        if (pathParts.length === 1) {
            return `${column}->>'${pathParts[0]}'`;
        }
        const intermediatePath = pathParts.slice(0, -1).map((p) => `'${p}'`).join('->');
        const lastPart = pathParts[pathParts.length - 1];
        return `${column}->${intermediatePath}->>'${lastPart}'`;
    }

    upsert(
        table: string,
        columns: string[],
        values: string[],
        conflictColumns: string[],
        updateColumns: string[]
    ): string {
        const columnList = columns.join(', ');
        const valueList = values.join(', ');
        const conflictList = conflictColumns.join(', ');
        const updateList = updateColumns
            .map((col) => `${col} = EXCLUDED.${col}`)
            .join(', ');

        return `INSERT INTO ${table} (${columnList}) VALUES (${valueList}) ON CONFLICT (${conflictList}) DO UPDATE SET ${updateList}`;
    }
}

/**
 * SQLite Dialect implementation (for testing/development)
 */
export class SQLiteDialect implements SQLDialect {
    readonly name = 'sqlite' as const;
    readonly supportsReturning = true; // SQLite 3.35.0+ supports RETURNING

    quoteIdentifier(identifier: string): string {
        if (identifier.includes('.')) {
            return identifier
                .split('.')
                .map((part) => `"${part.replace(/"/g, '""')}"`)
                .join('.');
        }
        return `"${identifier.replace(/"/g, '""')}"`;
    }

    paramPlaceholder(index: number): string {
        return `?${index}`;
    }

    limitOffset(limit?: number, offset?: number): string {
        const parts: string[] = [];
        if (limit !== undefined) {
            parts.push(`LIMIT ${limit}`);
        }
        if (offset !== undefined) {
            parts.push(`OFFSET ${offset}`);
        }
        return parts.join(' ');
    }

    returning(columns?: string[]): string {
        if (!columns || columns.length === 0) {
            return 'RETURNING *';
        }
        return `RETURNING ${columns.join(', ')}`;
    }

    formatBoolean(value: boolean): string {
        return value ? '1' : '0';
    }

    formatDate(date: Date): string {
        return date.toISOString();
    }

    formatJson(value: unknown): string {
        return JSON.stringify(value);
    }

    currentTimestamp(): string {
        return "datetime('now')";
    }

    autoIncrement(): string {
        return 'AUTOINCREMENT';
    }

    serialType(): string {
        return 'INTEGER PRIMARY KEY AUTOINCREMENT';
    }

    concat(...parts: string[]): string {
        return parts.join(' || ');
    }

    ilike(column: string, pattern: string): string {
        // SQLite LIKE is case-insensitive for ASCII by default
        return `${column} LIKE ${pattern}`;
    }

    jsonExtract(column: string, path: string): string {
        return `json_extract(${column}, '$.${path}')`;
    }

    upsert(
        table: string,
        columns: string[],
        values: string[],
        conflictColumns: string[],
        updateColumns: string[]
    ): string {
        const columnList = columns.join(', ');
        const valueList = values.join(', ');
        const conflictList = conflictColumns.join(', ');
        const updateList = updateColumns
            .map((col) => `${col} = EXCLUDED.${col}`)
            .join(', ');

        return `INSERT INTO ${table} (${columnList}) VALUES (${valueList}) ON CONFLICT (${conflictList}) DO UPDATE SET ${updateList}`;
    }
}

/**
 * Get dialect instance by name
 */
export function getDialect(name: 'mysql' | 'postgresql' | 'sqlite'): SQLDialect {
    switch (name) {
        case 'mysql':
            return new MySQLDialect();
        case 'postgresql':
            return new PostgreSQLDialect();
        case 'sqlite':
            return new SQLiteDialect();
        default:
            throw new Error(`Unknown SQL dialect: ${name}`);
    }
}

/**
 * Detect dialect from adapter name
 */
export function detectDialect(adapterName: string): SQLDialect {
    const normalized = adapterName.toLowerCase();
    
    if (normalized.includes('mysql') || normalized.includes('mariadb')) {
        return new MySQLDialect();
    }
    
    if (normalized.includes('postgres') || normalized.includes('pg')) {
        return new PostgreSQLDialect();
    }
    
    if (normalized.includes('sqlite')) {
        return new SQLiteDialect();
    }
    
    // Default to PostgreSQL dialect
    return new PostgreSQLDialect();
}

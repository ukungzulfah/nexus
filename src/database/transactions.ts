import { randomUUID } from 'crypto';
import { DatabaseAdapter } from './adapter';
import { TransactionContext } from './types';

export interface TransactionOptions {
    label?: string;
    useSavepoints?: boolean;
}

export class TransactionManager {
    constructor(private readonly adapter: DatabaseAdapter) {}

    async run<T>(callback: (ctx: TransactionContext) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
        const context: TransactionContext = {
            id: options.label ?? randomUUID(),
            depth: 0,
            savepoints: []
        };

        const supportsTransactions = this.adapter.capabilities?.transactional !== false;

        if (!supportsTransactions) {
            return callback(context);
        }

        await this.adapter.beginTransaction?.();

        try {
            const result = await callback(context);
            await this.adapter.commitTransaction?.();
            return result;
        } catch (error) {
            await this.adapter.rollbackTransaction?.();
            throw error;
        }
    }

    async withSavepoint<T>(callback: () => Promise<T>, context: TransactionContext): Promise<T> {
        const savepoint = `${context.id}-sp-${context.depth}`;
        context.depth += 1;
        context.savepoints.push(savepoint);

        try {
            await this.adapter.createSavepoint?.(savepoint);
            const result = await callback();
            await this.adapter.releaseSavepoint?.(savepoint);
            return result;
        } catch (error) {
            await this.adapter.rollbackTransaction?.(savepoint);
            throw error;
        } finally {
            context.depth -= 1;
        }
    }
}


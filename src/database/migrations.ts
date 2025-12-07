import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { MigrationAdapter } from './adapter';

export interface MigrationFile {
    id: string;
    name: string;
    up: string;
    down: string;
}

export interface MigrationCLIOptions {
    directory?: string;
}

export class MigrationCLI {
    private readonly directory: string;

    constructor(private readonly adapter: MigrationAdapter, options: MigrationCLIOptions = {}) {
        this.directory = options.directory ?? path.join(process.cwd(), 'migrations');
        mkdirSync(this.directory, { recursive: true });
    }

    async create(name: string) {
        const timestamp = this.formatTimestamp(new Date());
        const filename = `${timestamp}_${name}.sql`;
        const template = [
            '-- +up',
            '-- Write SQL for migrating up here',
            '',
            '-- +down',
            '-- Write SQL for migrating down here'
        ].join('\n');

        writeFileSync(path.join(this.directory, filename), template, 'utf-8');
        return filename;
    }

    list(): string[] {
        return readdirSync(this.directory)
            .filter((file) => file.endsWith('.sql'))
            .sort();
    }

    private parse(file: string): MigrationFile {
        const content = readFileSync(path.join(this.directory, file), 'utf-8');
        const [upSection, downSection] = content.split('-- +down');
        const up = upSection.replace('-- +up', '').trim();
        const down = (downSection ?? '').trim();
        const [id, name] = file.replace('.sql', '').split('_');

        return { id, name, up, down };
    }

    async up() {
        await this.adapter.ensureMigrationsTable();
        for (const file of this.list()) {
            const migration = this.parse(file);
            await this.adapter.runMigration(migration.up);
        }
    }

    async down(step = 1) {
        await this.adapter.ensureMigrationsTable();
        const files = this.list().slice(-step).reverse();
        for (const file of files) {
            const migration = this.parse(file);
            if (!migration.down) {
                throw new Error(`Migration "${file}" does not define a down section`);
            }
            await this.adapter.runMigration(migration.down);
        }
    }

    private formatTimestamp(date: Date) {
        const pad = (value: number) => value.toString().padStart(2, '0');
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());
        return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }
}


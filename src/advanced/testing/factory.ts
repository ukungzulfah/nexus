/**
 * Factory pattern for generating test data
 */

import { randomUUID } from 'crypto';

export type FactoryAttribute<T> = T | (() => T);

export type FactoryDefinition<T> = {
    [K in keyof T]: FactoryAttribute<T[K]>;
};

export interface FactoryState<T> {
    sequence: number;
    traits: Map<string, Partial<FactoryDefinition<T>>>;
    afterCreate: Array<(record: T) => void | Promise<void>>;
}

export interface FactoryBuildOptions<T> {
    traits?: string[];
    overrides?: Partial<T>;
    transient?: Record<string, any>;
}

/**
 * Factory class for generating test data
 */
export class Factory<T extends Record<string, any>> {
    private definition: FactoryDefinition<T>;
    private state: FactoryState<T>;
    private persistFn?: (record: T) => Promise<T>;

    constructor(definition: FactoryDefinition<T>) {
        this.definition = definition;
        this.state = {
            sequence: 1,
            traits: new Map(),
            afterCreate: []
        };
    }

    /**
     * Define a trait (variation of the base factory)
     */
    trait(name: string, overrides: Partial<FactoryDefinition<T>>): this {
        this.state.traits.set(name, overrides);
        return this;
    }

    /**
     * Add afterCreate hook
     */
    afterCreate(callback: (record: T) => void | Promise<void>): this {
        this.state.afterCreate.push(callback);
        return this;
    }

    /**
     * Set persist function for creating records in database
     */
    setPersist(fn: (record: T) => Promise<T>): this {
        this.persistFn = fn;
        return this;
    }

    /**
     * Build a record without persisting
     */
    build(options: FactoryBuildOptions<T> = {}): T {
        const context = {
            sequence: this.state.sequence++,
            transient: options.transient ?? {}
        };

        // Start with base definition
        let merged = { ...this.definition };

        // Apply traits
        for (const traitName of options.traits ?? []) {
            const trait = this.state.traits.get(traitName);
            if (!trait) {
                throw new Error(`Unknown trait: ${traitName}`);
            }
            merged = { ...merged, ...trait };
        }

        // Apply overrides
        if (options.overrides) {
            for (const [key, value] of Object.entries(options.overrides)) {
                (merged as any)[key] = value;
            }
        }

        // Resolve all values
        const result: Partial<T> = {};
        for (const [key, value] of Object.entries(merged)) {
            if (typeof value === 'function') {
                (result as any)[key] = (value as Function)(context);
            } else {
                (result as any)[key] = value;
            }
        }

        return result as T;
    }

    /**
     * Build multiple records
     */
    buildMany(count: number, options: FactoryBuildOptions<T> = {}): T[] {
        return Array.from({ length: count }, () => this.build(options));
    }

    /**
     * Create and persist a record
     */
    async create(options: FactoryBuildOptions<T> = {}): Promise<T> {
        const record = this.build(options);

        let persisted = record;
        if (this.persistFn) {
            persisted = await this.persistFn(record);
        }

        // Run afterCreate hooks
        for (const hook of this.state.afterCreate) {
            await hook(persisted);
        }

        return persisted;
    }

    /**
     * Create multiple records
     */
    async createMany(count: number, options: FactoryBuildOptions<T> = {}): Promise<T[]> {
        return Promise.all(Array.from({ length: count }, () => this.create(options)));
    }

    /**
     * Reset sequence counter
     */
    resetSequence(): this {
        this.state.sequence = 1;
        return this;
    }
}

/**
 * Define a new factory
 */
export function defineFactory<T extends Record<string, any>>(
    definition: FactoryDefinition<T>
): Factory<T> {
    return new Factory(definition);
}

// ============================================================================
// Built-in Generators
// ============================================================================

export const generators = {
    /**
     * Generate unique ID
     */
    uuid: () => randomUUID(),

    /**
     * Generate auto-incrementing ID
     */
    sequence: (prefix: string = '') => {
        let counter = 0;
        return () => `${prefix}${++counter}`;
    },

    /**
     * Generate random integer
     */
    integer: (min: number = 0, max: number = 100) => {
        return () => Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /**
     * Generate random float
     */
    float: (min: number = 0, max: number = 100, decimals: number = 2) => {
        return () => {
            const value = Math.random() * (max - min) + min;
            return Number(value.toFixed(decimals));
        };
    },

    /**
     * Generate random boolean
     */
    boolean: (trueChance: number = 0.5) => {
        return () => Math.random() < trueChance;
    },

    /**
     * Pick random element from array
     */
    oneOf: <T>(options: T[]) => {
        return () => options[Math.floor(Math.random() * options.length)];
    },

    /**
     * Pick multiple random elements
     */
    someOf: <T>(options: T[], min: number = 1, max: number = options.length) => {
        return () => {
            const count = Math.floor(Math.random() * (max - min + 1)) + min;
            const shuffled = [...options].sort(() => Math.random() - 0.5);
            return shuffled.slice(0, count);
        };
    },

    /**
     * Generate random date
     */
    date: (start: Date = new Date(2020, 0, 1), end: Date = new Date()) => {
        return () => {
            const time = start.getTime() + Math.random() * (end.getTime() - start.getTime());
            return new Date(time);
        };
    },

    /**
     * Generate date relative to now
     */
    pastDate: (maxDaysAgo: number = 365) => {
        return () => {
            const now = Date.now();
            const daysAgo = Math.floor(Math.random() * maxDaysAgo);
            return new Date(now - daysAgo * 24 * 60 * 60 * 1000);
        };
    },

    /**
     * Generate future date
     */
    futureDate: (maxDaysAhead: number = 365) => {
        return () => {
            const now = Date.now();
            const daysAhead = Math.floor(Math.random() * maxDaysAhead);
            return new Date(now + daysAhead * 24 * 60 * 60 * 1000);
        };
    },

    /**
     * Generate random string
     */
    string: (length: number = 10) => {
        return () => {
            const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
                result += chars[Math.floor(Math.random() * chars.length)];
            }
            return result;
        };
    },

    /**
     * Generate Lorem ipsum text
     */
    lorem: (wordCount: number = 10) => {
        const words = [
            'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
            'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
            'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud'
        ];
        return () => {
            const result: string[] = [];
            for (let i = 0; i < wordCount; i++) {
                result.push(words[Math.floor(Math.random() * words.length)]);
            }
            return result.join(' ');
        };
    },

    /**
     * Generate paragraph
     */
    paragraph: (sentenceCount: number = 3) => {
        return () => {
            const sentences: string[] = [];
            for (let i = 0; i < sentenceCount; i++) {
                const words = generators.lorem(Math.floor(Math.random() * 10) + 5)();
                sentences.push(words.charAt(0).toUpperCase() + words.slice(1) + '.');
            }
            return sentences.join(' ');
        };
    },

    // ========================================================================
    // Common data generators (like faker.js)
    // ========================================================================

    /**
     * Generate email
     */
    email: () => {
        const domains = ['example.com', 'test.com', 'mail.test', 'demo.org'];
        return (ctx: { sequence: number }) => {
            const domain = domains[Math.floor(Math.random() * domains.length)];
            return `user${ctx.sequence}@${domain}`;
        };
    },

    /**
     * Generate name
     */
    firstName: () => {
        const names = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Eve', 'Frank'];
        return () => names[Math.floor(Math.random() * names.length)];
    },

    lastName: () => {
        const names = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller'];
        return () => names[Math.floor(Math.random() * names.length)];
    },

    fullName: () => {
        return () => `${generators.firstName()()} ${generators.lastName()()}`;
    },

    /**
     * Generate username
     */
    username: () => {
        return (ctx: { sequence: number }) => `user_${ctx.sequence}_${generators.string(4)()}`;
    },

    /**
     * Generate password (for testing)
     */
    password: (length: number = 12) => {
        return () => {
            const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
            let result = '';
            for (let i = 0; i < length; i++) {
                result += chars[Math.floor(Math.random() * chars.length)];
            }
            return result;
        };
    },

    /**
     * Generate phone number
     */
    phone: () => {
        return () => {
            const area = Math.floor(Math.random() * 900) + 100;
            const first = Math.floor(Math.random() * 900) + 100;
            const second = Math.floor(Math.random() * 9000) + 1000;
            return `${area}-${first}-${second}`;
        };
    },

    /**
     * Generate URL
     */
    url: () => {
        const protocols = ['http', 'https'];
        const domains = ['example.com', 'test.org', 'demo.net'];
        return () => {
            const protocol = protocols[Math.floor(Math.random() * protocols.length)];
            const domain = domains[Math.floor(Math.random() * domains.length)];
            return `${protocol}://${domain}/${generators.string(8)()}`;
        };
    },

    /**
     * Generate IPv4 address
     */
    ipv4: () => {
        return () => {
            const octets = Array.from({ length: 4 }, () => Math.floor(Math.random() * 256));
            return octets.join('.');
        };
    },

    /**
     * Generate slug
     */
    slug: () => {
        return (ctx: { sequence: number }) => `slug-${ctx.sequence}-${generators.string(6)().toLowerCase()}`;
    },

    /**
     * Generate company name
     */
    company: () => {
        const prefixes = ['Tech', 'Global', 'Smart', 'Digital', 'Cloud', 'Data', 'Cyber'];
        const suffixes = ['Corp', 'Inc', 'Ltd', 'Solutions', 'Systems', 'Labs', 'Works'];
        return () => {
            const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
            return `${prefix}${generators.string(4)()} ${suffix}`;
        };
    },

    /**
     * Generate job title
     */
    jobTitle: () => {
        const levels = ['Junior', 'Senior', 'Lead', 'Principal', 'Staff'];
        const roles = ['Developer', 'Engineer', 'Designer', 'Manager', 'Analyst', 'Architect'];
        return () => {
            const level = levels[Math.floor(Math.random() * levels.length)];
            const role = roles[Math.floor(Math.random() * roles.length)];
            return `${level} ${role}`;
        };
    },

    /**
     * Generate address
     */
    address: () => {
        const streets = ['Main St', 'Oak Ave', 'Park Rd', 'Lake Dr', 'Hill Blvd'];
        const cities = ['Springfield', 'Riverside', 'Georgetown', 'Franklin', 'Clinton'];
        const states = ['CA', 'NY', 'TX', 'FL', 'WA', 'OR', 'CO'];
        return () => ({
            street: `${Math.floor(Math.random() * 9999) + 1} ${streets[Math.floor(Math.random() * streets.length)]}`,
            city: cities[Math.floor(Math.random() * cities.length)],
            state: states[Math.floor(Math.random() * states.length)],
            zip: String(Math.floor(Math.random() * 90000) + 10000)
        });
    },

    /**
     * Generate country code
     */
    countryCode: () => {
        const codes = ['US', 'GB', 'DE', 'FR', 'JP', 'AU', 'CA', 'BR', 'IN', 'CN'];
        return () => codes[Math.floor(Math.random() * codes.length)];
    },

    /**
     * Generate currency code
     */
    currency: () => {
        const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF'];
        return () => currencies[Math.floor(Math.random() * currencies.length)];
    },

    /**
     * Generate price/amount
     */
    price: (min: number = 1, max: number = 1000) => {
        return () => Number((Math.random() * (max - min) + min).toFixed(2));
    },

    /**
     * Generate credit card number (fake, for testing)
     */
    creditCard: () => {
        return () => {
            const groups = Array.from({ length: 4 }, () =>
                String(Math.floor(Math.random() * 10000)).padStart(4, '0')
            );
            return groups.join('-');
        };
    },

    /**
     * Generate hex color
     */
    hexColor: () => {
        return () => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    },

    /**
     * Generate file path
     */
    filePath: () => {
        const dirs = ['documents', 'images', 'downloads', 'data', 'temp'];
        const extensions = ['txt', 'pdf', 'jpg', 'png', 'doc', 'json'];
        return () => {
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            const ext = extensions[Math.floor(Math.random() * extensions.length)];
            return `/${dir}/${generators.string(8)()}.${ext}`;
        };
    },

    /**
     * Generate MIME type
     */
    mimeType: () => {
        const types = [
            'application/json',
            'application/pdf',
            'text/plain',
            'text/html',
            'image/jpeg',
            'image/png',
            'audio/mpeg',
            'video/mp4'
        ];
        return () => types[Math.floor(Math.random() * types.length)];
    }
};

// Export type for context
export interface FactoryContext {
    sequence: number;
    transient: Record<string, any>;
}

/**
 * Docker Support
 * Generates optimized Dockerfile and docker-compose configurations
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';

export interface DockerOptions {
    /**
     * Base Node.js image
     * @default 'node:20-alpine'
     */
    baseImage?: string;

    /**
     * Application port
     * @default 3000
     */
    port?: number;

    /**
     * Working directory in container
     * @default '/app'
     */
    workdir?: string;

    /**
     * Entry point file
     * @default 'dist/index.js'
     */
    entrypoint?: string;

    /**
     * Use multi-stage build
     * @default true
     */
    multiStage?: boolean;

    /**
     * Include health check
     * @default true
     */
    healthCheck?: boolean;

    /**
     * Health check endpoint
     * @default '/health'
     */
    healthEndpoint?: string;

    /**
     * Add security user
     * @default true
     */
    nonRootUser?: boolean;

    /**
     * Additional environment variables
     */
    env?: Record<string, string>;

    /**
     * Additional labels
     */
    labels?: Record<string, string>;

    /**
     * Files to copy before npm install (for better caching)
     */
    copyBeforeInstall?: string[];

    /**
     * Files/directories to ignore
     */
    ignore?: string[];

    /**
     * Use npm ci instead of npm install
     * @default true
     */
    useNpmCi?: boolean;

    /**
     * Prune dev dependencies in production
     * @default true
     */
    pruneDevDeps?: boolean;
}

export interface ComposeService {
    build?: {
        context?: string;
        dockerfile?: string;
    };
    image?: string;
    ports?: string[];
    environment?: Record<string, string>;
    env_file?: string[];
    depends_on?: string[];
    volumes?: string[];
    networks?: string[];
    healthcheck?: {
        test: string[];
        interval?: string;
        timeout?: string;
        retries?: number;
        start_period?: string;
    };
    restart?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
    deploy?: {
        replicas?: number;
        resources?: {
            limits?: { cpus?: string; memory?: string };
            reservations?: { cpus?: string; memory?: string };
        };
    };
}

export interface ComposeConfig {
    version?: string;
    services?: Record<string, ComposeService>;
    networks?: Record<string, any>;
    volumes?: Record<string, any>;
}

/**
 * Docker Generator
 */
export class DockerGenerator {
    private options: Required<DockerOptions>;

    constructor(options: DockerOptions = {}) {
        this.options = {
            baseImage: options.baseImage ?? 'node:20-alpine',
            port: options.port ?? 3000,
            workdir: options.workdir ?? '/app',
            entrypoint: options.entrypoint ?? 'dist/index.js',
            multiStage: options.multiStage ?? true,
            healthCheck: options.healthCheck ?? true,
            healthEndpoint: options.healthEndpoint ?? '/health',
            nonRootUser: options.nonRootUser ?? true,
            env: options.env ?? {},
            labels: options.labels ?? {},
            copyBeforeInstall: options.copyBeforeInstall ?? ['package*.json'],
            ignore: options.ignore ?? [
                'node_modules',
                '.git',
                '.env*',
                '*.log',
                '.DS_Store',
                'coverage',
                '.nyc_output',
                'test',
                'tests',
                '__tests__',
                '*.test.ts',
                '*.spec.ts'
            ],
            useNpmCi: options.useNpmCi ?? true,
            pruneDevDeps: options.pruneDevDeps ?? true
        };
    }

    /**
     * Generate Dockerfile content
     */
    generateDockerfile(): string {
        if (this.options.multiStage) {
            return this.generateMultiStageDockerfile();
        }
        return this.generateSimpleDockerfile();
    }

    /**
     * Generate multi-stage Dockerfile for optimized builds
     */
    private generateMultiStageDockerfile(): string {
        const lines: string[] = [];
        const { baseImage, workdir, port, entrypoint } = this.options;

        // Base stage
        lines.push(`# ============================================`);
        lines.push(`# Base Stage`);
        lines.push(`# ============================================`);
        lines.push(`FROM ${baseImage} AS base`);
        lines.push(`WORKDIR ${workdir}`);
        lines.push('');

        // Dependencies stage
        lines.push(`# ============================================`);
        lines.push(`# Dependencies Stage`);
        lines.push(`# ============================================`);
        lines.push(`FROM base AS deps`);
        lines.push('');

        // Copy package files
        for (const file of this.options.copyBeforeInstall) {
            lines.push(`COPY ${file} ./`);
        }
        lines.push('');

        // Install production dependencies only
        const installCmd = this.options.useNpmCi ? 'npm ci --only=production' : 'npm install --only=production';
        lines.push(`# Install production dependencies only`);
        lines.push(`RUN ${installCmd}`);
        lines.push('');

        // Build stage
        lines.push(`# ============================================`);
        lines.push(`# Build Stage`);
        lines.push(`# ============================================`);
        lines.push(`FROM base AS build`);
        lines.push('');

        // Copy package files
        for (const file of this.options.copyBeforeInstall) {
            lines.push(`COPY ${file} ./`);
        }
        lines.push('');

        // Install all dependencies
        const devInstallCmd = this.options.useNpmCi ? 'npm ci' : 'npm install';
        lines.push(`# Install all dependencies (including dev)`);
        lines.push(`RUN ${devInstallCmd}`);
        lines.push('');

        // Copy source code
        lines.push(`# Copy source code`);
        lines.push(`COPY . .`);
        lines.push('');

        // Build
        lines.push(`# Build application`);
        lines.push(`RUN npm run build`);
        lines.push('');

        // Production stage
        lines.push(`# ============================================`);
        lines.push(`# Production Stage`);
        lines.push(`# ============================================`);
        lines.push(`FROM base AS production`);
        lines.push('');

        // Security: non-root user
        if (this.options.nonRootUser) {
            lines.push(`# Create non-root user for security`);
            lines.push(`RUN addgroup --system --gid 1001 nodejs`);
            lines.push(`RUN adduser --system --uid 1001 nexus`);
            lines.push('');
        }

        // Set NODE_ENV
        lines.push(`# Set environment`);
        lines.push(`ENV NODE_ENV=production`);

        // Additional environment variables
        for (const [key, value] of Object.entries(this.options.env)) {
            lines.push(`ENV ${key}=${value}`);
        }
        lines.push('');

        // Labels
        if (Object.keys(this.options.labels).length > 0) {
            lines.push(`# Labels`);
            for (const [key, value] of Object.entries(this.options.labels)) {
                lines.push(`LABEL ${key}="${value}"`);
            }
            lines.push('');
        }

        // Copy dependencies and build output
        if (this.options.nonRootUser) {
            lines.push(`# Copy dependencies from deps stage`);
            lines.push(`COPY --from=deps --chown=nexus:nodejs ${workdir}/node_modules ./node_modules`);
            lines.push('');
            lines.push(`# Copy built application from build stage`);
            lines.push(`COPY --from=build --chown=nexus:nodejs ${workdir}/dist ./dist`);
            lines.push(`COPY --from=build --chown=nexus:nodejs ${workdir}/package.json ./`);
            lines.push('');
            lines.push(`# Switch to non-root user`);
            lines.push(`USER nexus`);
        } else {
            lines.push(`# Copy dependencies from deps stage`);
            lines.push(`COPY --from=deps ${workdir}/node_modules ./node_modules`);
            lines.push('');
            lines.push(`# Copy built application from build stage`);
            lines.push(`COPY --from=build ${workdir}/dist ./dist`);
            lines.push(`COPY --from=build ${workdir}/package.json ./`);
        }
        lines.push('');

        // Expose port
        lines.push(`# Expose port`);
        lines.push(`EXPOSE ${port}`);
        lines.push('');

        // Health check
        if (this.options.healthCheck) {
            lines.push(`# Health check`);
            lines.push(`HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\`);
            lines.push(`  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}${this.options.healthEndpoint} || exit 1`);
            lines.push('');
        }

        // Start command
        lines.push(`# Start the application`);
        lines.push(`CMD ["node", "${entrypoint}"]`);

        return lines.join('\n');
    }

    /**
     * Generate simple single-stage Dockerfile
     */
    private generateSimpleDockerfile(): string {
        const lines: string[] = [];
        const { baseImage, workdir, port, entrypoint } = this.options;

        lines.push(`FROM ${baseImage}`);
        lines.push(`WORKDIR ${workdir}`);
        lines.push('');

        // Copy package files
        for (const file of this.options.copyBeforeInstall) {
            lines.push(`COPY ${file} ./`);
        }
        lines.push('');

        const installCmd = this.options.useNpmCi ? 'npm ci' : 'npm install';
        lines.push(`RUN ${installCmd}`);
        lines.push('');

        lines.push(`COPY . .`);
        lines.push(`RUN npm run build`);
        lines.push('');

        if (this.options.pruneDevDeps) {
            lines.push(`RUN npm prune --production`);
            lines.push('');
        }

        lines.push(`ENV NODE_ENV=production`);
        for (const [key, value] of Object.entries(this.options.env)) {
            lines.push(`ENV ${key}=${value}`);
        }
        lines.push('');

        lines.push(`EXPOSE ${port}`);
        lines.push(`CMD ["node", "${entrypoint}"]`);

        return lines.join('\n');
    }

    /**
     * Generate .dockerignore content
     */
    generateDockerignore(): string {
        const lines = [
            '# Dependencies',
            'node_modules',
            '',
            '# Build output',
            'dist',
            '',
            '# Git',
            '.git',
            '.gitignore',
            '',
            '# Environment files',
            '.env',
            '.env.*',
            '!.env.example',
            '',
            '# Logs',
            '*.log',
            'logs',
            '',
            '# Test files',
            'test',
            'tests',
            '__tests__',
            'coverage',
            '.nyc_output',
            '*.test.ts',
            '*.test.js',
            '*.spec.ts',
            '*.spec.js',
            '',
            '# IDE',
            '.vscode',
            '.idea',
            '*.swp',
            '*.swo',
            '',
            '# OS',
            '.DS_Store',
            'Thumbs.db',
            '',
            '# Docker',
            'Dockerfile*',
            'docker-compose*',
            '.docker',
            '',
            '# Documentation',
            'docs',
            '*.md',
            '!README.md',
            '',
            '# Misc',
            '.editorconfig',
            '.eslintrc*',
            '.prettierrc*',
            'tsconfig*.json',
            'jest.config.*'
        ];

        // Add custom ignore patterns
        for (const pattern of this.options.ignore) {
            if (!lines.includes(pattern)) {
                lines.push(pattern);
            }
        }

        return lines.join('\n');
    }

    /**
     * Generate docker-compose.yml for development
     */
    generateComposeFile(config: ComposeConfig = {}): string {
        const defaultConfig: ComposeConfig = {
            version: '3.8',
            services: {
                app: {
                    build: {
                        context: '.',
                        dockerfile: 'Dockerfile'
                    },
                    ports: [`${this.options.port}:${this.options.port}`],
                    environment: {
                        NODE_ENV: 'production',
                        ...this.options.env
                    },
                    restart: 'unless-stopped',
                    healthcheck: this.options.healthCheck
                        ? {
                              test: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', `http://localhost:${this.options.port}${this.options.healthEndpoint}`],
                              interval: '30s',
                              timeout: '10s',
                              retries: 3,
                              start_period: '10s'
                          }
                        : undefined
                }
            }
        };

        // Merge with provided config
        const finalConfig = this.mergeComposeConfig(defaultConfig, config);

        return this.serializeYaml(finalConfig);
    }

    /**
     * Generate docker-compose.dev.yml for development
     */
    generateDevComposeFile(): string {
        const config: ComposeConfig = {
            version: '3.8',
            services: {
                app: {
                    build: {
                        context: '.',
                        dockerfile: 'Dockerfile'
                    },
                    ports: [`${this.options.port}:${this.options.port}`],
                    environment: {
                        NODE_ENV: 'development'
                    },
                    volumes: [
                        '.:/app',
                        '/app/node_modules'
                    ],
                    restart: 'unless-stopped'
                }
            }
        };

        return this.serializeYaml(config);
    }

    /**
     * Write all Docker files to disk
     */
    writeFiles(outputDir: string = '.'): { files: string[] } {
        const files: string[] = [];
        const basePath = resolve(process.cwd(), outputDir);

        // Dockerfile
        const dockerfilePath = resolve(basePath, 'Dockerfile');
        writeFileSync(dockerfilePath, this.generateDockerfile());
        files.push(dockerfilePath);

        // .dockerignore
        const dockerignorePath = resolve(basePath, '.dockerignore');
        writeFileSync(dockerignorePath, this.generateDockerignore());
        files.push(dockerignorePath);

        // docker-compose.yml
        const composePath = resolve(basePath, 'docker-compose.yml');
        writeFileSync(composePath, this.generateComposeFile());
        files.push(composePath);

        // docker-compose.dev.yml
        const devComposePath = resolve(basePath, 'docker-compose.dev.yml');
        writeFileSync(devComposePath, this.generateDevComposeFile());
        files.push(devComposePath);

        return { files };
    }

    /**
     * Merge compose configs
     */
    private mergeComposeConfig(base: ComposeConfig, override: ComposeConfig): ComposeConfig {
        return {
            version: override.version ?? base.version,
            services: {
                ...base.services,
                ...override.services
            },
            networks: {
                ...base.networks,
                ...override.networks
            },
            volumes: {
                ...base.volumes,
                ...override.volumes
            }
        };
    }

    /**
     * Simple YAML serializer
     */
    private serializeYaml(obj: any, indent: number = 0): string {
        const lines: string[] = [];
        const prefix = '  '.repeat(indent);

        for (const [key, value] of Object.entries(obj)) {
            if (value === undefined || value === null) continue;

            if (Array.isArray(value)) {
                lines.push(`${prefix}${key}:`);
                for (const item of value) {
                    if (typeof item === 'object') {
                        const itemLines = this.serializeYaml(item, indent + 2).split('\n');
                        lines.push(`${prefix}  - ${itemLines[0].trim()}`);
                        for (let i = 1; i < itemLines.length; i++) {
                            if (itemLines[i].trim()) {
                                lines.push(`${prefix}    ${itemLines[i].trim()}`);
                            }
                        }
                    } else {
                        lines.push(`${prefix}  - ${item}`);
                    }
                }
            } else if (typeof value === 'object') {
                lines.push(`${prefix}${key}:`);
                lines.push(this.serializeYaml(value, indent + 1));
            } else if (typeof value === 'string' && value.includes(':')) {
                lines.push(`${prefix}${key}: "${value}"`);
            } else {
                lines.push(`${prefix}${key}: ${value}`);
            }
        }

        return lines.join('\n');
    }
}

/**
 * Create Docker generator
 */
export function createDocker(options?: DockerOptions): DockerGenerator {
    return new DockerGenerator(options);
}

/**
 * Generate Docker files with default options
 */
export function generateDockerFiles(
    outputDir: string = '.',
    options?: DockerOptions
): { files: string[] } {
    const generator = createDocker(options);
    return generator.writeFiles(outputDir);
}

import {
    DocumentNode,
    ExecutionResult,
    GraphQLSchema,
    Kind,
    OperationDefinitionNode,
    execute,
    getOperationAST,
    parse,
    validate
} from 'graphql';
import { Context, Handler, Response } from '../../core/types';
import { GraphQLComplexityOptions, GraphQLRequestPayload, GraphQLServerOptions } from './types';

export class GraphQLServer {
    private schema: GraphQLSchema;
    private options: GraphQLServerOptions;

    constructor(options: GraphQLServerOptions) {
        this.schema = options.schema;
        this.options = {
            playground: options.playground ?? false,
            introspection: options.introspection ?? process.env.NODE_ENV !== 'production',
            dataloaders: options.dataloaders ?? true,
            ...options
        };
    }

    /**
     * Returns a framework route handler
     */
    handler(): Handler {
        return async (ctx: Context): Promise<Response> => {
            if (ctx.method === 'GET' && this.shouldRenderPlayground(ctx)) {
                return ctx.html(this.renderPlayground());
            }

            const payload = await this.parseRequest(ctx);
            const document = this.parseDocument(payload.query);
            this.enforceRules(document, payload);

            const cacheKey = await this.computeCacheKey(payload);
            if (cacheKey) {
                const cached = await this.options.cache!.instance.get(cacheKey);
                if (cached) {
                    return this.buildResponse(cached as ExecutionResult);
                }
            }

            const contextValue = await this.buildContext(ctx);
            const result = await execute({
                schema: this.schema,
                document,
                variableValues: payload.variables,
                operationName: payload.operationName,
                contextValue
            });

            if (cacheKey && !result.errors) {
                await this.options.cache!.instance.set(cacheKey, result, { ttl: this.options.cache?.ttl });
            }

            return this.buildResponse(result);
        };
    }

    private shouldRenderPlayground(ctx: Context): boolean {
        if (!this.options.playground) {
            return false;
        }
        const accept = ctx.headers['accept'];
        if (!accept) return false;
        const acceptHeader = Array.isArray(accept) ? accept.join(',') : accept;
        return acceptHeader.includes('text/html');
    }

    private async parseRequest(ctx: Context): Promise<GraphQLRequestPayload> {
        if (ctx.method === 'GET') {
            return {
                query: ctx.query.query,
                variables: this.safeParseJSON(ctx.query.variables),
                operationName: ctx.query.operationName as string | undefined
            };
        }

        if (typeof ctx.body === 'string') {
            return JSON.parse(ctx.body);
        }

        return ctx.body ?? {};
    }

    private parseDocument(query?: string): DocumentNode {
        if (!query) {
            throw new Error('GraphQL query is required');
        }
        return parse(query);
    }

    private enforceRules(document: DocumentNode, payload: GraphQLRequestPayload) {
        if (!this.options.introspection) {
            const operation = getOperationAST(document, payload.operationName || undefined);
            if (operation?.operation === 'query' && operation.name?.value === '__schema') {
                throw new Error('Introspection is disabled');
            }
        }

        const validationErrors = validate(this.schema, document);
        if (validationErrors.length > 0) {
            throw validationErrors[0];
        }

        if (this.options.depthLimit !== undefined) {
            const depth = this.calculateDepth(document);
            if (depth > this.options.depthLimit) {
                throw new Error(`Query depth ${depth} exceeds limit of ${this.options.depthLimit}`);
            }
        }

        if (this.options.complexity) {
            const complexity = this.calculateComplexity(document, this.options.complexity);
            if (complexity > this.options.complexity.limit) {
                throw new Error(`Query complexity ${complexity} exceeds limit of ${this.options.complexity.limit}`);
            }
        }
    }

    private async buildContext(ctx: Context) {
        const base = typeof this.options.context === 'function'
            ? await this.options.context({ ctx })
            : this.options.context ?? {};

        if (this.options.dataloaders) {
            Object.assign(base, { loaders: {} });
        }

        return { ...base, request: ctx };
    }

    private calculateDepth(document: DocumentNode): number {
        let maxDepth = 0;

        const traverse = (node: any, depth: number) => {
            if (!node.selectionSet) {
                return;
            }
            depth += 1;
            maxDepth = Math.max(maxDepth, depth);
            for (const selection of node.selectionSet.selections) {
                traverse(selection, depth);
            }
        };

        for (const definition of document.definitions) {
            if (definition.kind === Kind.OPERATION_DEFINITION) {
                traverse(definition, 0);
            }
        }

        return maxDepth;
    }

    private calculateComplexity(
        document: DocumentNode,
        options: GraphQLComplexityOptions
    ): number {
        const costs = options.cost || {};
        const defaultCost = options.defaultCost ?? 1;
        let complexity = 0;

        const visitNode = (node: OperationDefinitionNode | any) => {
            if (!node.selectionSet) {
                return;
            }

            for (const selection of node.selectionSet.selections) {
                if (selection.kind === Kind.FIELD) {
                    const fieldName = selection.name.value;
                    complexity += costs[fieldName] ?? defaultCost;
                }
                visitNode(selection);
            }
        };

        for (const definition of document.definitions) {
            if (definition.kind === Kind.OPERATION_DEFINITION) {
                visitNode(definition);
            }
        }

        return complexity;
    }

    private async computeCacheKey(payload: GraphQLRequestPayload): Promise<string | null> {
        if (!this.options.cache) {
            return null;
        }

        const generator = this.options.cache.keyGenerator ??
            ((data: GraphQLRequestPayload) => JSON.stringify(data));

        return generator(payload);
    }

    private buildResponse(result: ExecutionResult): Response {
        if (result.errors && this.options.formatError) {
            result = {
                ...result,
                errors: result.errors.map(err => this.options.formatError!(err))
            };
        }

        return {
            statusCode: result.errors ? 400 : 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
        };
    }

    private safeParseJSON(value: any) {
        if (!value) return undefined;
        try {
            if (typeof value === 'string') {
                return JSON.parse(value);
            }
            return value;
        } catch {
            return undefined;
        }
    }

    private renderPlayground() {
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset=utf-8/>
    <title>GraphQL Playground</title>
    <link rel="stylesheet" href="https://unpkg.com/graphql-playground-react/build/static/css/index.css" />
    <link rel="shortcut icon" href="https://raw.githubusercontent.com/graphql/graphql-playground/main/packages/graphql-playground-react/public/favicon.png" />
    <script src="https://unpkg.com/graphql-playground-react/build/static/js/middleware.js"></script>
  </head>
  <body>
    <div id="root" />
    <script>window.addEventListener('load', function () {
      GraphQLPlayground.init(document.getElementById('root'), { endpoint: '/graphql' })
    })</script>
  </body>
</html>`;
    }
}


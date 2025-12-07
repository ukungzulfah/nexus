type GeneratorType = 'route' | 'route-class' | 'middleware' | 'controller' | 'service' | 'model' | 'validator';

interface GeneratorResult {
  filePath: string;
  content: string;
}

interface GeneratorOptions {
  customPath?: string;
  methods: string[];
}

export class GeneratorTemplates {
  generate(type: GeneratorType, name: string, options: GeneratorOptions): GeneratorResult {
    switch (type) {
      case 'route':
        return this.generateRoute(name, options.methods);
      case 'route-class':
        return this.generateRouteClass(name, options.methods);
      case 'middleware':
        return this.generateMiddleware(name);
      case 'controller':
        return this.generateController(name);
      case 'service':
        return this.generateService(name);
      case 'model':
        return this.generateModel(name);
      case 'validator':
        return this.generateValidator(name);
      default:
        throw new Error(`Unknown generator type: ${type}`);
    }
  }

  private toPascalCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (_, c) => c.toUpperCase());
  }

  private toCamelCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (_, c) => c.toLowerCase());
  }

  private generateRoute(name: string, methods: string[]): GeneratorResult {
    const routeName = this.toCamelCase(name);
    const routeHandlers = methods
      .map((method) => {
        return `
// ${method.toUpperCase()} /${name}
${routeName}Routes.${method}('/', async (ctx) => {
  return {
    message: '${method.toUpperCase()} /${name}',
  };
});`;
      })
      .join('\n');

    const content = `import { Router } from '@engjts/nexus';

export const ${routeName}Routes = new Router();
${routeHandlers}
`;

    return {
      filePath: `src/routes/${name}.ts`,
      content,
    };
  }

  private generateRouteClass(name: string, methods: string[]): GeneratorResult {
    const className = this.toPascalCase(name);
    const baseName = name.toLowerCase();
    const method = methods[0] || 'get';

    const content = `import { Route, Context, z } from '@engjts/nexus';

export class ${className}Route extends Route {
  pathName = '/${baseName}';

  meta() {
    return {
      summary: '${className} route',
      description: '${className} route description',
      tags: ['${className}'],
    };
  }

  schema() {
    return {
      // params: z.object({}),
      // query: z.object({}),
      // body: z.object({}),
    };
  }

  async onBefore(ctx: Context) {
    // Hook sebelum handler
    // Return value untuk skip handler dan langsung return response
  }

  async handler(ctx: Context) {
    return {
      message: '${method.toUpperCase()} /${baseName}',
    };
  }
}
`;

    return {
      filePath: `src/routes/${name}.ts`,
      content,
    };
  }

  private generateMiddleware(name: string): GeneratorResult {
    const middlewareName = this.toCamelCase(name);

    const content = `import { Middleware, Context } from '@engjts/nexus';

export const ${middlewareName}Middleware: Middleware = async (ctx: Context, next) => {
  // Before handler
  console.log(\`[${name}] Before: \${ctx.method} \${ctx.path}\`);
  
  // Call next middleware/handler
  const response = await next();
  
  // After handler
  console.log(\`[${name}] After: \${ctx.method} \${ctx.path}\`);
  
  return response;
};
`;

    return {
      filePath: `src/middleware/${name}.ts`,
      content,
    };
  }

  private generateController(name: string): GeneratorResult {
    const className = this.toPascalCase(name);
    const baseName = name.replace(/controller$/i, '').toLowerCase();

    const content = `import { Controller, Get, Post, Put, Delete, Context } from '@engjts/nexus';

@Controller('/${baseName}')
export class ${className} {
  @Get('/')
  async getAll(ctx: Context) {
    return ctx.json({
      message: 'Get all ${baseName}',
      data: [],
    });
  }

  @Get('/:id')
  async getById(ctx: Context) {
    const { id } = ctx.params;
    return ctx.json({
      message: \`Get ${baseName} by id: \${id}\`,
      data: null,
    });
  }

  @Post('/')
  async create(ctx: Context) {
    const body = await ctx.body();
    return ctx.json({
      message: 'Create ${baseName}',
      data: body,
    }, 201);
  }

  @Put('/:id')
  async update(ctx: Context) {
    const { id } = ctx.params;
    const body = await ctx.body();
    return ctx.json({
      message: \`Update ${baseName}: \${id}\`,
      data: body,
    });
  }

  @Delete('/:id')
  async delete(ctx: Context) {
    const { id } = ctx.params;
    return ctx.json({
      message: \`Delete ${baseName}: \${id}\`,
    });
  }
}
`;

    return {
      filePath: `src/controllers/${name}.ts`,
      content,
    };
  }

  private generateService(name: string): GeneratorResult {
    const className = this.toPascalCase(name);
    const baseName = name.replace(/service$/i, '').toLowerCase();

    const content = `export interface ${this.toPascalCase(baseName)} {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Create${this.toPascalCase(baseName)}Dto {
  // Add your create DTO properties here
}

export interface Update${this.toPascalCase(baseName)}Dto {
  // Add your update DTO properties here
}

export class ${className} {
  private items: Map<string, ${this.toPascalCase(baseName)}> = new Map();
  private idCounter = 1;

  async findAll(): Promise<${this.toPascalCase(baseName)}[]> {
    return Array.from(this.items.values());
  }

  async findById(id: string): Promise<${this.toPascalCase(baseName)} | null> {
    return this.items.get(id) || null;
  }

  async create(data: Create${this.toPascalCase(baseName)}Dto): Promise<${this.toPascalCase(baseName)}> {
    const id = String(this.idCounter++);
    const item: ${this.toPascalCase(baseName)} = {
      id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as ${this.toPascalCase(baseName)};
    
    this.items.set(id, item);
    return item;
  }

  async update(id: string, data: Update${this.toPascalCase(baseName)}Dto): Promise<${this.toPascalCase(baseName)} | null> {
    const item = this.items.get(id);
    
    if (!item) {
      return null;
    }
    
    const updated: ${this.toPascalCase(baseName)} = {
      ...item,
      ...data,
      updatedAt: new Date(),
    };
    
    this.items.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }
}
`;

    return {
      filePath: `src/services/${name}.ts`,
      content,
    };
  }

  private generateModel(name: string): GeneratorResult {
    const className = this.toPascalCase(name);

    const content = `export interface ${className} {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  // Add your model properties here
}

export interface Create${className}Input {
  // Add required fields for creation
}

export interface Update${className}Input {
  // Add optional fields for updates
}

// Database table name
export const ${className}Table = '${name.toLowerCase()}s';

// Field definitions (useful for query builders)
export const ${className}Fields = {
  id: 'id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
} as const;
`;

    return {
      filePath: `src/models/${name}.ts`,
      content,
    };
  }

  private generateValidator(name: string): GeneratorResult {
    const baseName = name.replace(/validator$/i, '');
    const pascalName = this.toPascalCase(baseName);

    const content = `import { z } from 'zod';

// Create schema
export const create${pascalName}Schema = z.object({
  // Add your validation rules here
  // Example:
  // name: z.string().min(2).max(100),
  // email: z.string().email(),
});

// Update schema
export const update${pascalName}Schema = z.object({
  // Add optional fields for updates
  // Example:
  // name: z.string().min(2).max(100).optional(),
});

// Query params schema
export const ${this.toCamelCase(baseName)}QuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// ID param schema
export const ${this.toCamelCase(baseName)}IdSchema = z.object({
  id: z.string().uuid(),
});

// Type exports
export type Create${pascalName}Input = z.infer<typeof create${pascalName}Schema>;
export type Update${pascalName}Input = z.infer<typeof update${pascalName}Schema>;
export type ${pascalName}Query = z.infer<typeof ${this.toCamelCase(baseName)}QuerySchema>;
`;

    return {
      filePath: `src/validators/${name}.ts`,
      content,
    };
  }
}

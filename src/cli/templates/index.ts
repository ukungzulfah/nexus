export class ProjectTemplates {
  constructor(private projectName: string) {}

  getTemplate(type: string): Record<string, string> {
    switch (type) {
      case 'api':
        return this.getApiTemplate();
      case 'fullstack':
        return this.getFullstackTemplate();
      case 'basic':
      default:
        return this.getBasicTemplate();
    }
  }

  private getBasicTemplate(): Record<string, string> {
    return {
      'package.json': this.getPackageJson('basic'),
      'tsconfig.json': this.getTsConfig(),
      '.gitignore': this.getGitIgnore(),
      '.env.example': this.getEnvExample(),
      'README.md': this.getReadme(),
      'src/index.ts': this.getBasicEntry(),
      'src/routes/index.ts': this.getBasicRoutes(),
    };
  }

  private getApiTemplate(): Record<string, string> {
    return {
      'package.json': this.getPackageJson('api'),
      'tsconfig.json': this.getTsConfig(),
      '.gitignore': this.getGitIgnore(),
      '.env.example': this.getEnvExample('api'),
      'README.md': this.getReadme(),
      'src/index.ts': this.getApiEntry(),
      'src/routes/index.ts': this.getApiRoutes(),
      'src/routes/users.ts': this.getUserRoutes(),
      'src/middleware/auth.ts': this.getAuthMiddleware(),
      'src/middleware/logger.ts': this.getLoggerMiddleware(),
      'src/services/user.service.ts': this.getUserService(),
      'src/validators/user.validator.ts': this.getUserValidator(),
      'src/types/index.ts': this.getTypes(),
    };
  }

  private getFullstackTemplate(): Record<string, string> {
    return {
      ...this.getApiTemplate(),
      'public/index.html': this.getPublicHtml(),
      'public/css/style.css': this.getPublicCss(),
      'public/js/app.js': this.getPublicJs(),
    };
  }

  private getPackageJson(type: string): string {
    const scripts: Record<string, string> = {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
      test: 'jest',
    };

    const dependencies: Record<string, string> = {
      '@engjts/nexus': '^0.1.3',
      zod: '^3.22.4',
      ws: '^8.16.0',
    };

    const devDependencies: Record<string, string> = {
      '@types/node': '^20.10.0',
      '@types/ws': '^8.18.1',
      typescript: '^5.3.3',
      tsx: '^4.7.0',
    };

    if (type === 'api' || type === 'fullstack') {
      devDependencies['@types/jest'] = '^29.5.11';
      devDependencies['jest'] = '^29.7.0';
      devDependencies['ts-jest'] = '^29.1.1';
    }

    return JSON.stringify(
      {
        name: this.projectName,
        version: '0.1.0',
        description: `${this.projectName} - Powered by Nexus`,
        main: 'dist/index.js',
        scripts,
        keywords: ['nexus', 'api', 'typescript'],
        author: '',
        license: 'MIT',
        dependencies,
        devDependencies,
      },
      null,
      2
    );
  }

  private getTsConfig(): string {
    return JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          lib: ['ES2022'],
          outDir: './dist',
          rootDir: './src',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
      },
      null,
      2
    );
  }

  private getGitIgnore(): string {
    return `# Dependencies
node_modules/

# Build output
dist/

# Environment files
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Test coverage
coverage/

# Misc
*.tsbuildinfo
`;
  }

  private getEnvExample(type = 'basic'): string {
    let env = `# Server
PORT=3000
HOST=localhost
NODE_ENV=development
`;

    if (type === 'api') {
      env += `
# Database
DATABASE_URL=mysql://user:password@localhost:3306/dbname

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
`;
    }

    return env;
  }

  private getReadme(): string {
    return `# ${this.projectName}

A web application built with [Nexus](https://github.com/engjts/nexus) - Async-First Web Framework.

## Getting Started

### Prerequisites

- Node.js 18+
- npm/yarn/pnpm

### Installation

\`\`\`bash
npm install
\`\`\`

### Development

\`\`\`bash
npm run dev
\`\`\`

### Build

\`\`\`bash
npm run build
\`\`\`

### Production

\`\`\`bash
npm start
\`\`\`

## Project Structure

\`\`\`
src/
├── index.ts          # Application entry point
├── routes/           # Route handlers
├── middleware/       # Custom middleware
├── services/         # Business logic
├── validators/       # Request validation
└── types/            # TypeScript types
\`\`\`

## Features

- ⚡ Async-first design
- 🔒 Built-in security
- 📝 Type-safe with TypeScript
- 🚀 High performance
- 🧩 Modular architecture

## License

MIT
`;
  }

  private getBasicEntry(): string {
    return `import { Nexus } from '@engjts/nexus';
import { routes } from './routes';

const app = new Nexus();

// Register routes
app.use(routes);

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`🚀 Server running at http://localhost:\${PORT}\`);
});
`;
  }

  private getBasicRoutes(): string {
    return `import { Router } from '@engjts/nexus';

export const routes = new Router();

routes.get('/', async (ctx) => {
  return ctx.json({
    message: 'Welcome to Nexus!',
    version: '1.0.0',
  });
});

routes.get('/health', async (ctx) => {
  return ctx.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});
`;
  }

  private getApiEntry(): string {
    return `import { Nexus, errorHandler } from '@engjts/nexus';
import { routes } from './routes';
import { loggerMiddleware } from './middleware/logger';

const app = new Nexus();

// Global middleware
app.use(loggerMiddleware);

// Register routes
app.use(routes);

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(\`🚀 API Server running at http://localhost:\${PORT}\`);
  console.log(\`📚 Environment: \${process.env.NODE_ENV || 'development'}\`);
});
`;
  }

  private getApiRoutes(): string {
    return `import { Router } from '@engjts/nexus';
import { userRoutes } from './users';

export const routes = new Router();

// Health check
routes.get('/health', async (ctx) => {
  return ctx.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API info
routes.get('/api', async (ctx) => {
  return ctx.json({
    name: 'API',
    version: '1.0.0',
    endpoints: ['/api/users', '/health'],
  });
});

// Mount user routes
routes.group('/api/users', userRoutes);
`;
  }

  private getUserRoutes(): string {
    return `import { Router } from '@engjts/nexus';
import { UserService } from '../services/user.service';
import { createUserSchema, updateUserSchema } from '../validators/user.validator';

export const userRoutes = new Router();
const userService = new UserService();

// GET /api/users
userRoutes.get('/', async (ctx) => {
  const users = await userService.findAll();
  return ctx.json({ users });
});

// GET /api/users/:id
userRoutes.get('/:id', async (ctx) => {
  const { id } = ctx.params;
  const user = await userService.findById(id);
  
  if (!user) {
    return ctx.json({ error: 'User not found' }, 404);
  }
  
  return ctx.json({ user });
});

// POST /api/users
userRoutes.post('/', async (ctx) => {
  const body = await ctx.body();
  const validated = createUserSchema.parse(body);
  
  const user = await userService.create(validated);
  return ctx.json({ user }, 201);
});

// PUT /api/users/:id
userRoutes.put('/:id', async (ctx) => {
  const { id } = ctx.params;
  const body = await ctx.body();
  const validated = updateUserSchema.parse(body);
  
  const user = await userService.update(id, validated);
  
  if (!user) {
    return ctx.json({ error: 'User not found' }, 404);
  }
  
  return ctx.json({ user });
});

// DELETE /api/users/:id
userRoutes.delete('/:id', async (ctx) => {
  const { id } = ctx.params;
  const deleted = await userService.delete(id);
  
  if (!deleted) {
    return ctx.json({ error: 'User not found' }, 404);
  }
  
  return ctx.json({ message: 'User deleted successfully' });
});
`;
  }

  private getAuthMiddleware(): string {
    return `import { Middleware, Context } from '@engjts/nexus';

export const authMiddleware: Middleware = async (ctx: Context, next) => {
  const authHeader = ctx.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ctx.json({ error: 'Unauthorized' }, 401);
  }
  
  const token = authHeader.slice(7);
  
  try {
    // TODO: Verify JWT token
    // const payload = await verifyToken(token);
    // ctx.set('user', payload);
    
    return next();
  } catch (error) {
    return ctx.json({ error: 'Invalid token' }, 401);
  }
};
`;
  }

  private getLoggerMiddleware(): string {
    return `import { Middleware, Context } from '@engjts/nexus';

export const loggerMiddleware: Middleware = async (ctx: Context, next) => {
  const start = Date.now();
  const { method, path } = ctx;
  
  console.log(\`→ \${method} \${path}\`);
  
  const response = await next();
  
  const duration = Date.now() - start;
  console.log(\`← \${method} \${path} \${duration}ms\`);
  
  return response;
};
`;
  }

  private getUserService(): string {
    return `import { User, CreateUserDto, UpdateUserDto } from '../types';

// In-memory storage for demo purposes
const users: Map<string, User> = new Map();
let idCounter = 1;

export class UserService {
  async findAll(): Promise<User[]> {
    return Array.from(users.values());
  }

  async findById(id: string): Promise<User | null> {
    return users.get(id) || null;
  }

  async create(data: CreateUserDto): Promise<User> {
    const id = String(idCounter++);
    const user: User = {
      id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    users.set(id, user);
    return user;
  }

  async update(id: string, data: UpdateUserDto): Promise<User | null> {
    const user = users.get(id);
    
    if (!user) {
      return null;
    }
    
    const updatedUser: User = {
      ...user,
      ...data,
      updatedAt: new Date(),
    };
    
    users.set(id, updatedUser);
    return updatedUser;
  }

  async delete(id: string): Promise<boolean> {
    return users.delete(id);
  }
}
`;
  }

  private getUserValidator(): string {
    return `import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
`;
  }

  private getTypes(): string {
    return `export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}
`;
  }

  private getPublicHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.projectName}</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <div id="app">
    <header>
      <h1>${this.projectName}</h1>
      <p>Powered by Nexus Framework</p>
    </header>
    
    <main>
      <section class="hero">
        <h2>Welcome to your new project!</h2>
        <p>Start building amazing things.</p>
      </section>
    </main>
    
    <footer>
      <p>&copy; ${new Date().getFullYear()} ${this.projectName}</p>
    </footer>
  </div>
  
  <script src="/js/app.js"></script>
</body>
</html>
`;
  }

  private getPublicCss(): string {
    return `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --primary: #3b82f6;
  --primary-dark: #2563eb;
  --text: #1f2937;
  --text-light: #6b7280;
  --bg: #ffffff;
  --bg-alt: #f9fafb;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  line-height: 1.6;
  color: var(--text);
  background: var(--bg);
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

header {
  background: var(--primary);
  color: white;
  padding: 2rem;
  text-align: center;
}

header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

header p {
  opacity: 0.9;
}

main {
  flex: 1;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.hero {
  text-align: center;
  padding: 4rem 2rem;
  background: var(--bg-alt);
  border-radius: 8px;
  margin-top: 2rem;
}

.hero h2 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  color: var(--primary);
}

footer {
  background: var(--bg-alt);
  padding: 1.5rem;
  text-align: center;
  color: var(--text-light);
}
`;
  }

  private getPublicJs(): string {
    return `// App initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log('${this.projectName} initialized!');
  
  // Fetch API health
  fetch('/health')
    .then(res => res.json())
    .then(data => {
      console.log('API Status:', data);
    })
    .catch(err => {
      console.error('API Error:', err);
    });
});
`;
  }
}

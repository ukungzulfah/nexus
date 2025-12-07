# Nexus CLI

Command-line interface untuk Nexus Framework.

## Installation

Setelah install `@engjts/nexus`, command `nexus` akan tersedia secara global:

```bash
npm install -g @engjts/nexus
```

Atau gunakan via npx:

```bash
npx @engjts/nexus create my-app
```

## Commands

### `nexus create <name>`

Buat project Nexus baru.

```bash
nexus create my-app
nexus create my-api --template api
nexus create my-fullstack --template fullstack
```

**Options:**

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--template` | `-t` | Template project (basic, api, fullstack) | `basic` |
| `--package-manager` | `-pm` | Package manager (npm, yarn, pnpm, bun) | `npm` |
| `--skip-install` | | Skip dependency installation | `false` |
| `--skip-git` | | Skip git initialization | `false` |

**Templates:**

- **basic**: Simple starter dengan routing dasar
- **api**: REST API dengan structure lengkap (routes, middleware, services, validators)
- **fullstack**: API + static files untuk frontend

### `nexus init`

Initialize Nexus di directory yang sudah ada.

```bash
nexus init
nexus init --template api
nexus init --force
```

**Options:**

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--template` | `-t` | Template project | `basic` |
| `--force` | `-f` | Force init meskipun directory tidak kosong | `false` |

### `nexus generate <type> <name>`

Generate komponen baru.

```bash
nexus generate route users
nexus generate controller UserController
nexus generate middleware auth
nexus generate service user
nexus generate model Product
nexus generate validator user
```

**Types:**

| Type | Description | Output Path |
|------|-------------|-------------|
| `route` | Route handler | `src/routes/<name>.ts` |
| `middleware` | Middleware function | `src/middleware/<name>.ts` |
| `controller` | Controller class dengan decorators | `src/controllers/<name>.ts` |
| `service` | Service class dengan CRUD methods | `src/services/<name>.ts` |
| `model` | Model/entity definition | `src/models/<name>.ts` |
| `validator` | Zod validation schemas | `src/validators/<name>.ts` |

**Options:**

| Option | Alias | Description |
|--------|-------|-------------|
| `--path` | `-p` | Custom output path |
| `--methods` | `-m` | HTTP methods untuk route (comma-separated) |

**Examples:**

```bash
# Generate route dengan multiple methods
nexus generate route products --methods get,post,put,delete

# Generate ke custom path
nexus generate middleware auth --path src/api/middleware
```

### `nexus dev`

Start development server dengan hot reload.

```bash
nexus dev
nexus dev --port 8080
nexus dev --host 0.0.0.0
```

**Options:**

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--port` | `-p` | Port untuk server | `3000` |
| `--host` | `-H` | Host untuk bind server | `localhost` |

### `nexus build`

Build project untuk production.

```bash
nexus build
nexus build --outDir build
```

**Options:**

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--outDir` | `-o` | Output directory | `dist` |
| `--minify` | | Minify output | `false` |

### `nexus help [command]`

Tampilkan help.

```bash
nexus help
nexus help create
nexus help generate
```

### `nexus version`

Tampilkan versi CLI.

```bash
nexus version
nexus --version
nexus -v
```

## Project Structure

Saat membuat project baru dengan template `api`, struktur folder akan seperti ini:

```
my-app/
├── src/
│   ├── index.ts            # Entry point
│   ├── routes/
│   │   ├── index.ts        # Route registry
│   │   └── users.ts        # User routes
│   ├── middleware/
│   │   ├── auth.ts         # Auth middleware
│   │   └── logger.ts       # Logger middleware
│   ├── services/
│   │   └── user.service.ts # Business logic
│   ├── validators/
│   │   └── user.validator.ts # Zod schemas
│   └── types/
│       └── index.ts        # TypeScript types
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

## Environment Variables

File `.env.example` berisi template environment variables:

```env
# Server
PORT=3000
HOST=localhost
NODE_ENV=development

# Database
DATABASE_URL=mysql://user:password@localhost:3306/dbname

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
```

Copy ke `.env` dan sesuaikan nilai-nilainya:

```bash
cp .env.example .env
```

## Quick Start

```bash
# Create new project
nexus create my-api --template api

# Navigate to project
cd my-api

# Install dependencies (if skipped)
npm install

# Start development server
npm run dev
# atau
nexus dev

# Build for production
npm run build
# atau
nexus build

# Start production server
npm start
```

## Tips

### Using with Different Package Managers

```bash
# Using Yarn
nexus create my-app --pm yarn

# Using pnpm
nexus create my-app --pm pnpm

# Using Bun
nexus create my-app --pm bun
```

### Generate Multiple Components

```bash
# Generate complete feature
nexus generate route products
nexus generate service product
nexus generate validator product
nexus generate model Product
```

### Custom Paths

```bash
# Generate ke subfolder
nexus generate route v2/users --path src/api/v2/routes
```

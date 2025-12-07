import { Command, CommandOption } from '../cli';
import { Logger } from '../utils/logger';
import { FileSystem } from '../utils/file-system';
import { GeneratorTemplates } from '../templates/generators';

type GeneratorType = 'route' | 'middleware' | 'controller' | 'service' | 'model' | 'validator';

export class GenerateCommand implements Command {
  name = 'generate';
  description = 'Generate components (route, middleware, controller, etc.)';
  usage = 'nexus generate <type> <name> [options]';
  options: CommandOption[] = [
    {
      name: 'path',
      alias: 'p',
      description: 'Custom path for the generated file',
    },
    {
      name: 'methods',
      alias: 'm',
      description: 'HTTP methods for route (comma-separated)',
      defaultValue: 'get',
    },
  ];

  private logger = new Logger();
  private validTypes: GeneratorType[] = ['route', 'middleware', 'controller', 'service', 'model', 'validator'];

  async execute(
    args: string[],
    options: Record<string, string | boolean>
  ): Promise<void> {
    if (args.length < 2) {
      this.showUsage();
      return;
    }

    const [type, name] = args;

    if (!this.validTypes.includes(type as GeneratorType)) {
      this.logger.error(`Invalid type: ${type}`);
      this.logger.info(`Valid types: ${this.validTypes.join(', ')}`);
      return;
    }

    const customPath = options.path as string | undefined;
    const methods = ((options.methods || 'get') as string).split(',').map(m => m.trim().toLowerCase());

    await this.generate(type as GeneratorType, name, { customPath, methods });
  }

  private async generate(
    type: GeneratorType,
    name: string,
    options: { customPath?: string; methods: string[] }
  ): Promise<void> {
    const generator = new GeneratorTemplates();
    const { filePath, content } = generator.generate(type, name, options);

    const targetPath = options.customPath 
      ? FileSystem.joinPath(process.cwd(), options.customPath, `${name}.ts`)
      : FileSystem.joinPath(process.cwd(), filePath);

    // Check if file already exists
    if (await FileSystem.exists(targetPath)) {
      this.logger.error(`File already exists: ${targetPath}`);
      return;
    }

    await FileSystem.writeFile(targetPath, content);
    this.logger.success(`Created ${type}: ${targetPath}`);
  }

  private showUsage(): void {
    console.log(`
${this.logger.colors.bright}Usage:${this.logger.colors.reset} nexus generate <type> <name> [options]

${this.logger.colors.bright}Types:${this.logger.colors.reset}
  route        Generate a route handler
  middleware   Generate a middleware
  controller   Generate a controller class
  service      Generate a service class
  model        Generate a model/entity
  validator    Generate a validation schema

${this.logger.colors.bright}Examples:${this.logger.colors.reset}
  nexus generate route users
  nexus generate controller UserController
  nexus generate middleware auth
  nexus generate route products --methods get,post,put,delete

${this.logger.colors.bright}Options:${this.logger.colors.reset}
  --path, -p    Custom output path
  --methods, -m HTTP methods for routes (comma-separated)
`);
  }
}

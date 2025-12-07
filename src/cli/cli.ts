import { CreateCommand } from './commands/create';
import { InitCommand } from './commands/init';
import { GenerateCommand } from './commands/generate';
import { DevCommand } from './commands/dev';
import { BuildCommand } from './commands/build';
import { HelpCommand } from './commands/help';
import { VersionCommand } from './commands/version';
import { Logger } from './utils/logger';

export interface Command {
  name: string;
  description: string;
  usage: string;
  options?: CommandOption[];
  execute(args: string[], options: Record<string, string | boolean>): Promise<void>;
}

export interface CommandOption {
  name: string;
  alias?: string;
  description: string;
  required?: boolean;
  defaultValue?: string | boolean;
}

export class CLI {
  private commands: Map<string, Command> = new Map();
  private logger = new Logger();

  constructor() {
    this.registerCommands();
  }

  private registerCommands(): void {
    const commands: Command[] = [
      new CreateCommand(),
      new InitCommand(),
      new GenerateCommand(),
      new DevCommand(),
      new BuildCommand(),
      new HelpCommand(() => this.commands),
      new VersionCommand(),
    ];

    for (const command of commands) {
      this.commands.set(command.name, command);
    }
  }

  async run(args: string[]): Promise<void> {
    if (args.length === 0) {
      this.showWelcome();
      return;
    }

    const [commandName, ...rest] = args;

    // Handle global flags
    if (commandName === '--help' || commandName === '-h') {
      const helpCommand = this.commands.get('help');
      await helpCommand?.execute([], {});
      return;
    }

    if (commandName === '--version' || commandName === '-v') {
      const versionCommand = this.commands.get('version');
      await versionCommand?.execute([], {});
      return;
    }

    const command = this.commands.get(commandName);
    if (!command) {
      this.logger.error(`Unknown command: ${commandName}`);
      this.logger.info('Run "nexus --help" for available commands');
      process.exit(1);
    }

    const { positionalArgs, options } = this.parseArgs(rest);

    try {
      await command.execute(positionalArgs, options);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(error.message);
      }
      process.exit(1);
    }
  }

  private parseArgs(args: string[]): {
    positionalArgs: string[];
    options: Record<string, string | boolean>;
  } {
    const positionalArgs: string[] = [];
    const options: Record<string, string | boolean> = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');
        if (value !== undefined) {
          options[key] = value;
        } else if (args[i + 1] && !args[i + 1].startsWith('-')) {
          options[key] = args[++i];
        } else {
          options[key] = true;
        }
      } else if (arg.startsWith('-')) {
        const key = arg.slice(1);
        if (args[i + 1] && !args[i + 1].startsWith('-')) {
          options[key] = args[++i];
        } else {
          options[key] = true;
        }
      } else {
        positionalArgs.push(arg);
      }
    }

    return { positionalArgs, options };
  }

  private showWelcome(): void {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗             ║
║   ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝             ║
║   ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗             ║
║   ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║             ║
║   ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║             ║
║   ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝             ║
║                                                           ║
║   Async-First Web Framework with Type-Safety              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

  ${this.logger.colors.cyan}Usage:${this.logger.colors.reset} nexus <command> [options]

  ${this.logger.colors.cyan}Commands:${this.logger.colors.reset}
    create <name>     Create a new Nexus project
    init              Initialize Nexus in current directory
    generate <type>   Generate components (route, middleware, etc.)
    dev               Start development server
    build             Build for production

  ${this.logger.colors.cyan}Options:${this.logger.colors.reset}
    --help, -h        Show help
    --version, -v     Show version

  Run ${this.logger.colors.green}nexus <command> --help${this.logger.colors.reset} for more information on a command.
`);
  }
}

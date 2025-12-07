import { Command } from '../cli';
import { Logger } from '../utils/logger';

export class HelpCommand implements Command {
  name = 'help';
  description = 'Show help information';
  usage = 'nexus help [command]';

  private logger = new Logger();
  private getCommands: () => Map<string, Command>;

  constructor(getCommands: () => Map<string, Command>) {
    this.getCommands = getCommands;
  }

  async execute(
    args: string[],
    options: Record<string, string | boolean>
  ): Promise<void> {
    const commands = this.getCommands();

    if (args.length > 0) {
      const commandName = args[0];
      const command = commands.get(commandName);

      if (!command) {
        this.logger.error(`Unknown command: ${commandName}`);
        return;
      }

      this.showCommandHelp(command);
      return;
    }

    this.showGeneralHelp(commands);
  }

  private showGeneralHelp(commands: Map<string, Command>): void {
    console.log(`
${this.logger.colors.bright}Nexus CLI${this.logger.colors.reset} - Async-First Web Framework

${this.logger.colors.bright}Usage:${this.logger.colors.reset}
  nexus <command> [options]

${this.logger.colors.bright}Commands:${this.logger.colors.reset}
`);

    for (const [name, command] of commands) {
      console.log(`  ${this.logger.colors.cyan}${name.padEnd(12)}${this.logger.colors.reset} ${command.description}`);
    }

    console.log(`
${this.logger.colors.bright}Global Options:${this.logger.colors.reset}
  --help, -h     Show help
  --version, -v  Show version

${this.logger.colors.bright}Examples:${this.logger.colors.reset}
  ${this.logger.colors.dim}# Create a new project${this.logger.colors.reset}
  nexus create my-app

  ${this.logger.colors.dim}# Create with specific template${this.logger.colors.reset}
  nexus create my-api --template api

  ${this.logger.colors.dim}# Generate a route${this.logger.colors.reset}
  nexus generate route users

  ${this.logger.colors.dim}# Start development server${this.logger.colors.reset}
  nexus dev

Run ${this.logger.colors.cyan}nexus help <command>${this.logger.colors.reset} for more information on a specific command.
`);
  }

  private showCommandHelp(command: Command): void {
    console.log(`
${this.logger.colors.bright}${command.name}${this.logger.colors.reset} - ${command.description}

${this.logger.colors.bright}Usage:${this.logger.colors.reset}
  ${command.usage}
`);

    if (command.options && command.options.length > 0) {
      console.log(`${this.logger.colors.bright}Options:${this.logger.colors.reset}`);
      for (const option of command.options) {
        const aliasStr = option.alias ? `, -${option.alias}` : '';
        const defaultStr = option.defaultValue !== undefined 
          ? ` (default: ${option.defaultValue})` 
          : '';
        console.log(`  --${option.name}${aliasStr}`);
        console.log(`      ${option.description}${defaultStr}`);
      }
      console.log('');
    }
  }
}

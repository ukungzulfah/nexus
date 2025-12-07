import { Command } from '../cli';
import { Logger } from '../utils/logger';
import { FileSystem } from '../utils/file-system';

export class VersionCommand implements Command {
  name = 'version';
  description = 'Show Nexus CLI version';
  usage = 'nexus version';

  private logger = new Logger();

  async execute(
    args: string[],
    options: Record<string, string | boolean>
  ): Promise<void> {
    // Try to read version from package.json
    let version = '0.1.0';
    
    try {
      // Check for local package.json first
      const localPackage = FileSystem.joinPath(process.cwd(), 'node_modules', '@engjts/nexus', 'package.json');
      if (await FileSystem.exists(localPackage)) {
        const content = await FileSystem.readFile(localPackage);
        const pkg = JSON.parse(content);
        version = pkg.version;
      }
    } catch {
      // Use default version
    }

    console.log(`
${this.logger.colors.cyan}Nexus CLI${this.logger.colors.reset} v${version}

${this.logger.colors.dim}Node:${this.logger.colors.reset}    ${process.version}
${this.logger.colors.dim}OS:${this.logger.colors.reset}      ${process.platform} ${process.arch}
`);
  }
}

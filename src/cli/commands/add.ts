import { Command, CommandOption } from '../cli';
import { Logger } from '../utils/logger';
import { FileSystem } from '../utils/file-system';

type PluginType = 'playground' | 'postman' | 'swagger';

interface PluginConfig {
  name: string;
  import: string;
  feature: string;
  description: string;
}

export class AddCommand implements Command {
  name = 'add';
  description = 'Add plugins to your Nexus project';
  usage = 'nexus add <plugin> [options]';
  options: CommandOption[] = [
    {
      name: 'path',
      alias: 'p',
      description: 'Path to the entry file (default: src/index.ts)',
      defaultValue: 'src/index.ts',
    },
  ];

  private logger = new Logger();
  private validPlugins: PluginType[] = ['playground', 'postman', 'swagger'];

  private pluginConfigs: Record<PluginType, PluginConfig> = {
    playground: {
      name: 'playground',
      import: 'playground',
      feature: 'plugin(playground())',
      description: 'Interactive API playground at /playground',
    },
    postman: {
      name: 'postman',
      import: 'postman',
      feature: 'plugin(postman())',
      description: 'Postman collection export at /postman',
    },
    swagger: {
      name: 'swagger',
      import: 'swagger',
      feature: 'plugin(swagger())',
      description: 'Swagger/OpenAPI documentation at /docs',
    },
  };

  async execute(
    args: string[],
    options: Record<string, string | boolean>
  ): Promise<void> {
    if (args.length < 1) {
      this.showUsage();
      return;
    }

    const [plugin] = args;

    if (!this.validPlugins.includes(plugin as PluginType)) {
      this.logger.error(`Invalid plugin: ${plugin}`);
      this.logger.info(`Valid plugins: ${this.validPlugins.join(', ')}`);
      return;
    }

    const entryPath = (options.path as string) || 'src/index.ts';
    await this.addPlugin(plugin as PluginType, entryPath);
  }

  private async addPlugin(plugin: PluginType, entryPath: string): Promise<void> {
    const fullPath = FileSystem.joinPath(process.cwd(), entryPath);
    const config = this.pluginConfigs[plugin];

    // Check if entry file exists
    if (!(await FileSystem.exists(fullPath))) {
      this.logger.error(`Entry file not found: ${fullPath}`);
      this.logger.info('Use --path to specify your entry file');
      return;
    }

    // Read current file
    let content = await FileSystem.readFile(fullPath);

    // Check if plugin is already added
    if (content.includes(`app.plugin(${config.feature})`)) {
      this.logger.info(`Plugin "${plugin}" is already added to your project`);
      return;
    }

    // Check if import already exists
    const importRegex = new RegExp(`import\\s*{([^}]*)}\\s*from\\s*['"]@engjts/nexus['"]`);
    const importMatch = content.match(importRegex);

    if (importMatch) {
      const currentImports = importMatch[1];
      if (!currentImports.includes(config.import)) {
        // Add to existing import
        const newImports = currentImports.trim() + ', ' + config.import;
        content = content.replace(importRegex, `import {${newImports}} from '@engjts/nexus'`);
      }
    } else {
      // Add new import at the top
      content = `import { ${config.import} } from '@engjts/nexus';\n${content}`;
    }

    // Find where to add app.plugin()
    // Look for existing app.plugin() calls or app.use() calls
    const pluginPattern = /app\.plugin\([^)]+\);?\n?/g;
    const usePattern = /app\.use\([^)]+\);?\n?/;
    const listenPattern = /app\.listen\(/;

    let insertPosition = -1;
    let insertText = `app.plugin(${config.feature});\n`;

    // Find last app.plugin() call
    let lastPluginMatch: RegExpExecArray | null = null;
    let match;
    while ((match = pluginPattern.exec(content)) !== null) {
      lastPluginMatch = match;
    }

    if (lastPluginMatch) {
      // Insert after last plugin
      insertPosition = lastPluginMatch.index + lastPluginMatch[0].length;
    } else {
      // Find app.use() or app.listen()
      const useMatch = content.match(usePattern);
      const listenMatch = content.match(listenPattern);

      if (useMatch && useMatch.index !== undefined) {
        // Insert before first app.use()
        insertPosition = useMatch.index;
        insertText = `// Plugins\napp.plugin(${config.feature});\n\n`;
      } else if (listenMatch && listenMatch.index !== undefined) {
        // Insert before app.listen()
        insertPosition = listenMatch.index;
        insertText = `// Plugins\napp.plugin(${config.feature});\n\n`;
      }
    }

    if (insertPosition === -1) {
      this.logger.error('Could not find a suitable location to add the plugin');
      this.logger.info('Please add manually: app.plugin(' + config.feature + ')');
      return;
    }

    // Insert the plugin call
    content = content.slice(0, insertPosition) + insertText + content.slice(insertPosition);

    // Write back
    await FileSystem.writeFile(fullPath, content);

    this.logger.success(`Added "${plugin}" plugin to your project`);
    this.logger.info(`  ${config.description}`);
  }

  private showUsage(): void {
    console.log(`
${this.logger.colors.bright}Usage:${this.logger.colors.reset} nexus add <plugin> [options]

${this.logger.colors.bright}Plugins:${this.logger.colors.reset}
  playground   Add interactive API playground
  postman      Add Postman collection export
  swagger      Add Swagger/OpenAPI documentation

${this.logger.colors.bright}Examples:${this.logger.colors.reset}
  nexus add swagger
  nexus add playground
  nexus add postman
  nexus add swagger --path src/app.ts

${this.logger.colors.bright}Options:${this.logger.colors.reset}
  --path, -p   Path to entry file (default: src/index.ts)
`);
  }
}

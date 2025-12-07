import { Command } from '../cli';
import { Logger } from '../utils/logger';
import { FileSystem } from '../utils/file-system';
import { spawnCommand } from '../utils/exec';

export class DevCommand implements Command {
  name = 'dev';
  description = 'Start development server with hot reload';
  usage = 'nexus dev [options]';
  options = [
    {
      name: 'port',
      alias: 'p',
      description: 'Port to run the server on',
      defaultValue: '3000',
    },
    {
      name: 'host',
      alias: 'H',
      description: 'Host to bind the server to',
      defaultValue: 'localhost',
    },
  ];

  private logger = new Logger();

  async execute(
    args: string[],
    options: Record<string, string | boolean>
  ): Promise<void> {
    const port = options.port || options.p || '3000';
    const host = options.host || options.H || 'localhost';

    // Check if we're in a Nexus project
    const packageJsonPath = FileSystem.joinPath(process.cwd(), 'package.json');
    if (!(await FileSystem.exists(packageJsonPath))) {
      this.logger.error('No package.json found. Are you in a Nexus project?');
      return;
    }

    // Check for main entry file
    const possibleEntries = ['src/index.ts', 'src/main.ts', 'src/app.ts', 'index.ts'];
    let entryFile: string | null = null;

    for (const entry of possibleEntries) {
      if (await FileSystem.exists(FileSystem.joinPath(process.cwd(), entry))) {
        entryFile = entry;
        break;
      }
    }

    if (!entryFile) {
      this.logger.error('No entry file found (src/index.ts, src/main.ts, etc.)');
      return;
    }

    this.logger.header('Starting Nexus Development Server');
    this.logger.info(`Entry: ${entryFile}`);
    this.logger.info(`Server: http://${host}:${port}`);
    this.logger.blank();

    // Try to use ts-node-dev, tsx, or ts-node
    const runners = [
      { cmd: 'npx', args: ['tsx', 'watch', entryFile] },
      { cmd: 'npx', args: ['ts-node-dev', '--respawn', '--transpile-only', entryFile] },
      { cmd: 'npx', args: ['ts-node', entryFile] },
    ];

    for (const runner of runners) {
      try {
        await spawnCommand(runner.cmd, runner.args, {
          cwd: process.cwd(),
          env: {
            PORT: String(port),
            HOST: String(host),
            NODE_ENV: 'development',
          },
        });
        break;
      } catch (error) {
        continue;
      }
    }
  }
}

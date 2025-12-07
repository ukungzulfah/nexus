import { Command } from '../cli';
import { Logger } from '../utils/logger';
import { FileSystem } from '../utils/file-system';
import { spawnCommand } from '../utils/exec';

export class BuildCommand implements Command {
  name = 'build';
  description = 'Build the project for production';
  usage = 'nexus build [options]';
  options = [
    {
      name: 'outDir',
      alias: 'o',
      description: 'Output directory',
      defaultValue: 'dist',
    },
    {
      name: 'minify',
      description: 'Minify the output',
      defaultValue: false,
    },
  ];

  private logger = new Logger();

  async execute(
    args: string[],
    options: Record<string, string | boolean>
  ): Promise<void> {
    const outDir = (options.outDir || options.o || 'dist') as string;

    // Check if we're in a Nexus project
    const packageJsonPath = FileSystem.joinPath(process.cwd(), 'package.json');
    if (!(await FileSystem.exists(packageJsonPath))) {
      this.logger.error('No package.json found. Are you in a Nexus project?');
      return;
    }

    this.logger.header('Building Nexus Project');

    // Check for tsconfig.json
    const tsconfigPath = FileSystem.joinPath(process.cwd(), 'tsconfig.json');
    if (!(await FileSystem.exists(tsconfigPath))) {
      this.logger.warning('No tsconfig.json found, using default configuration');
    }

    // Clean output directory
    this.logger.step(1, 3, 'Cleaning output directory...');
    const outputPath = FileSystem.joinPath(process.cwd(), outDir);
    await FileSystem.removeDirectory(outputPath);
    this.logger.success(`Cleaned ${outDir}`);

    // Run TypeScript compiler
    this.logger.step(2, 3, 'Compiling TypeScript...');
    const exitCode = await spawnCommand('npx', ['tsc', '--outDir', outDir], {
      cwd: process.cwd(),
    });

    if (exitCode !== 0) {
      this.logger.error('Build failed');
      return;
    }
    this.logger.success('TypeScript compiled');

    // Done
    this.logger.step(3, 3, 'Finalizing...');
    this.logger.success('Build completed!');

    this.logger.blank();
    this.logger.info(`Output directory: ${outDir}`);
    this.logger.info('Run "npm start" or "node dist/index.js" to start the server');
  }
}

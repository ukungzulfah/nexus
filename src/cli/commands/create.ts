import { Command, CommandOption } from '../cli';
import { Logger } from '../utils/logger';
import { FileSystem } from '../utils/file-system';
import { spawnCommand, checkCommandExists } from '../utils/exec';
import { ProjectTemplates } from '../templates';

export class CreateCommand implements Command {
  name = 'create';
  description = 'Create a new Nexus project';
  usage = 'nexus create <project-name> [options]';
  options: CommandOption[] = [
    {
      name: 'template',
      alias: 't',
      description: 'Project template (basic, api, fullstack)',
      defaultValue: 'basic',
    },
    {
      name: 'package-manager',
      alias: 'pm',
      description: 'Package manager to use (npm, yarn, pnpm, bun)',
      defaultValue: 'npm',
    },
    {
      name: 'skip-install',
      description: 'Skip dependency installation',
      defaultValue: false,
    },
    {
      name: 'skip-git',
      description: 'Skip git initialization',
      defaultValue: false,
    },
  ];

  private logger = new Logger();

  async execute(
    args: string[],
    options: Record<string, string | boolean>
  ): Promise<void> {
    if (args.length === 0) {
      this.logger.error('Project name is required');
      this.logger.info('Usage: nexus create <project-name>');
      return;
    }

    const projectName = args[0];
    const template = (options.template || options.t || 'basic') as string;
    const packageManager = (options['package-manager'] || options.pm || 'npm') as string;
    const skipInstall = options['skip-install'] === true;
    const skipGit = options['skip-git'] === true;

    // Validate project name
    if (!/^[a-z0-9-_]+$/i.test(projectName)) {
      this.logger.error('Project name can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    const projectPath = FileSystem.resolvePath(process.cwd(), projectName);

    // Check if directory already exists
    if (await FileSystem.exists(projectPath)) {
      this.logger.error(`Directory "${projectName}" already exists`);
      return;
    }

    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Creating new Nexus project: ${projectName.padEnd(25)}   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

    const totalSteps = skipInstall ? (skipGit ? 2 : 3) : (skipGit ? 3 : 4);
    let currentStep = 0;

    // Step 1: Create project structure
    this.logger.step(++currentStep, totalSteps, 'Creating project structure...');
    await this.createProjectStructure(projectPath, projectName, template);
    this.logger.success('Project structure created');

    // Step 2: Initialize git
    if (!skipGit) {
      this.logger.step(++currentStep, totalSteps, 'Initializing git repository...');
      if (await checkCommandExists('git')) {
        await spawnCommand('git', ['init'], { cwd: projectPath, stdio: 'pipe' });
        this.logger.success('Git repository initialized');
      } else {
        this.logger.warning('Git not found, skipping git initialization');
      }
    }

    // Step 3: Install dependencies
    if (!skipInstall) {
      this.logger.step(++currentStep, totalSteps, `Installing dependencies with ${packageManager}...`);
      
      const installCommand = this.getInstallCommand(packageManager);
      if (await checkCommandExists(packageManager)) {
        await spawnCommand(installCommand.cmd, installCommand.args, { cwd: projectPath });
        this.logger.success('Dependencies installed');
      } else {
        this.logger.warning(`${packageManager} not found, skipping dependency installation`);
        this.logger.info(`Run "${packageManager} install" manually to install dependencies`);
      }
    }

    // Step 4: Done!
    this.logger.step(++currentStep, totalSteps, 'Finalizing...');
    this.logger.success('Project created successfully!');

    this.showNextSteps(projectName, packageManager);
  }

  private async createProjectStructure(
    projectPath: string,
    projectName: string,
    template: string
  ): Promise<void> {
    const templates = new ProjectTemplates(projectName);
    const files = templates.getTemplate(template);

    for (const [filePath, content] of Object.entries(files)) {
      await FileSystem.writeFile(
        FileSystem.joinPath(projectPath, filePath),
        content
      );
    }
  }

  private getInstallCommand(pm: string): { cmd: string; args: string[] } {
    switch (pm) {
      case 'yarn':
        return { cmd: 'yarn', args: ['install'] };
      case 'pnpm':
        return { cmd: 'pnpm', args: ['install'] };
      case 'bun':
        return { cmd: 'bun', args: ['install'] };
      default:
        return { cmd: 'npm', args: ['install'] };
    }
  }

  private showNextSteps(projectName: string, pm: string): void {
    const runCmd = pm === 'npm' ? 'npm run' : pm;

    console.log(`
${this.logger.colors.green}✓ Success!${this.logger.colors.reset} Created ${this.logger.colors.cyan}${projectName}${this.logger.colors.reset}

${this.logger.colors.bright}Next steps:${this.logger.colors.reset}

  ${this.logger.colors.cyan}cd${this.logger.colors.reset} ${projectName}
  ${this.logger.colors.cyan}${runCmd}${this.logger.colors.reset} dev

${this.logger.colors.bright}Available commands:${this.logger.colors.reset}

  ${this.logger.colors.cyan}${runCmd} dev${this.logger.colors.reset}      Start development server
  ${this.logger.colors.cyan}${runCmd} build${this.logger.colors.reset}    Build for production
  ${this.logger.colors.cyan}${runCmd} start${this.logger.colors.reset}    Start production server
  ${this.logger.colors.cyan}${runCmd} test${this.logger.colors.reset}     Run tests

${this.logger.colors.dim}Happy coding with Nexus! 🚀${this.logger.colors.reset}
`);
  }
}

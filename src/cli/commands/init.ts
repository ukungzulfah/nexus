import { Command, CommandOption } from '../cli';
import { Logger } from '../utils/logger';
import { FileSystem } from '../utils/file-system';
import { spawnCommand, checkCommandExists } from '../utils/exec';
import { ProjectTemplates } from '../templates';

export class InitCommand implements Command {
  name = 'init';
  description = 'Initialize Nexus in the current directory';
  usage = 'nexus init [options]';
  options: CommandOption[] = [
    {
      name: 'template',
      alias: 't',
      description: 'Project template (basic, api, fullstack)',
      defaultValue: 'basic',
    },
    {
      name: 'force',
      alias: 'f',
      description: 'Force initialization even if directory is not empty',
      defaultValue: false,
    },
  ];

  private logger = new Logger();

  async execute(
    args: string[],
    options: Record<string, string | boolean>
  ): Promise<void> {
    const template = (options.template || options.t || 'basic') as string;
    const force = options.force === true || options.f === true;
    const projectPath = process.cwd();
    const projectName = FileSystem.getBasename(projectPath);

    // Check if directory is not empty
    const files = await FileSystem.listDirectory(projectPath);
    const hasFiles = files.filter(f => !f.startsWith('.')).length > 0;

    if (hasFiles && !force) {
      this.logger.error('Directory is not empty');
      this.logger.info('Use --force to initialize anyway');
      return;
    }

    this.logger.header(`Initializing Nexus project in ${projectPath}`);

    // Create project structure
    this.logger.step(1, 2, 'Creating project files...');
    await this.createProjectFiles(projectPath, projectName, template);
    this.logger.success('Project files created');

    // Initialize git if not exists
    this.logger.step(2, 2, 'Checking git repository...');
    const gitExists = await FileSystem.exists(FileSystem.joinPath(projectPath, '.git'));
    if (!gitExists && await checkCommandExists('git')) {
      await spawnCommand('git', ['init'], { cwd: projectPath, stdio: 'pipe' });
      this.logger.success('Git repository initialized');
    } else if (gitExists) {
      this.logger.info('Git repository already exists');
    }

    this.logger.blank();
    this.logger.success('Nexus project initialized successfully!');
    this.logger.blank();
    this.logger.info('Run "npm install" to install dependencies');
    this.logger.info('Run "npm run dev" to start the development server');
  }

  private async createProjectFiles(
    projectPath: string,
    projectName: string,
    template: string
  ): Promise<void> {
    const templates = new ProjectTemplates(projectName);
    const files = templates.getTemplate(template);

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = FileSystem.joinPath(projectPath, filePath);
      
      // Skip if file already exists
      if (await FileSystem.exists(fullPath)) {
        this.logger.warning(`Skipping ${filePath} (already exists)`);
        continue;
      }

      await FileSystem.writeFile(fullPath, content);
    }
  }
}

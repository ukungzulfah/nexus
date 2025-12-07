import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export async function executeCommand(
  command: string,
  cwd?: string
): Promise<ExecResult> {
  return execAsync(command, { cwd });
}

export function spawnCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    stdio?: 'inherit' | 'pipe';
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdio || 'inherit',
      env: { ...process.env, ...options.env },
      shell: true,
    });

    proc.on('close', (code) => {
      resolve(code || 0);
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

export async function checkCommandExists(command: string): Promise<boolean> {
  try {
    await execAsync(`which ${command}`);
    return true;
  } catch {
    return false;
  }
}

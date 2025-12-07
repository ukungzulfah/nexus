import * as fs from 'fs';
import * as path from 'path';

export class FileSystem {
  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async createDirectory(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  static async writeFile(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await this.createDirectory(dir);
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  static async readFile(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, 'utf-8');
  }

  static async copyDirectory(src: string, dest: string): Promise<void> {
    await this.createDirectory(dest);
    const entries = await fs.promises.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }

  static async removeDirectory(dirPath: string): Promise<void> {
    if (await this.exists(dirPath)) {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    }
  }

  static async listDirectory(dirPath: string): Promise<string[]> {
    return fs.promises.readdir(dirPath);
  }

  static async isDirectory(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(filePath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  static resolvePath(...paths: string[]): string {
    return path.resolve(...paths);
  }

  static joinPath(...paths: string[]): string {
    return path.join(...paths);
  }

  static getBasename(filePath: string): string {
    return path.basename(filePath);
  }

  static getDirname(filePath: string): string {
    return path.dirname(filePath);
  }
}

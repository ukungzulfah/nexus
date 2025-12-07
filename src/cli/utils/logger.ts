export class Logger {
  colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
  };

  info(message: string): void {
    console.log(`${this.colors.blue}ℹ${this.colors.reset} ${message}`);
  }

  success(message: string): void {
    console.log(`${this.colors.green}✓${this.colors.reset} ${message}`);
  }

  warning(message: string): void {
    console.log(`${this.colors.yellow}⚠${this.colors.reset} ${message}`);
  }

  error(message: string): void {
    console.log(`${this.colors.red}✗${this.colors.reset} ${message}`);
  }

  step(step: number, total: number, message: string): void {
    console.log(
      `${this.colors.cyan}[${step}/${total}]${this.colors.reset} ${message}`
    );
  }

  blank(): void {
    console.log('');
  }

  header(text: string): void {
    console.log(`\n${this.colors.bright}${this.colors.cyan}${text}${this.colors.reset}\n`);
  }

  list(items: string[]): void {
    for (const item of items) {
      console.log(`  ${this.colors.dim}•${this.colors.reset} ${item}`);
    }
  }

  box(lines: string[]): void {
    const maxLength = Math.max(...lines.map(l => l.length));
    const border = '─'.repeat(maxLength + 2);
    
    console.log(`┌${border}┐`);
    for (const line of lines) {
      const padding = ' '.repeat(maxLength - line.length);
      console.log(`│ ${line}${padding} │`);
    }
    console.log(`└${border}┘`);
  }

  spinner(message: string): Spinner {
    return new Spinner(message, this);
  }
}

export class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message: string;
  private logger: Logger;

  constructor(message: string, logger: Logger) {
    this.message = message;
    this.logger = logger;
  }

  start(): void {
    process.stdout.write(`${this.logger.colors.cyan}${this.frames[0]}${this.logger.colors.reset} ${this.message}`);
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(`${this.logger.colors.cyan}${this.frames[this.frameIndex]}${this.logger.colors.reset} ${this.message}`);
    }, 80);
  }

  stop(success = true): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    if (success) {
      console.log(`${this.logger.colors.green}✓${this.logger.colors.reset} ${this.message}`);
    } else {
      console.log(`${this.logger.colors.red}✗${this.logger.colors.reset} ${this.message}`);
    }
  }

  update(message: string): void {
    this.message = message;
  }
}

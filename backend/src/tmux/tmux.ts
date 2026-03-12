import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class TmuxError extends Error {
  constructor(message: string, public readonly args: string[]) {
    super(message);
  }
}

export interface TmuxClient {
  createSession(name: string, cwd: string, command: string, args: string[]): Promise<void>;
  sendKeys(name: string, input: string): Promise<void>;
  sendEnter(name: string): Promise<void>;
  sendCtrlC(name: string): Promise<void>;
  resize(name: string, cols: number, rows: number): Promise<void>;
  capturePane(name: string): Promise<string>;
  killSession(name: string): Promise<void>;
}

export class TmuxService implements TmuxClient {
  constructor(private readonly binary = 'tmux') {}

  private async run(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync(this.binary, args, { encoding: 'utf8' });
      return stdout;
    } catch (error: any) {
      const stderr = error?.stderr?.toString?.() || error?.message || 'tmux command failed';
      throw new TmuxError(stderr.trim(), args);
    }
  }

  async createSession(name: string, cwd: string, command: string, args: string[]) {
    // tmux new-session [options] [command [args]]
    // We pass command and args separately to avoid shell interpolation.
    await this.run(['new-session', '-d', '-s', name, '-c', cwd, '--', command, ...args]);
  }

  async sendKeys(name: string, input: string) {
    await this.run(['send-keys', '-t', name, input]);
  }

  async sendEnter(name: string) {
    await this.run(['send-keys', '-t', name, 'Enter']);
  }

  async sendCtrlC(name: string) {
    await this.run(['send-keys', '-t', name, 'C-c']);
  }

  async resize(name: string, cols: number, rows: number) {
    await this.run(['resize-window', '-t', name, '-x', String(cols), '-y', String(rows)]);
  }

  async capturePane(name: string) {
    return await this.run(['capture-pane', '-pt', name, '-S', '-2000']);
  }

  async killSession(name: string) {
    await this.run(['kill-session', '-t', name]);
  }
}

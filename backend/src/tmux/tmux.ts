import { execFileSync } from 'node:child_process';

export class TmuxError extends Error {
  constructor(message: string, public readonly args: string[]) {
    super(message);
  }
}

export interface TmuxClient {
  createSession(name: string, cwd: string, command: string, args: string[]): void;
  sendKeys(name: string, input: string): void;
  sendEnter(name: string): void;
  sendCtrlC(name: string): void;
  resize(name: string, cols: number, rows: number): void;
  capturePane(name: string): string;
  killSession(name: string): void;
}

export class TmuxService implements TmuxClient {
  constructor(private readonly binary = 'tmux') {}

  private run(args: string[]) {
    try {
      return execFileSync(this.binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error: any) {
      const stderr = error?.stderr?.toString?.() || 'tmux command failed';
      throw new TmuxError(stderr.trim(), args);
    }
  }

  createSession(name: string, cwd: string, command: string, args: string[]) {
    const full = [command, ...args].join(' ');
    this.run(['new-session', '-d', '-s', name, '-c', cwd, full]);
  }

  sendKeys(name: string, input: string) {
    this.run(['send-keys', '-t', name, input]);
  }

  sendEnter(name: string) {
    this.run(['send-keys', '-t', name, 'Enter']);
  }

  sendCtrlC(name: string) {
    this.run(['send-keys', '-t', name, 'C-c']);
  }

  resize(name: string, cols: number, rows: number) {
    this.run(['resize-window', '-t', name, '-x', String(cols), '-y', String(rows)]);
  }

  capturePane(name: string) {
    return this.run(['capture-pane', '-pt', name, '-S', '-2000']);
  }

  killSession(name: string) {
    this.run(['kill-session', '-t', name]);
  }
}

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const TMUX = process.env.TMUX_BINARY_PATH ?? 'tmux';

export class TmuxError extends Error {
  constructor(message: string, public readonly args: string[]) {
    super(message);
    this.name = 'TmuxError';
  }
}

async function run(args: string[]): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync(TMUX, args);
  } catch (error: any) {
    const stderr = error?.stderr?.toString() || error?.message || 'tmux command failed';
    throw new TmuxError(stderr.trim(), args);
  }
}

export async function createSession(
  name: string,
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>
): Promise<void> {
  const envArgs: string[] = [];
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      envArgs.push('-e', `${key}=${value}`);
    }
  }

  // tmux new-session -d -s name -c cwd -e K=V -- command args...
  // Passing command and args after -- ensures they are executed directly without shell interpolation.
  const tmuxArgs = [
    'new-session',
    '-d',
    '-s', name,
    '-c', cwd,
    ...envArgs,
    '--',
    command,
    ...args,
  ];

  await run(tmuxArgs);
}

export interface TmuxSessionInfo {
  name: string;
  windows: number;
  created: string;
}

export async function listSessions(): Promise<TmuxSessionInfo[]> {
  try {
    const { stdout } = await run([
      'list-sessions',
      '-F',
      '#{session_name}:#{session_windows}:#{session_created}'
    ]);

    if (!stdout.trim()) return [];

    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(':');
        return {
          name: parts[0] ?? '',
          windows: parseInt(parts[1] ?? '0', 10),
          created: parts[2] ?? '',
        };
      });
  } catch {
    // tmux returns exit code 1 if no sessions exist
    return [];
  }
}

export async function hasSession(name: string): Promise<boolean> {
  try {
    await run(['has-session', '-t', name]);
    return true;
  } catch {
    return false;
  }
}

export async function capturePane(sessionName: string): Promise<string> {
  try {
    const { stdout } = await run(['capture-pane', '-t', sessionName, '-p', '-e']);
    return stdout;
  } catch {
    return '';
  }
}

export async function sendKeys(sessionName: string, keys: string): Promise<void> {
  // send-keys -t sessionName keys
  await run(['send-keys', '-t', sessionName, keys]);
}

export async function killSession(sessionName: string): Promise<void> {
  try {
    await run(['kill-session', '-t', sessionName]);
  } catch {
    // Session may already be gone
  }
}

export async function resizeWindow(
  sessionName: string,
  width: number,
  height: number
): Promise<void> {
  try {
    await run([
      'resize-window',
      '-t', sessionName,
      '-x', width.toString(),
      '-y', height.toString()
    ]);
  } catch {
    // Best-effort resize
  }
}

export async function sendCtrlC(sessionName: string): Promise<void> {
  try {
    await run(['send-keys', '-t', sessionName, 'C-c']);
  } catch {
    // Best-effort
  }
}

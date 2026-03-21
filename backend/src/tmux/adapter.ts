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
    '-x', '160',
    '-y', '48',
    '-c', cwd,
    ...envArgs,
    '--',
    command,
    ...args,
  ];

  await run(tmuxArgs);
}

export async function setHistoryLimit(sessionName: string, limit: number): Promise<void> {
  try {
    await run(['set-window-option', '-t', `${sessionName}:0`, 'history-limit', limit.toString()]);
  } catch {
    // Best-effort scrollback tuning.
  }
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
    const state = await getPaneState(sessionName);
    const args = ['capture-pane', '-t', sessionName, '-p', '-e', '-N'];

    if (state.alternateOn) {
      args.push('-a');
    }

    const { stdout } = await run(args);
    return stdout;
  } catch {
    return '';
  }
}

export async function capturePaneHistory(sessionName: string): Promise<string> {
  try {
    const [history, dimensions] = await Promise.all([
      run(['capture-pane', '-t', sessionName, '-p', '-e', '-N', '-S', '-']),
      getPaneDimensions(sessionName),
    ]);

    const lines = history.stdout.split('\n');
    if (dimensions.rows <= 0 || lines.length <= dimensions.rows) {
      return '';
    }

    return lines.slice(0, Math.max(0, lines.length - dimensions.rows)).join('\n');
  } catch {
    return '';
  }
}

export interface TmuxPaneState {
  paneId: string;
  cursorX: number;
  cursorY: number;
  alternateOn: boolean;
}

export async function getPaneState(sessionName: string): Promise<TmuxPaneState> {
  try {
    const { stdout } = await run([
      'display-message',
      '-t', sessionName,
      '-p',
      '#{pane_id}|#{cursor_x}|#{cursor_y}|#{alternate_on}'
    ]);
    const [paneId, x, y, alternateOn] = stdout.trim().split('|');

    return {
      paneId: paneId ?? '',
      cursorX: Number(x) || 0,
      cursorY: Number(y) || 0,
      alternateOn: alternateOn === '1',
    };
  } catch {
    return {
      paneId: '',
      cursorX: 0,
      cursorY: 0,
      alternateOn: false,
    };
  }
}

export async function getCursor(sessionName: string): Promise<{ x: number; y: number }> {
  const state = await getPaneState(sessionName);
  return { x: state.cursorX, y: state.cursorY };
}

export async function getPaneDimensions(sessionName: string): Promise<{ cols: number; rows: number }> {
  try {
    const { stdout } = await run([
      'display-message',
      '-t', sessionName,
      '-p',
      '#{pane_width}|#{pane_height}',
    ]);
    const [cols, rows] = stdout.trim().split('|').map(Number);
    return {
      cols: cols || 0,
      rows: rows || 0,
    };
  } catch {
    return { cols: 0, rows: 0 };
  }
}

export async function sendKeys(sessionName: string, keys: string): Promise<void> {
  const bytes = Buffer.from(keys, 'utf8');
  if (bytes.length === 0) return;

  await run([
    'send-keys',
    '-H',
    '-t',
    sessionName,
    ...Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')),
  ]);
}

export async function sendLiteralText(sessionName: string, text: string): Promise<void> {
  if (!text) return;
  await run(['send-keys', '-l', '-t', sessionName, text]);
}

export async function sendEnter(sessionName: string): Promise<void> {
  await run(['send-keys', '-t', sessionName, 'Enter']);
}

export async function killSession(sessionName: string): Promise<void> {
  await run(['kill-session', '-t', sessionName]);
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
  await run(['send-keys', '-t', sessionName, 'C-c']);
}

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const TMUX = process.env.TMUX_BINARY_PATH ?? 'tmux';

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function createSession(
  name: string,
  command: string,
  args: string[],
  cwd: string,
  env?: Record<string, string>
): Promise<void> {
  const envParts: string[] = [];
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      envParts.push(`${key}=${escapeShellArg(value)}`);
    }
  }

  const fullCommand = [command, ...args].map(escapeShellArg).join(' ');

  // Build env-set commands for tmux
  const envArgs: string[] = [];
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      envArgs.push('-e', `${key}=${value}`);
    }
  }

  const tmuxArgs = [
    'new-session',
    '-d',
    '-s', name,
    '-c', cwd,
    ...envArgs,
    fullCommand,
  ];

  const cmd = [TMUX, ...tmuxArgs.map(escapeShellArg)].join(' ');
  await execAsync(cmd);
}

export interface TmuxSessionInfo {
  name: string;
  windows: number;
  created: string;
}

export async function listSessions(): Promise<TmuxSessionInfo[]> {
  try {
    const { stdout } = await execAsync(
      `${TMUX} list-sessions -F '#{session_name}:#{session_windows}:#{session_created}'`
    );

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
    await execAsync(`${TMUX} has-session -t ${escapeShellArg(name)}`);
    return true;
  } catch {
    return false;
  }
}

export async function capturePane(sessionName: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `${TMUX} capture-pane -t ${escapeShellArg(sessionName)} -p -e`
    );
    return stdout;
  } catch {
    return '';
  }
}

export async function sendKeys(sessionName: string, keys: string): Promise<void> {
  // Use send-keys with literal flag to avoid tmux key interpretation
  await execAsync(
    `${TMUX} send-keys -t ${escapeShellArg(sessionName)} ${escapeShellArg(keys)}`
  );
}

export async function killSession(sessionName: string): Promise<void> {
  try {
    await execAsync(`${TMUX} kill-session -t ${escapeShellArg(sessionName)}`);
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
    await execAsync(
      `${TMUX} resize-window -t ${escapeShellArg(sessionName)} -x ${width} -y ${height}`
    );
  } catch {
    // Best-effort resize
  }
}

export async function sendCtrlC(sessionName: string): Promise<void> {
  try {
    await execAsync(
      `${TMUX} send-keys -t ${escapeShellArg(sessionName)} C-c`
    );
  } catch {
    // Best-effort
  }
}

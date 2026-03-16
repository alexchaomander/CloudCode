import { createInterface } from 'node:readline';
import { Socket, connect as connectSocket } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

const TMUX = process.env.TMUX_BINARY_PATH ?? 'tmux';
const SIDECAR_SOCKET_PATH = process.env.CLOUDCODE_PTY_SOCKET_PATH ?? join(tmpdir(), 'cloudcode-pty.sock');
const SIDECAR_START_TIMEOUT_MS = parseInt(process.env.CLOUDCODE_PTY_START_TIMEOUT_MS ?? '10000', 10);
const SIDECAR_BIN_PATH = process.env.CLOUDCODE_PTY_SIDECAR_BIN ?? (
  existsSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'cloudcode-pty-sidecar'))
    ? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'cloudcode-pty-sidecar') // Dev: ../../bin
    : join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cloudcode-pty-sidecar')      // Shipped: ../bin
);
const SIDECAR_GO_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'sidecar');

type SidecarRequest =
  | { type: 'open'; streamId: string; sessionName: string; cols: number; rows: number }
  | { type: 'write'; streamId: string; data: string }
  | { type: 'resize'; streamId: string; cols: number; rows: number }
  | { type: 'close'; streamId: string }
  | { type: 'ping' };

type SidecarResponse = {
  type: 'ready' | 'output' | 'exit' | 'error' | 'pong';
  streamId?: string;
  data?: string;
  message?: string;
  exitCode?: number;
};

export interface SidecarStreamListener {
  onOutput: (chunk: { text: string; dataBase64: string }) => void;
  onExit: (exitCode: number) => void;
  onError: (message: string) => void;
}

export interface SidecarStreamHandle {
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  close: () => Promise<void>;
}

type StreamRecord = {
  listener: SidecarStreamListener;
  readyResolve: () => void;
  readyReject: (error: Error) => void;
  readyPromise: Promise<void>;
  ready: boolean;
  decoder: StringDecoder;
};

class SidecarManager {
  private process: ChildProcess | null = null;
  private socket: Socket | null = null;
  private startPromise: Promise<void> | null = null;
  private streamRecords = new Map<string, StreamRecord>();
  private streamCounter = 0;
  private currentSocketPath: string = SIDECAR_SOCKET_PATH;

  async start(socketPath?: string): Promise<void> {
    if (socketPath) {
      this.currentSocketPath = socketPath;
    }
    if (this.socket && !this.socket.destroyed) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startInternal(): Promise<void> {
    await rm(this.currentSocketPath, { force: true }).catch(() => {});
    await mkdir(dirname(this.currentSocketPath), { recursive: true });

    if (!this.process || this.process.killed) {
      this.process = this.spawnSidecar();
    }

    this.socket = await this.connectWithRetry();
    const rl = createInterface({ input: this.socket });
    rl.on('line', (line) => {
      this.handleMessage(line);
    });
    this.socket.on('close', () => {
      this.socket = null;
    });
    this.socket.on('error', (err) => {
      for (const record of this.streamRecords.values()) {
        record.listener.onError(err.message);
        if (!record.ready) {
          record.readyReject(err);
        }
      }
      this.streamRecords.clear();
    });
  }

  private spawnSidecar(): ChildProcess {
    const args = ['--socket', this.currentSocketPath, '--tmux', TMUX];
    const child = existsSync(SIDECAR_BIN_PATH)
      ? spawn(SIDECAR_BIN_PATH, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : spawn('go', ['run', './cmd/cloudcode-pty-sidecar', ...args], {
          cwd: SIDECAR_GO_DIR,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

    child.stdout?.on('data', () => {});
    child.stderr?.on('data', () => {});
    child.on('exit', (code, signal) => {
      this.socket?.destroy();
      this.socket = null;
      this.process = null;
      const message = `PTY sidecar exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}`;
      for (const record of this.streamRecords.values()) {
        record.listener.onError(message);
        if (!record.ready) {
          record.readyReject(new Error(message));
        }
      }
      this.streamRecords.clear();
    });

    return child;
  }

  private async connectWithRetry(): Promise<Socket> {
    const deadline = Date.now() + SIDECAR_START_TIMEOUT_MS;

    while (Date.now() < deadline) {
      try {
        const socket = await new Promise<Socket>((resolve, reject) => {
          const connection = connectSocket(this.currentSocketPath);
          connection.once('connect', () => resolve(connection));
          connection.once('error', reject);
        });
        return socket;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    throw new Error(`Timed out waiting for PTY sidecar at ${this.currentSocketPath}`);
  }

  private send(request: SidecarRequest): void {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('PTY sidecar socket is not connected');
    }
    this.socket.write(`${JSON.stringify(request)}\n`);
  }

  private handleMessage(line: string): void {
    if (!line.trim()) return;

    let message: SidecarResponse;
    try {
      message = JSON.parse(line) as SidecarResponse;
    } catch {
      return;
    }

    const streamId = message.streamId;
    if (!streamId) return;
    const record = this.streamRecords.get(streamId);
    if (!record) return;

    switch (message.type) {
      case 'ready':
        record.ready = true;
        record.readyResolve();
        break;
      case 'output':
        if (message.data) {
          const decoded = record.decoder.write(Buffer.from(message.data, 'base64'));
          if (decoded) {
            record.listener.onOutput({ text: decoded, dataBase64: message.data });
          }
        }
        break;
      case 'exit':
        {
          const trailing = record.decoder.end();
          if (trailing) {
            record.listener.onOutput({
              text: trailing,
              dataBase64: Buffer.from(trailing, 'utf8').toString('base64'),
            });
          }
        }
        record.listener.onExit(message.exitCode ?? 0);
        this.streamRecords.delete(streamId);
        break;
      case 'error': {
        {
          const trailing = record.decoder.end();
          if (trailing) {
            record.listener.onOutput({
              text: trailing,
              dataBase64: Buffer.from(trailing, 'utf8').toString('base64'),
            });
          }
        }
        const error = new Error(message.message ?? 'PTY sidecar error');
        record.listener.onError(error.message);
        if (!record.ready) {
          record.readyReject(error);
          this.streamRecords.delete(streamId);
        }
        break;
      }
      default:
        break;
    }
  }

  async openStream(
    sessionName: string,
    cols: number,
    rows: number,
    listener: SidecarStreamListener,
  ): Promise<SidecarStreamHandle> {
    await this.start();

    const streamId = `stream-${Date.now()}-${++this.streamCounter}`;
    let readyResolve!: () => void;
    let readyReject!: (error: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });

    this.streamRecords.set(streamId, {
      listener,
      readyResolve,
      readyReject,
      readyPromise,
      ready: false,
      decoder: new StringDecoder('utf8'),
    });

    this.send({
      type: 'open',
      streamId,
      sessionName,
      cols,
      rows,
    });

    await readyPromise;

    return {
      write: async (data: string) => {
        if (!this.socket || this.socket.destroyed || !this.streamRecords.has(streamId)) return;
        this.send({
          type: 'write',
          streamId,
          data: Buffer.from(data, 'utf8').toString('base64'),
        });
      },
      resize: async (nextCols: number, nextRows: number) => {
        if (!this.socket || this.socket.destroyed || !this.streamRecords.has(streamId)) return;
        this.send({
          type: 'resize',
          streamId,
          cols: nextCols,
          rows: nextRows,
        });
      },
      close: async () => {
        if (!this.streamRecords.has(streamId)) return;
        if (!this.socket || this.socket.destroyed) {
          this.streamRecords.delete(streamId);
          return;
        }
        this.send({ type: 'close', streamId });
        this.streamRecords.delete(streamId);
      },
    };
  }

  async stop(): Promise<void> {
    this.socket?.destroy();
    this.socket = null;
    this.process?.kill();
    this.process = null;
    await rm(this.currentSocketPath, { force: true }).catch(() => {});
  }
}

export const sidecarManager = new SidecarManager();

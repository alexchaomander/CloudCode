import type { FastifyPluginAsync } from 'fastify';
import { getSession, getSessionByPublicId } from '../sessions/service.js';
import { validateSession } from '../auth/service.js';
import { sidecarManager, type SidecarStreamHandle } from './sidecar-manager.js';
import * as tmux from '../tmux/adapter.js';
import {
  appendTranscript,
  appendTranscriptResize,
  formatReadableTerminalText,
  hasReadableTranscriptArtifacts,
  readTranscript,
} from './transcript-store.js';

const terminalRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/v1/sessions/:id/terminal/bootstrap', async (request, reply) => {
    const cookieToken = request.cookies?.['session'];
    const queryToken = (request.query as Record<string, string>)['token'];
    const token = cookieToken ?? queryToken;

    if (!token || !validateSession(token)) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const { id } = request.params as { id: string };
    const session = getSession(id) ?? getSessionByPublicId(id);
    if (!session) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    const isTerminalAvailable = session.status === 'running' || session.status === 'stopped' || session.status === 'error';
    const [dimensions, historyOutput, currentOutput] = await Promise.all([
      isTerminalAvailable
        ? tmux.getPaneDimensions(session.tmuxSessionName)
        : Promise.resolve({ cols: 160, rows: 48 }),
      isTerminalAvailable
        ? tmux.capturePaneHistory(session.tmuxSessionName)
        : Promise.resolve(''),
      isTerminalAvailable
        ? tmux.capturePane(session.tmuxSessionName)
        : Promise.resolve(''),
    ]);
    try {
      const transcriptOutput = await readTranscript(session.id, { ...dimensions, asMarkdown: true });
      const paneOutput = [historyOutput, currentOutput].filter(Boolean).join('\n').trim();
      const readablePaneOutput = formatReadableTerminalText(paneOutput);
      
      // We prioritize the semantic markdown transcript output if it exists and has content
      const readableOutput = transcriptOutput 
        ? transcriptOutput 
        : (readablePaneOutput || await readTranscript(session.id, dimensions));

      return reply.send({
        readableOutput,
        transcriptOutput,
        readablePaneOutput,
        historyOutput,
        currentOutput,
        fullOutput: readableOutput || (paneOutput || currentOutput),
      });
    } catch (e: any) {
      request.log.error({ err: e }, "Error in bootstrap");
      throw e;
    }
  });

  fastify.get('/ws/terminal', { websocket: true }, (connection: any, request) => {
    // In @fastify/websocket v11, connection might be the socket itself or contain a socket
    const ws = connection.socket || connection;
    
    if (!ws || typeof ws.send !== 'function') {
      fastify.log.error({ connection: !!connection }, 'Invalid WebSocket connection object');
      return;
    }
    let ptySession: SidecarStreamHandle | null = null;
    let attachedSession: ReturnType<typeof getSession> | null = null;
    let attachPromise: Promise<void> | null = null;
    let lastSize = { cols: 80, rows: 24 };

    const cookieToken = request.cookies?.['session'];
    const queryToken = (request.query as Record<string, string>)['token'];
    const token = cookieToken ?? queryToken;
    let authenticated = false;

    if (token) {
      const sessionInfo = validateSession(token);
      if (sessionInfo) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      ws.send(JSON.stringify({
        type: 'session.error',
        message: 'Authentication required',
      }));
      ws.close(1008, 'Unauthorized');
      return;
    }

    const attachSession = async (requestedSessionId: string): Promise<void> => {
      const session = getSession(requestedSessionId) ?? getSessionByPublicId(requestedSessionId);
      if (!session) {
        ws.send(JSON.stringify({
          type: 'session.error',
          message: `Session not found: ${requestedSessionId}`,
        }));
        return;
      }

      await ptySession?.close().catch(() => {});
      attachedSession = session;
      ptySession = await sidecarManager.openStream(session.tmuxSessionName, lastSize.cols, lastSize.rows, {
        onOutput: ({ text, dataBase64 }) => {
          void appendTranscript(session.id, text).catch(() => {});
          if (ws.readyState !== 1) return;
          ws.send(JSON.stringify({ type: 'terminal.output', dataBase64 }));
        },
        onExit: () => {
          if (ws.readyState !== 1) return;
          ws.send(JSON.stringify({ type: 'session.status', status: 'stopped' }));
        },
        onError: (message) => {
          if (ws.readyState !== 1) return;
          ws.send(JSON.stringify({ type: 'session.error', message }));
        },
      });

      ws.send(JSON.stringify({
        type: 'session.status',
        status: session.status,
      }));
      void appendTranscriptResize(session.id, lastSize.cols, lastSize.rows).catch(() => {});
    };

    const attachAndTrack = (requestedSessionId: string): Promise<void> => {
      const promise = attachSession(requestedSessionId).finally(() => {
        if (attachPromise === promise) {
          attachPromise = null;
        }
      });
      attachPromise = promise;
      return promise;
    };

    const querySessionId = (request.query as Record<string, string>)['sessionId'];
    if (querySessionId) {
      void attachAndTrack(querySessionId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to start terminal stream';
        ws.send(JSON.stringify({ type: 'session.error', message }));
      });
    }

    ws.on('message', (rawMessage: Buffer | string) => {
      void (async () => {
        try {
          const message = JSON.parse(rawMessage.toString()) as {
            type: string;
            data?: string;
            cols?: number;
            rows?: number;
            sessionId?: string;
          };

          switch (message.type) {
            case 'subscribe': {
              if (message.sessionId) {
                await attachAndTrack(message.sessionId);
              }
              break;
            }

            case 'terminal.input': {
              if (!ptySession && attachPromise) {
                await attachPromise;
              }

              if (!ptySession) {
                ws.send(JSON.stringify({
                  type: 'session.error',
                  message: 'Not subscribed to a session',
                }));
                return;
              }

              if (message.data !== undefined) {
                await ptySession.write(message.data);
              }
              break;
            }

            case 'terminal.resize': {
              if (!ptySession && attachPromise) {
                await attachPromise;
              }

              if (message.cols && message.rows) {
                lastSize = { cols: message.cols, rows: message.rows };
                await ptySession?.resize(message.cols, message.rows);
                if (attachedSession) {
                  void appendTranscriptResize(attachedSession.id, message.cols, message.rows).catch(() => {});
                }
              }
              break;
            }

            default:
              ws.send(JSON.stringify({
                type: 'session.error',
                message: `Unknown message type: ${message.type}`,
              }));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to process message';
          try {
            ws.send(JSON.stringify({
              type: 'session.error',
              message: msg,
            }));
          } catch {}
        }
      })();
    });

    ws.on('close', () => {
      void ptySession?.close().catch(() => {});
      ptySession = null;
      attachedSession = null;
    });

    ws.on('error', () => {
      void ptySession?.close().catch(() => {});
      ptySession = null;
      attachedSession = null;
    });
  });
};

export default terminalRoutes;

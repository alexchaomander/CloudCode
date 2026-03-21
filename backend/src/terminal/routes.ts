import type { FastifyPluginAsync } from 'fastify';
import { getSession, getSessionByPublicId, hasTranscriptRecorder } from '../sessions/service.js';
import { validateSession } from '../auth/service.js';
import { sidecarManager, type SidecarStreamHandle } from './sidecar-manager.js';
import * as tmux from '../tmux/adapter.js';
import {
  appendTranscript,
  appendTranscriptResize,
  formatReadableTerminalText,
  hasReadableTranscriptArtifacts,
  readTranscript,
  readTranscriptPage,
} from './transcript-store.js';

async function resolveTerminalTarget(id: string) {
  const session = getSession(id) ?? getSessionByPublicId(id);
  if (session) {
    return { session, tmuxSessionName: session.tmuxSessionName, isMirrorOnly: false };
  }

  if (await tmux.hasSession(id)) {
    return { session: null, tmuxSessionName: id, isMirrorOnly: true };
  }

  return null;
}

const terminalRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/v1/sessions/:id/transcript', async (request, reply) => {
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

    const query = request.query as Record<string, string | undefined>;
    const parseNumber = (value?: string): number | undefined => {
      if (value === undefined || value === '') return undefined;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const page = await readTranscriptPage(session.id, {
      limit: parseNumber(query.limit),
      before: parseNumber(query.before),
      after: parseNumber(query.after),
    });

    return reply.send(page);
  });

  fastify.get('/api/v1/sessions/:id/terminal/bootstrap', async (request, reply) => {
    const cookieToken = request.cookies?.['session'];
    const queryToken = (request.query as Record<string, string>)['token'];
    const token = cookieToken ?? queryToken;

    if (!token || !validateSession(token)) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const { id } = request.params as { id: string };
    const target = await resolveTerminalTarget(id);
    if (!target) {
      return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
    }

    const { session, tmuxSessionName, isMirrorOnly } = target;
    const isTerminalAvailable = isMirrorOnly
      ? true
      : session.status === 'running' || session.status === 'stopped' || session.status === 'error';
    const [dimensions, historyOutput, currentOutput] = await Promise.all([
      isTerminalAvailable
        ? tmux.getPaneDimensions(tmuxSessionName)
        : Promise.resolve({ cols: 160, rows: 48 }),
      isTerminalAvailable
        ? tmux.capturePaneHistory(tmuxSessionName)
        : Promise.resolve(''),
      isTerminalAvailable
        ? tmux.capturePane(tmuxSessionName)
        : Promise.resolve(''),
    ]);
    try {
      const paneOutput = [historyOutput, currentOutput].filter(Boolean).join('\n').trim();
      const scrollbackOutput = isMirrorOnly
        ? paneOutput
        : (await readTranscript(session.id, dimensions)) || paneOutput;
      const timelineOutput = isMirrorOnly
        ? scrollbackOutput
        : (await readTranscript(session.id, { ...dimensions, asTimeline: true })) || scrollbackOutput;
      const transcriptOutput = isMirrorOnly
        ? formatReadableTerminalText(paneOutput)
        : await readTranscript(session.id, { ...dimensions, asMarkdown: true });
      const readablePaneOutput = formatReadableTerminalText(paneOutput);
      
      // We prioritize the semantic markdown transcript output if it exists and has content
      const readableOutput = transcriptOutput 
        ? transcriptOutput 
        : (readablePaneOutput || (session ? await readTranscript(session.id, dimensions) : ''));

      return reply.send({
        scrollbackOutput,
        timelineOutput,
        readableOutput,
        transcriptOutput,
        readablePaneOutput,
        historyOutput,
        currentOutput,
        transcriptPaginationSupported: true,
        fullOutput: scrollbackOutput || readableOutput || paneOutput || currentOutput,
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
      const target = await resolveTerminalTarget(requestedSessionId);
      if (!target) {
        ws.send(JSON.stringify({
          type: 'session.error',
          message: `Session not found: ${requestedSessionId}`,
        }));
        return;
      }

      const { session, tmuxSessionName, isMirrorOnly } = target;
      await ptySession?.close().catch(() => {});
      attachedSession = session;
      ptySession = await sidecarManager.openStream(tmuxSessionName, lastSize.cols, lastSize.rows, {
        onOutput: ({ text, dataBase64 }) => {
          if (session && !isMirrorOnly && !hasTranscriptRecorder(session.id)) {
            void appendTranscript(session.id, text).catch((err) => {
              console.error(`[terminal] Failed to append transcript for session ${session.id}:`, err)
            })
          }
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
        status: session?.status ?? 'running',
      }));
      if (session && !isMirrorOnly) {
        void appendTranscriptResize(session.id, lastSize.cols, lastSize.rows).catch(() => {});
      }
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

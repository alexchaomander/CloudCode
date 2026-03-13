import type { FastifyPluginAsync } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import type WebSocket from 'ws';
import { requireAuth } from '../auth/middleware.js';
import { getSession, getSessionByPublicId } from '../sessions/service.js';
import * as tmux from '../tmux/adapter.js';
import { validateSession } from '../auth/service.js';

const POLL_INTERVAL_MS = parseInt(process.env.TERMINAL_POLL_INTERVAL_MS ?? '500', 10);

// Track active WebSocket connections per session
const activeConnections = new Map<string, Set<WebSocket>>();

// Track last known pane content per session for diffing
const lastPaneContent = new Map<string, string>();

// Global poll timers
const pollTimers = new Map<string, ReturnType<typeof setInterval>>();

function broadcastToSession(sessionId: string, message: unknown): void {
  const connections = activeConnections.get(sessionId);
  if (!connections) return;

  const data = JSON.stringify(message);
  for (const ws of connections) {
    try {
      if (ws.readyState === 1 /* OPEN */) {
        ws.send(data);
      }
    } catch {
      // Client disconnected, ignore
    }
  }
}

function startPolling(sessionId: string, tmuxSessionName: string): void {
  if (pollTimers.has(sessionId)) return;

  const timer = setInterval(async () => {
    const connections = activeConnections.get(sessionId);
    if (!connections || connections.size === 0) {
      stopPolling(sessionId);
      return;
    }

    try {
      const content = await tmux.capturePane(tmuxSessionName);
      const last = lastPaneContent.get(sessionId) ?? '';

      if (content !== last) {
        lastPaneContent.set(sessionId, content);
        broadcastToSession(sessionId, {
          type: 'terminal.output',
          data: content,
        });
      }

      // Check if session is still alive
      const alive = await tmux.hasSession(tmuxSessionName);
      if (!alive) {
        broadcastToSession(sessionId, {
          type: 'session.status',
          status: 'stopped',
        });
        stopPolling(sessionId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Poll error';
      broadcastToSession(sessionId, {
        type: 'session.error',
        message,
      });
    }
  }, POLL_INTERVAL_MS);

  pollTimers.set(sessionId, timer);
}

function stopPolling(sessionId: string): void {
  const timer = pollTimers.get(sessionId);
  if (timer) {
    clearInterval(timer);
    pollTimers.delete(sessionId);
  }
}

function addConnection(sessionId: string, ws: WebSocket): void {
  let connections = activeConnections.get(sessionId);
  if (!connections) {
    connections = new Set();
    activeConnections.set(sessionId, connections);
  }
  connections.add(ws);
}

function removeConnection(sessionId: string, ws: WebSocket): void {
  const connections = activeConnections.get(sessionId);
  if (connections) {
    connections.delete(ws);
    if (connections.size === 0) {
      activeConnections.delete(sessionId);
      stopPolling(sessionId);
      lastPaneContent.delete(sessionId);
    }
  }
}

const terminalRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/sessions/:id/terminal/bootstrap
  fastify.get(
    '/api/v1/sessions/:id/terminal/bootstrap',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const session = getSession(id) ?? getSessionByPublicId(id);

      if (!session) {
        return reply.status(404).send({ error: 'Not Found', message: 'Session not found' });
      }

      // Get current tmux output
      let currentOutput = '';
      if (session.status === 'running') {
        try {
          currentOutput = await tmux.capturePane(session.tmux_session_name);
        } catch {
          // Ignore capture errors
        }
      }

      return reply.send({
        session: {
          id: session.id,
          public_id: session.public_id,
          title: session.title,
          status: session.status,
          tmux_session_name: session.tmux_session_name,
          agent_profile: session.agent_profile,
        },
        current_output: currentOutput,
        poll_interval_ms: POLL_INTERVAL_MS,
      });
    }
  );

  // WebSocket at /ws/terminal?sessionId=xxx
  fastify.get('/ws/terminal', { websocket: true }, (connection: SocketStream, request) => {
    const ws = connection.socket;
    let sessionId: string | null = null;
    let tmuxSessionName: string | null = null;

    // Authenticate via cookie or query param token
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

    // Subscribe to sessionId if provided in query
    const querySessionId = (request.query as Record<string, string>)['sessionId'];
    if (querySessionId) {
      const session = getSession(querySessionId) ?? getSessionByPublicId(querySessionId);
      if (session) {
        sessionId = session.id;
        tmuxSessionName = session.tmux_session_name;
        addConnection(sessionId, ws);
        startPolling(sessionId, tmuxSessionName);

        // Send initial output async
        tmux.capturePane(tmuxSessionName)
          .then((initialOutput) => {
            if (initialOutput && sessionId) {
              lastPaneContent.set(sessionId, initialOutput);
              ws.send(JSON.stringify({
                type: 'terminal.output',
                data: initialOutput,
              }));
            }
          })
          .catch(() => {
            // Ignore initial capture errors
          });

        ws.send(JSON.stringify({
          type: 'session.status',
          status: session.status,
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'session.error',
          message: `Session not found: ${querySessionId}`,
        }));
      }
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
                // Unsubscribe from previous session
                if (sessionId) {
                  removeConnection(sessionId, ws);
                }

                const session = getSession(message.sessionId) ?? getSessionByPublicId(message.sessionId);
                if (!session) {
                  ws.send(JSON.stringify({
                    type: 'session.error',
                    message: `Session not found: ${message.sessionId}`,
                  }));
                  return;
                }

                sessionId = session.id;
                tmuxSessionName = session.tmux_session_name;
                addConnection(sessionId, ws);
                startPolling(sessionId, tmuxSessionName);

                // Send current state
                try {
                  const initialOutput = await tmux.capturePane(tmuxSessionName);
                  if (initialOutput) {
                    lastPaneContent.set(sessionId, initialOutput);
                    ws.send(JSON.stringify({
                      type: 'terminal.output',
                      data: initialOutput,
                    }));
                  }
                } catch {
                  // Ignore
                }

                ws.send(JSON.stringify({
                  type: 'session.status',
                  status: session.status,
                }));
              }
              break;
            }

            case 'terminal.input': {
              if (!sessionId || !tmuxSessionName) {
                ws.send(JSON.stringify({
                  type: 'session.error',
                  message: 'Not subscribed to a session',
                }));
                return;
              }

              if (message.data !== undefined) {
                await tmux.sendKeys(tmuxSessionName, message.data);
              }
              break;
            }

            case 'terminal.resize': {
              if (!tmuxSessionName) return;

              if (message.cols && message.rows) {
                await tmux.resizeWindow(tmuxSessionName, message.cols, message.rows);
              }
              break;
            }

            case 'request_refresh': {
              if (!sessionId || !tmuxSessionName) return;

              try {
                const content = await tmux.capturePane(tmuxSessionName);
                lastPaneContent.set(sessionId, content);
                ws.send(JSON.stringify({
                  type: 'terminal.output',
                  data: content,
                }));
              } catch {
                // Ignore
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
          } catch {
            // Socket may be closed
          }
        }
      })();
    });

    ws.on('close', () => {
      if (sessionId) {
        removeConnection(sessionId, ws);
      }
    });

    ws.on('error', () => {
      if (sessionId) {
        removeConnection(sessionId, ws);
      }
    });
  });
};

export default terminalRoutes;

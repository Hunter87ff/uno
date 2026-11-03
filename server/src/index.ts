import { cors } from '@elysiajs/cors';
import { existsSync } from 'node:fs';
import { Elysia, t } from 'elysia';
import { CLOSE_FORBIDDEN_ORIGIN, CLOSE_INVALID_SESSION, type ClientMessage, type ServerMessage } from '@uno/shared';
import { RoomError, RoomManager, type Sender } from './rooms';
import { CLIENT_DIST, serveClient } from './static';
import { ClientMessageSchema, CreateRoomBody, JoinRoomBody } from './schemas';

const PORT = Number(process.env.PORT ?? 3001);

/**
 * Origins allowed to call the API from a browser (CORS) and to open the WebSocket.
 * Override with CORS_ORIGINS="https://a.example,https://b.example" in production.
 */
export const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Non-browser clients send no Origin header; those are allowed (the session token still applies).
 * The server's own origin is allowed too, so the bundled client works on any hostname.
 */
export function isOriginAllowed(origin: string | undefined, host?: string): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const rooms = new RoomManager();

/** Maps the raw Bun socket to the Sender the room manager uses, so `close` can find it again. */
const senders = new WeakMap<object, Sender>();

export const app = new Elysia()
  .use(
    cors({
      origin: ALLOWED_ORIGINS,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['content-type'],
    }),
  )
  .onError(({ code, error, set }) => {
    if (error instanceof RoomError) {
      set.status = error.status;
      return { message: error.message };
    }
    if (code === 'VALIDATION' || code === 'PARSE') {
      set.status = 400;
      return { message: 'Invalid request' };
    }
    if (code === 'NOT_FOUND') {
      set.status = 404;
      return { message: 'Not found' };
    }
    console.error(error);
    set.status = 500;
    return { message: 'Internal server error' };
  })
  .get('/api/health', () => ({ ok: true }))
  .post('/api/rooms', ({ body }) => rooms.createRoom(body.name), { body: CreateRoomBody })
  .get('/api/rooms/:code', ({ params }) => rooms.roomExists(params.code), {
    params: t.Object({ code: t.String({ minLength: 1, maxLength: 8 }) }),
  })
  .post('/api/rooms/:code/join', ({ params, body }) => rooms.joinRoom(params.code, body.name), {
    params: t.Object({ code: t.String({ minLength: 1, maxLength: 8 }) }),
    body: JoinRoomBody,
  })
  // Bundled client: anything not matched above is a static file or the SPA entry point.
  .get('/*', ({ request }) => {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    return serveClient(pathname);
  })
  .ws('/ws', {
    query: t.Object({
      room: t.String({ minLength: 1, maxLength: 8 }),
      token: t.String({ minLength: 1, maxLength: 64 }),
    }),
    body: ClientMessageSchema,
    open(ws) {
      const { room, token } = ws.data.query;
      // CORS does not apply to WebSockets, so check the Origin header ourselves.
      const origin = ws.data.headers['origin'];
      if (!isOriginAllowed(origin, ws.data.headers['host'])) {
        ws.close(CLOSE_FORBIDDEN_ORIGIN, 'Origin not allowed');
        return;
      }
      const sender: Sender = {
        send: (message: ServerMessage) => ws.send(message),
        close: (code: number, reason: string) => ws.close(code, reason),
      };
      senders.set(ws.raw as object, sender);
      try {
        rooms.attach(room, token, sender);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not connect';
        ws.send({ type: 'error', message } satisfies ServerMessage);
        ws.close(CLOSE_INVALID_SESSION, message);
      }
    },
    message(ws, message) {
      const { room, token } = ws.data.query;
      const sender = senders.get(ws.raw as object);
      if (!sender) return;
      const playerId = rooms.playerIdFor(room, token);
      if (!playerId) return;
      rooms.handle(room.toUpperCase(), playerId, message as ClientMessage);
    },
    close(ws) {
      const { room, token } = ws.data.query;
      const sender = senders.get(ws.raw as object);
      if (sender) rooms.detach(room.toUpperCase(), token, sender);
    },
  });

if (import.meta.main) {
  // reusePort: false makes a second server on the same port fail loudly instead of silently
  // splitting requests between two in-memory room stores.
  app.listen({ port: PORT, reusePort: false });
  console.log(`UNO server listening on http://localhost:${PORT}`);
  console.log(`  API + WebSocket: /api, /ws   client: ${existsSync(CLIENT_DIST) ? 'bundled from client/dist' : 'not built (bun run build)'}`);
  console.log(`  CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
}

export type App = typeof app;

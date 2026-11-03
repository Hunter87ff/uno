import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { RoomView, ServerMessage } from '@uno/shared';
import { app, rooms } from './index';
import { CLIENT_DIST } from './static';

let base = '';
let wsBase = '';
let server: ReturnType<typeof app.listen>;

beforeAll(() => {
  server = app.listen(0);
  const port = server.server!.port;
  base = `http://localhost:${port}`;
  wsBase = `ws://localhost:${port}`;
});

afterAll(() => {
  server.stop(true);
  rooms.dispose();
});

async function post(path: string, body: unknown) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() as any };
}

/** Opens a socket and collects room snapshots; resolves once a snapshot matching `until` arrives. */
function connect(code: string, token: string) {
  const ws = new WebSocket(`${wsBase}/ws?room=${code}&token=${token}`);
  const inbox: ServerMessage[] = [];
  let waiters: Array<() => void> = [];
  ws.onmessage = (ev) => {
    inbox.push(JSON.parse(String(ev.data)));
    waiters.forEach((w) => w());
    waiters = [];
  };
  const next = (pred: (m: ServerMessage) => boolean, timeoutMs = 3000) =>
    new Promise<ServerMessage>((resolve, reject) => {
      const check = () => {
        const found = inbox.find(pred);
        if (found) return resolve(found);
        waiters.push(check);
      };
      setTimeout(() => reject(new Error('timed out waiting for message')), timeoutMs);
      check();
    });
  const opened = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('ws error'));
  });
  return { ws, next, opened };
}

const roomOf = (m: ServerMessage): RoomView | null => (m.type === 'room' ? m.room : null);

describe('REST', () => {
  test('creates a room and returns a session', async () => {
    const { status, json } = await post('/api/rooms', { name: 'Host' });
    expect(status).toBe(200);
    expect(json.code).toHaveLength(5);
    expect(json.token).toBeTruthy();
  });

  test('rejects duplicate names within a room (case and spacing insensitive)', async () => {
    const room = await post('/api/rooms', { name: 'Alice' });
    const ok = await post(`/api/rooms/${room.json.code}/join`, { name: 'Bob' });
    expect(ok.status).toBe(200);
    const dup = await post(`/api/rooms/${room.json.code}/join`, { name: '  bob ' });
    expect(dup.status).toBe(409);
    expect(dup.json.message).toContain('already taken');
  });

  test('same name is fine in a different room', async () => {
    const a = await post('/api/rooms', { name: 'Shared' });
    const b = await post('/api/rooms', { name: 'Shared' });
    expect(a.json.code).not.toBe(b.json.code);
    expect(b.status).toBe(200);
  });

  test('unknown room returns 404', async () => {
    const res = await fetch(`${base}/api/rooms/ZZZZZ`);
    expect(res.status).toBe(404);
  });

  test('empty name is rejected', async () => {
    const { status } = await post('/api/rooms', { name: '   ' });
    expect(status).toBe(400);
  });
});

describe('WebSocket game flow', () => {
  test('two players connect, host starts, both receive their own hand', async () => {
    const host = await post('/api/rooms', { name: 'Host' });
    const { code } = host.json;
    const guest = await post(`/api/rooms/${code}/join`, { name: 'Guest' });

    const h = connect(code, host.json.token);
    const g = connect(code, guest.json.token);
    await Promise.all([h.opened, g.opened]);

    const lobby = await h.next((m) => roomOf(m)?.players.length === 2 && roomOf(m)!.players.every((p) => p.connected));
    expect(roomOf(lobby)!.status).toBe('lobby');

    h.ws.send(JSON.stringify({ type: 'start', cardsPerPlayer: 7 }));
    const hostView = await h.next((m) => roomOf(m)?.status === 'playing');
    const guestView = await g.next((m) => roomOf(m)?.status === 'playing');

    const hv = roomOf(hostView)!;
    const gv = roomOf(guestView)!;
    expect(hv.round!.hand).toHaveLength(7);
    expect(gv.round!.hand).toHaveLength(7);
    expect(hv.round!.hand.map((c) => c.id)).not.toEqual(gv.round!.hand.map((c) => c.id));
    // Opponent hands are hidden: the guest's view only shows counts for the host.
    expect(JSON.stringify(gv)).not.toContain(JSON.stringify(hv.round!.hand[0]));

    h.ws.close();
    g.ws.close();
  });

  test('host chooses cards per player; invalid counts are refused', async () => {
    const host = await post('/api/rooms', { name: 'Dealer' });
    await post(`/api/rooms/${host.json.code}/join`, { name: 'Pal' });
    const h = connect(host.json.code, host.json.token);
    await h.opened;
    await h.next((m) => roomOf(m) !== null);

    h.ws.send(JSON.stringify({ type: 'start', cardsPerPlayer: 40 }));
    const err = await h.next((m) => m.type === 'error');
    expect((err as any).message).toContain('between 2 and 15');

    h.ws.send(JSON.stringify({ type: 'start', cardsPerPlayer: 4 }));
    const view = await h.next((m) => roomOf(m)?.status === 'playing');
    expect(roomOf(view)!.cardsPerPlayer).toBe(4);
    expect(roomOf(view)!.round!.hand).toHaveLength(4);
    h.ws.close();
  });

  test('only the host can start, and invalid actions produce errors', async () => {
    const host = await post('/api/rooms', { name: 'H' });
    const guest = await post(`/api/rooms/${host.json.code}/join`, { name: 'G' });
    const g = connect(host.json.code, guest.json.token);
    await g.opened;
    await g.next((m) => m.type === 'room');
    g.ws.send(JSON.stringify({ type: 'start', cardsPerPlayer: 7 }));
    const err = await g.next((m) => m.type === 'error');
    expect((err as any).message).toContain('Only the host');
    g.ws.close();
  });

  test('reconnecting with the same token restores the session', async () => {
    const host = await post('/api/rooms', { name: 'Recon' });
    const first = connect(host.json.code, host.json.token);
    await first.opened;
    first.ws.close();
    await Bun.sleep(50);
    const second = connect(host.json.code, host.json.token);
    await second.opened;
    const snap = await second.next((m) => roomOf(m)?.you === host.json.token || roomOf(m) !== null);
    expect(roomOf(snap)!.you).toBe(roomOf(snap)!.hostId);
    second.ws.close();
  });

  test('bad token is refused with a close', async () => {
    const host = await post('/api/rooms', { name: 'X' });
    const ws = new WebSocket(`${wsBase}/ws?room=${host.json.code}&token=nope`);
    const closed = await new Promise<number>((resolve) => {
      ws.onclose = (ev) => resolve(ev.code);
    });
    expect(closed).toBe(4401);
  });
});

describe('CORS and origin checks', () => {
  test('preflight from the client origin is allowed', async () => {
    const res = await fetch(`${base}/api/rooms`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  test('foreign origins do not get CORS headers', async () => {
    const res = await fetch(`${base}/api/rooms`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });

  test('WebSocket from a disallowed origin is refused', async () => {
    const host = await post('/api/rooms', { name: 'Origin' });
    const ws = new WebSocket(`${wsBase}/ws?room=${host.json.code}&token=${host.json.token}`, {
      headers: { origin: 'https://evil.example' },
    } as any);
    const code = await new Promise<number>((resolve) => {
      ws.onclose = (ev) => resolve(ev.code);
    });
    expect(code).toBe(4404);
  });
});

describe('bundled client', () => {
  const built = existsSync(CLIENT_DIST);

  test.skipIf(!built)('serves index.html at / and for client-side routes', async () => {
    const root = await fetch(`${base}/`);
    expect(root.status).toBe(200);
    expect(root.headers.get('content-type')).toContain('text/html');
    expect(await root.text()).toContain('id="root"');

    const deep = await fetch(`${base}/some/client/route`);
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain('id="root"');
  });

  test.skipIf(!built)('serves hashed assets with long-lived caching', async () => {
    const html = await (await fetch(`${base}/`)).text();
    const match = html.match(/src="(\/assets\/[^"]+\.js)"/);
    expect(match).not.toBeNull();
    const asset = await fetch(`${base}${match![1]}`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('cache-control')).toContain('immutable');
  });

  test.skipIf(!built)('does not serve files outside the client build', async () => {
    const res = await fetch(`${base}/%2e%2e/%2e%2e/package.json`);
    const body = await res.text();
    expect(body).not.toContain('"workspaces"');
  });

  test('unknown API paths return JSON 404, not the client', async () => {
    const res = await fetch(`${base}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  test('API routes still win over the client fallback', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('same-origin WebSocket', () => {
  test("accepts the server's own host even when it is not in CORS_ORIGINS", async () => {
    const host = await post('/api/rooms', { name: 'Self' });
    const ws = new WebSocket(`${wsBase}/ws?room=${host.json.code}&token=${host.json.token}`, {
      headers: { origin: `http://localhost:${server.server!.port}` },
    } as any);
    const opened = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onclose = () => resolve(false);
    });
    expect(opened).toBe(true);
    ws.close();
  });
});

import { statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

/** Where `bun run build` writes the client. */
export const CLIENT_DIST = resolve(import.meta.dir, '../../client/dist');

const NOT_BUILT =
  'The client has not been built. Run "bun run build" first, or use "bun run dev" for development.';

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the built client. Real files in `client/dist` are returned as-is; anything else falls back
 * to index.html so client-side URLs keep working. Paths that escape the dist folder are refused.
 */
export async function serveClient(pathname: string): Promise<Response> {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const target = resolve(CLIENT_DIST, rel || 'index.html');
  if (target !== CLIENT_DIST && !target.startsWith(CLIENT_DIST + sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  if (rel && isFile(target)) {
    const immutable = rel.startsWith('assets/'); // Vite file names are content-hashed
    return new Response(Bun.file(target), {
      headers: {
        'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    });
  }

  const index = resolve(CLIENT_DIST, 'index.html');
  if (!isFile(index)) return new Response(NOT_BUILT, { status: 503 });
  return new Response(Bun.file(index), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
  });
}

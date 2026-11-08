/**
 * Where the UNO API server lives.
 *
 * - Production build (`bun run build` / `bun run start`): the Elysia server serves this client, so
 *   the API is on the same origin and SERVER_URL is '' (relative URLs).
 * - Development (`bun run dev`): Vite runs on :3000 and the API on :3001, so the browser calls it
 *   directly and the server's CORS_ORIGINS must include http://localhost:3000.
 *
 * Set VITE_SERVER_URL in client/.env to point somewhere else.
 */
const DEV_SERVER_URL = "http://localhost:3001";

export const SERVER_URL: string =
	import.meta.env.VITE_SERVER_URL ?? (import.meta.env.DEV ? DEV_SERVER_URL : "");

/**
 * WebSocket base: derived from SERVER_URL, or from the page's own origin when SERVER_URL is
 * relative.
 */
export const WS_URL: string = SERVER_URL
	? SERVER_URL.replace(/^http/, "ws")
	: `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

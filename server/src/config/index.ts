import { resolve } from "node:path";

export interface ServerConfig {
  port: number;
  allowedOrigins: string[];
  clientDist: string;
  autoPlayDelayMs: number;
  roomIdleMs: number;
  codeAlphabet: string;
}

const PORT = Number(process.env.PORT ?? 3001);

/**
 * Origins allowed to call the API from a browser (CORS) and to open the WebSocket.
 * Override with CORS_ORIGINS="https://a.example,https://b.example" in production.
 */
const ALLOWED_ORIGINS = (
  process.env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

/** Where `bun run build` writes the client. */
const CLIENT_DIST = resolve(import.meta.dir, "../../client/dist");

/** How long a disconnected player may hold up their turn before the server plays for them. */
const AUTO_PLAY_DELAY_MS = 20_000;

/** Empty rooms are forgotten after this much inactivity. */
const ROOM_IDLE_MS = 15 * 60_000;

/** Room code generation alphabet (no look-alikes like I, O, 0, 1). */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const config: ServerConfig = Object.freeze({
  port: PORT,
  allowedOrigins: ALLOWED_ORIGINS,
  clientDist: CLIENT_DIST,
  autoPlayDelayMs: AUTO_PLAY_DELAY_MS,
  roomIdleMs: ROOM_IDLE_MS,
  codeAlphabet: CODE_ALPHABET,
});

// Backward compatibility exports
export {
  PORT,
  ALLOWED_ORIGINS,
  CLIENT_DIST,
  AUTO_PLAY_DELAY_MS,
  ROOM_IDLE_MS,
  CODE_ALPHABET,
};

/**
 * Non-browser clients send no Origin header; those are allowed (the session token still applies).
 * The server's own origin is allowed too, so the bundled client works on any hostname.
 */
export function isOriginAllowed(
  origin: string | undefined,
  host?: string,
): boolean {
  if (!origin) return true;
  if (config.allowedOrigins.includes(origin)) return true;
  try {
    return host !== undefined && new URL(origin).host === host;
  } catch {
    return false;
  }
}


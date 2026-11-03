import type { Session } from '@uno/shared';

/**
 * The session (room code, player id, secret token) lives in sessionStorage so a page refresh
 * reconnects to the same seat, while a new tab starts fresh.
 */
const KEY = 'uno.session';
const NAME_KEY = 'uno.name';

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
  else sessionStorage.removeItem(KEY);
}

export function loadName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

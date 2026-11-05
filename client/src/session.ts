import type { Session } from '@uno/shared';
import { StorageKey } from './sound/sfx';

/**
 * The session (room code, player id, secret token) lives in sessionStorage so a page refresh
 * reconnects to the same seat, while a new tab starts fresh.
 */

export function loadSession(): Session | null {
    try {
        const raw = sessionStorage.getItem(StorageKey.Session);
        return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
        return null;
    }
}

export function saveSession(session: Session | null): void {
    if (session) sessionStorage.setItem(StorageKey.Session, JSON.stringify(session));
    else sessionStorage.removeItem(StorageKey.Session);
}

export function loadName(): string {
    return localStorage.getItem(StorageKey.Name) ?? '';
}

export function saveName(name: string): void {
    localStorage.setItem(StorageKey.Name, name);
}

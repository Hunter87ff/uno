import type { Session } from '@uno/shared';
import { SERVER_URL } from './config';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new ApiError(res.status, data.message ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  createRoom: (name: string) => request<Session>('/api/rooms', { name }),
  joinRoom: (code: string, name: string) =>
    request<Session>(`/api/rooms/${encodeURIComponent(code)}/join`, { name }),
  roomInfo: (code: string) =>
    request<{ code: string; status: string; playerCount: number }>(`/api/rooms/${encodeURIComponent(code)}`),
};

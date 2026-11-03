import { type Session, NAME_MAX_LENGTH, ROOM_CODE_LENGTH } from '@uno/shared';
import { type FormEvent, useState } from 'react';
import { api, ApiError } from '../api';
import { loadName, saveName } from '../session';
import { Button, Input, Logo, Panel } from './ui';

interface HomeProps {
  onSession: (session: Session) => void;
  notice: string | null;
}

export function Home({ onSession, notice }: HomeProps) {
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState((params.get('room') ?? '').toUpperCase().slice(0, ROOM_CODE_LENGTH));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const nameOk = trimmedName.length > 0 && trimmedName.length <= NAME_MAX_LENGTH;

  async function run(action: () => Promise<Session>) {
    setBusy(true);
    setError(null);
    try {
      const session = await action();
      saveName(trimmedName);
      history.replaceState(null, '', '/');
      onSession(session);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!nameOk || busy) return;
    void run(() => api.createRoom(trimmedName));
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    if (!nameOk || busy || code.length !== ROOM_CODE_LENGTH) return;
    void run(() => api.joinRoom(code, trimmedName));
  };

  return (
    <div className="app-bg flex min-h-full flex-col items-center justify-center gap-8 p-6">
      <Logo />
      <p className="max-w-md text-center text-white/70">
        Play UNO with friends in your browser. No accounts. Create a room, share the code, and go.
      </p>

      <Panel className="w-full max-w-md">
        <label className="mb-2 block text-sm font-semibold text-white/80" htmlFor="name">
          Your name
        </label>
        <Input
          id="name"
          value={name}
          maxLength={NAME_MAX_LENGTH * 2}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alex"
          autoComplete="nickname"
          autoFocus={!name}
        />
        <p className="mt-2 text-xs text-white/50">Names must be unique within a room.</p>
      </Panel>

      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <Panel>
          <h2 className="mb-1 text-xl font-bold">Create a room</h2>
          <p className="mb-4 text-sm text-white/60">You become the host and can tune the house rules.</p>
          <form onSubmit={create}>
            <Button type="submit" variant="primary" className="w-full" disabled={!nameOk || busy}>
              Create room
            </Button>
          </form>
        </Panel>

        <Panel>
          <h2 className="mb-1 text-xl font-bold">Join a room</h2>
          <p className="mb-4 text-sm text-white/60">Enter the code your host shared with you.</p>
          <form onSubmit={join} className="flex flex-col gap-3">
            <Input
              aria-label="Room code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH))}
              placeholder="ROOM CODE"
              className="text-center font-mono text-lg tracking-[0.3em]"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" variant="warning" disabled={!nameOk || busy || code.length !== ROOM_CODE_LENGTH}>
              Join room
            </Button>
          </form>
        </Panel>
      </div>

      {(error || notice) && (
        <p role="alert" className="max-w-md rounded-xl bg-rose-500/15 px-4 py-2 text-center text-sm text-rose-200 ring-1 ring-rose-400/30">
          {error ?? notice}
        </p>
      )}
    </div>
  );
}

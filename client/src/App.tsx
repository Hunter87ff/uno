import type { Session } from '@uno/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './components/Game';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { Button, Toast } from './components/ui';
import { loadSession, saveSession } from './session';
import { play } from './sound/sfx';
import { SoundToggle } from './sound/SoundToggle';
import { useGameSounds } from './sound/useGameSounds';
import { useRoomSocket } from './useRoomSocket';

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const endSession = useCallback((reason: string | null) => {
    saveSession(null);
    setSession(null);
    setNotice(reason);
  }, []);

  const startSession = useCallback((next: Session) => {
    saveSession(next);
    setNotice(null);
    setSession(next);
  }, []);

  const { room, connected, send } = useRoomSocket(session, {
    onInvalid: (reason) => endSession(reason),
    onError: (message) => {
      showToast(message);
      play('error');
    },
  });
  useGameSounds(room);

  if (!session) {
    return (
      <>
        <Home onSession={startSession} notice={notice} />
        <Toast message={toast} onDismiss={() => setToast(null)} />
        <SoundToggle />
      </>
    );
  }

  if (!room) {
    return (
      <div className="app-bg flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg text-white/80">Connecting to room {session.code}…</p>
        <Button variant="ghost" onClick={() => endSession(null)}>
          Back to home
        </Button>
        <Toast message={toast} onDismiss={() => setToast(null)} />
        <SoundToggle />
      </div>
    );
  }

  const leaveRoom = () => {
    send({ type: 'leave' });
    endSession(null);
  };

  return (
    <>
      {room.status === 'lobby' ? (
        <Lobby room={room} connected={connected} send={send} onLeave={leaveRoom} />
      ) : (
        <Game room={room} connected={connected} send={send} onLeaveTable={leaveRoom} />
      )}
      <Toast message={toast} onDismiss={() => setToast(null)} />
      <SoundToggle />
    </>
  );
}

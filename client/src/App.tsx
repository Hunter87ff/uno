import { ClientMessageType, RoomStatus, SfxType, type Session } from '@uno/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Game } from './components/Game';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import type { LayoutMode } from './components/RoomSettingsModal';
import { Button, Toast } from './components/ui';
import { loadSession, saveSession } from './session';
import { SoundToggle } from './sound/SoundToggle';
import { soundsForUpdate } from './sound/events';
import { play } from './sound/sfx';
import { useRoomSocket } from './useRoomSocket';

export default function App() {
    const [session, setSession] = useState<Session | null>(() => loadSession());
    const [notice, setNotice] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
        if (typeof localStorage !== 'undefined') {
            const saved = localStorage.getItem('uno.layout');
            if (saved === 'vertical' || saved === 'horizontal') return saved;
        }
        return 'horizontal';
    });
    const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const changeLayoutMode = useCallback((mode: LayoutMode) => {
        setLayoutMode(mode);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('uno.layout', mode);
        }
    }, []);

    const showError = useCallback((msg: string) => {
        setErrorMessage(msg);
        clearTimeout(errorTimer.current);
        errorTimer.current = setTimeout(() => setErrorMessage(null), 3500);
    }, []);

    useEffect(() => () => clearTimeout(errorTimer.current), []);

    const endSession = useCallback((reason: string | null) => {
        saveSession(null);
        setSession(null);
        setNotice(reason);
    }, []);

    const startSession = useCallback((s: Session) => {
        saveSession(s);
        setNotice(null);
        setSession(s);
    }, []);

    const { room, connected, send } = useRoomSocket(session, {
        onInvalid: (reason) => endSession(reason),
        onError: (err) => {
            showError(err);
            play(SfxType.Error);
        },
    });

    // Sound cues driven by diffing successive room snapshots.
    useAudioEvents(room);

    if (!session) {
        return (
            <>
                <Home onSession={startSession} notice={notice} />
                <Toast message={errorMessage} onDismiss={() => setErrorMessage(null)} />
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
                <Toast message={errorMessage} onDismiss={() => setErrorMessage(null)} />
                <SoundToggle />
            </div>
        );
    }

    const leave = () => {
        send({ type: ClientMessageType.Leave });
        endSession(null);
    };

    return (
        <>
            {room.status === RoomStatus.Lobby ? (
                <Lobby
                    room={room}
                    connected={connected}
                    send={send}
                    onLeave={leave}
                    layoutMode={layoutMode}
                    onChangeLayoutMode={changeLayoutMode}
                />
            ) : (
                <Game
                    room={room}
                    connected={connected}
                    send={send}
                    onLeaveTable={leave}
                    layoutMode={layoutMode}
                    onChangeLayoutMode={changeLayoutMode}
                />
            )}
            <Toast message={errorMessage} onDismiss={() => setErrorMessage(null)} />
            <SoundToggle />
        </>
    );
}

function useAudioEvents(room: Parameters<typeof soundsForUpdate>[1] | null) {
    const previous = useRef<typeof room>(null);
    useEffect(() => {
        const prev = previous.current;
        previous.current = room;
        if (!room || !prev) return;
        const cues = soundsForUpdate(prev, room);
        for (const cue of cues) play(cue);
    }, [room]);
}

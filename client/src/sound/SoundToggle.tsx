import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMute } from './sfx';

/** Small floating button that mutes or unmutes all sound effects. */
export function SoundToggle() {
  const muted = useSyncExternalStore(subscribeMute, isMuted, () => false);
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      aria-pressed={!muted}
      title={muted ? 'Sound off' : 'Sound on'}
      className="glass fixed bottom-4 left-4 z-30 flex size-10 items-center justify-center rounded-full text-lg transition hover:scale-105"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

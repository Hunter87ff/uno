import unoVoiceUrl from './uno.wav?url';

/**
 * Synthesised sound effects built with the Web Audio API. No audio files are shipped, so there
 * are no licensing concerns and nothing extra to download.
 */

export type Sfx =
  | 'play'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4'
  | 'draw'
  | 'shuffle'
  | 'turn'
  | 'uno'
  | 'catch'
  | 'challenge'
  | 'roundWin'
  | 'gameWin'
  | 'join'
  | 'error';

const MUTE_KEY = 'uno.sound';
const listeners = new Set<() => void>();

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === 'off';

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// The recorded "UNO!" call, decoded once and reused.
let voiceBuffer: AudioBuffer | null = null;
let voiceLoading: Promise<void> | null = null;

function loadVoice(): Promise<void> {
  if (voiceLoading) return voiceLoading;
  const c = audioContext();
  if (!c) return Promise.resolve();
  voiceLoading = fetch(unoVoiceUrl)
    .then((res) => res.arrayBuffer())
    .then((bytes) => c.decodeAudioData(bytes))
    .then((buffer) => {
      voiceBuffer = buffer;
    })
    .catch(() => {
      voiceLoading = null; // allow a retry on the next press
    });
  return voiceLoading;
}

function playVoice(): void {
  const c = audioContext();
  if (!c || !master) return;
  if (!voiceBuffer) {
    void loadVoice().then(() => {
      if (voiceBuffer) startVoice();
    });
    return;
  }
  startVoice();
}

function startVoice(): void {
  const c = audioContext();
  if (!c || !master || !voiceBuffer) return;
  const src = c.createBufferSource();
  src.buffer = voiceBuffer;
  src.connect(master);
  src.start();
}

// Browsers only allow audio after a user gesture, so create the context on the first click or key.
if (typeof window !== 'undefined') {
  const unlock = () => {
    audioContext();
    void loadVoice();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? 'off' : 'on');
  } catch {
    // Storage may be unavailable; the setting still applies for this page.
  }
  listeners.forEach((l) => l());
}

export function subscribeMute(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* ------------------------------ Primitives ------------------------------- */

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  slideTo?: number;
  attack?: number;
}

function tone(freq: number, at: number, dur: number, opts: ToneOpts = {}): void {
  const c = audioContext();
  if (!c || !master) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
  const vol = opts.vol ?? 0.5;
  const attack = opts.attack ?? 0.01;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

interface NoiseOpts {
  from: number;
  to: number;
  vol?: number;
  q?: number;
}

/** Filtered noise with a sweeping band-pass: whooshes, swishes and card slaps. */
function noise(at: number, dur: number, opts: NoiseOpts): void {
  const c = audioContext();
  if (!c || !master) return;
  const t = c.currentTime + at;
  const length = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = opts.q ?? 1.2;
  filter.frequency.setValueAtTime(opts.from, t);
  filter.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const gain = c.createGain();
  const vol = opts.vol ?? 0.6;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

/* -------------------------------- Sounds --------------------------------- */

const SOUNDS: Record<Sfx, () => void> = {
  // Card slapped down: short swish plus a soft thud.
  play: () => {
    noise(0, 0.14, { from: 2200, to: 500, vol: 0.5, q: 0.9 });
    tone(160, 0.02, 0.12, { type: 'triangle', vol: 0.35, slideTo: 90 });
  },
  // Skip: a bonk.
  skip: () => {
    tone(520, 0, 0.16, { type: 'square', vol: 0.18, slideTo: 220 });
    tone(260, 0.1, 0.12, { type: 'triangle', vol: 0.3 });
  },
  // Reverse: a whoosh that doubles back.
  reverse: () => {
    noise(0, 0.35, { from: 400, to: 2600, vol: 0.45, q: 1.5 });
    noise(0.3, 0.3, { from: 2600, to: 400, vol: 0.4, q: 1.5 });
  },
  // Draw Two: swish with a rising two-note alarm.
  draw2: () => {
    noise(0, 0.12, { from: 1800, to: 600, vol: 0.45 });
    tone(660, 0.12, 0.14, { type: 'square', vol: 0.14 });
    tone(880, 0.24, 0.2, { type: 'square', vol: 0.14 });
  },
  // Wild: magic arpeggio.
  wild: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.07, 0.3, { type: 'sine', vol: 0.3 }));
    noise(0, 0.2, { from: 800, to: 4000, vol: 0.15, q: 3 });
  },
  // Wild Draw Four: ominous descending sting.
  wild4: () => {
    tone(330, 0, 0.35, { type: 'sawtooth', vol: 0.16, slideTo: 220 });
    tone(247, 0.3, 0.45, { type: 'sawtooth', vol: 0.18, slideTo: 165 });
    noise(0, 0.5, { from: 300, to: 1200, vol: 0.2, q: 2 });
  },
  // Drawing a card: a quick flick.
  draw: () => {
    noise(0, 0.08, { from: 2400, to: 900, vol: 0.35, q: 1.1 });
  },
  // Shuffle: a flurry of card ticks.
  shuffle: () => {
    for (let i = 0; i < 10; i++) {
      noise(i * 0.045 + Math.random() * 0.02, 0.05, { from: 1500 + Math.random() * 2000, to: 800, vol: 0.3, q: 1.4 });
    }
  },
  // Your turn: a gentle two-note ding.
  turn: () => {
    tone(880, 0, 0.35, { type: 'sine', vol: 0.25 });
    tone(1320, 0.09, 0.45, { type: 'sine', vol: 0.2 });
  },
  // Someone pressed UNO: the recorded call.
  uno: () => playVoice(),
  // Caught without UNO: buzzer.
  catch: () => {
    tone(150, 0, 0.35, { type: 'square', vol: 0.2, slideTo: 90 });
    tone(140, 0.36, 0.25, { type: 'square', vol: 0.18 });
  },
  // Challenge: rising tension.
  challenge: () => {
    tone(110, 0, 0.7, { type: 'sawtooth', vol: 0.14, slideTo: 260 });
    noise(0.5, 0.25, { from: 600, to: 2400, vol: 0.2, q: 2 });
  },
  // Round won: bright chord.
  roundWin: () => {
    [523, 659, 784].forEach((f) => tone(f, 0, 0.9, { type: 'triangle', vol: 0.22 }));
    [784, 988, 1175].forEach((f, i) => tone(f, 0.18 + i * 0.08, 0.7, { type: 'triangle', vol: 0.18 }));
  },
  // Game won: longer triumphant fanfare.
  gameWin: () => {
    const melody = [523, 523, 523, 659, 784, 659, 784, 1046];
    melody.forEach((f, i) => tone(f, i * 0.13, 0.25, { type: 'square', vol: 0.12 }));
    [262, 392, 523].forEach((f) => tone(f, 1.1, 1.2, { type: 'triangle', vol: 0.25 }));
    noise(1.1, 0.6, { from: 1000, to: 5000, vol: 0.12, q: 2 });
  },
  // Someone joined the room.
  join: () => {
    tone(660, 0, 0.12, { type: 'sine', vol: 0.22 });
    tone(990, 0.08, 0.18, { type: 'sine', vol: 0.2 });
  },
  // Rejected action or error.
  error: () => {
    tone(180, 0, 0.14, { type: 'square', vol: 0.1 });
  },
};

export function play(sound: Sfx): void {
  if (muted) return;
  try {
    SOUNDS[sound]();
  } catch {
    // Audio is decorative; never let it break the game.
  }
}

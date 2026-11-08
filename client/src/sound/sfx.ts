import { SfxType } from "@uno/shared";

import unoVoiceUrl from "./uno.wav?url";

/**
 * Synthesised sound effects built with the Web Audio API. No audio files are shipped, so there are
 * no licensing concerns and nothing extra to download.
 */
export const Sfx = SfxType;
export type Sfx = SfxType;

export enum StorageKey {
	Mute = "uno.sound",
	Session = "uno.session",
	Name = "uno.name",
}

const listeners = new Set<() => void>();

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = typeof localStorage !== "undefined" && localStorage.getItem(StorageKey.Mute) === "off";

function audioContext(): AudioContext | null {
	if (typeof window === "undefined") return null;
	if (!ctx) {
		const AC =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AC) return null;
		ctx = new AC();
		master = ctx.createGain();
		master.gain.value = 0.3;
		master.connect(ctx.destination);
	}
	if (ctx.state === "suspended") void ctx.resume();
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
if (typeof window !== "undefined") {
	const unlock = () => {
		audioContext();
		void loadVoice();
	};
	window.addEventListener("pointerdown", unlock, { passive: true });
	window.addEventListener("keydown", unlock);
}

export function isMuted(): boolean {
	return muted;
}

export function setMuted(value: boolean): void {
	muted = value;
	try {
		localStorage.setItem(StorageKey.Mute, value ? "off" : "on");
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
	osc.type = opts.type ?? "sine";
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
	filter.type = "bandpass";
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

/**
 * Bell-like tone: a sine fundamental plus an inharmonic partial that decays fast, which gives the
 * metallic "ping" that plain sine waves lack.
 */
function bell(freq: number, at: number, vol = 0.25, dur = 0.8): void {
	tone(freq, at, dur, { type: "sine", vol });
	tone(freq * 2.76, at, dur * 0.35, { type: "sine", vol: vol * 0.35 });
}

/** Two slightly detuned oscillators: a fatter, chorused sound. */
function chorus(
	freq: number,
	at: number,
	dur: number,
	vol: number,
	type: OscillatorType = "triangle",
): void {
	tone(freq * 0.995, at, dur, { type, vol: vol * 0.6 });
	tone(freq * 1.005, at, dur, { type, vol: vol * 0.6 });
}

const SOUNDS: Record<SfxType, () => void> = {
	// Card slapped down: a sharp click, a swish, then a pitched thud.
	[SfxType.Play]: () => {
		noise(0, 0.03, { from: 4000, to: 2000, vol: 0.4, q: 0.7 });
		noise(0.01, 0.14, { from: 2200, to: 500, vol: 0.5, q: 0.9 });
		tone(180, 0.03, 0.14, { type: "triangle", vol: 0.4, slideTo: 70 });
	},
	// Skip: a cartoony bonk with a bouncy follow-up.
	[SfxType.Skip]: () => {
		tone(620, 0, 0.14, { type: "square", vol: 0.16, slideTo: 180 });
		tone(330, 0.09, 0.1, { type: "triangle", vol: 0.3, slideTo: 260 });
		tone(520, 0.18, 0.12, { type: "triangle", vol: 0.18 });
	},
	// Reverse: a whoosh that doubles back, with a rising shimmer.
	[SfxType.Reverse]: () => {
		noise(0, 0.35, { from: 400, to: 2600, vol: 0.5, q: 1.5 });
		noise(0.3, 0.3, { from: 2600, to: 400, vol: 0.45, q: 1.5 });
		tone(300, 0, 0.6, { type: "sine", vol: 0.08, slideTo: 900 });
		bell(1320, 0.55, 0.14, 0.4);
	},
	// Draw Two: swish with a rising two-note alarm and a bell accent.
	[SfxType.Draw2]: () => {
		noise(0, 0.12, { from: 1800, to: 600, vol: 0.5 });
		tone(660, 0.12, 0.14, { type: "square", vol: 0.14 });
		tone(880, 0.24, 0.2, { type: "square", vol: 0.14 });
		bell(1760, 0.3, 0.16, 0.5);
	},
	// Wild: a sparkling arpeggio with a chorused body.
	[SfxType.Wild]: () => {
		[523, 659, 784, 1046].forEach((f, i) => {
			chorus(f, i * 0.07, 0.35, 0.3);
			bell(f * 2, i * 0.07, 0.08, 0.3);
		});
		noise(0, 0.25, { from: 800, to: 5000, vol: 0.18, q: 3 });
	},
	// Wild Draw Four: ominous descending sting with a heavy hit.
	[SfxType.Wild4]: () => {
		tone(330, 0, 0.35, { type: "sawtooth", vol: 0.16, slideTo: 220 });
		tone(247, 0.3, 0.45, { type: "sawtooth", vol: 0.18, slideTo: 130 });
		tone(60, 0.3, 0.4, { type: "sine", vol: 0.5, slideTo: 35 });
		noise(0, 0.5, { from: 300, to: 1200, vol: 0.22, q: 2 });
	},
	// Drawing a card: a quick flick with a tiny tick at the end.
	[SfxType.Draw]: () => {
		noise(0, 0.08, { from: 2400, to: 900, vol: 0.4, q: 1.1 });
		noise(0.07, 0.02, { from: 3500, to: 3000, vol: 0.2, q: 2 });
	},
	// Shuffle: a flurry of card ticks that thins out.
	[SfxType.Shuffle]: () => {
		for (let i = 0; i < 12; i++) {
			const vol = 0.3 * (1 - i / 16);
			noise(i * 0.042 + Math.random() * 0.015, 0.05, {
				from: 1500 + Math.random() * 2400,
				to: 800,
				vol,
				q: 1.4,
			});
		}
	},
	// Your turn: a bright, bell-like rising ding.
	[SfxType.Turn]: () => {
		bell(880, 0, 0.28, 0.5);
		bell(1320, 0.1, 0.25, 0.7);
	},
	// Someone pressed UNO: the recorded call.
	[SfxType.Uno]: () => playVoice(),
	// Caught without UNO: a harsh buzzer.
	[SfxType.Catch]: () => {
		tone(150, 0, 0.35, { type: "square", vol: 0.2, slideTo: 90 });
		tone(140, 0.36, 0.25, { type: "square", vol: 0.18 });
		noise(0, 0.5, { from: 500, to: 1500, vol: 0.12, q: 4 });
	},
	// Round won: a bright chord that arpeggiates up with sparkle.
	[SfxType.RoundWin]: () => {
		[523, 659, 784].forEach((f) => chorus(f, 0, 0.9, 0.22));
		[784, 988, 1175, 1568].forEach((f, i) => {
			bell(f, 0.18 + i * 0.08, 0.2, 0.7);
		});
		noise(0.15, 0.4, { from: 2000, to: 7000, vol: 0.08, q: 2 });
	},
	// Game won: a triumphant fanfare with a shimmering finish.
	[SfxType.GameWin]: () => {
		const melody = [523, 523, 523, 659, 784, 659, 784, 1046];
		melody.forEach((f, i) => tone(f, i * 0.13, 0.25, { type: "square", vol: 0.12 }));
		[262, 392, 523].forEach((f) => chorus(f, 1.1, 1.2, 0.25));
		[1046, 1318, 1568, 2093].forEach((f, i) => bell(f, 1.1 + i * 0.06, 0.14, 1.2));
		noise(1.1, 0.6, { from: 1000, to: 6000, vol: 0.14, q: 2 });
	},
	// Someone joined the room: a quick rising pair of chimes.
	[SfxType.Join]: () => {
		bell(660, 0, 0.22, 0.4);
		bell(990, 0.08, 0.2, 0.5);
	},
	// Rejected action or error: a short, dull double buzz.
	[SfxType.Error]: () => {
		tone(180, 0, 0.12, { type: "square", vol: 0.1, slideTo: 140 });
		tone(150, 0.14, 0.14, { type: "square", vol: 0.1, slideTo: 110 });
	},
	// Double Trouble: twin ascending punchy tones
	[SfxType.DoubleTrouble]: () => {
		bell(587, 0, 0.18, 0.5);
		bell(880, 0.12, 0.22, 0.6);
		noise(0, 0.2, { from: 1000, to: 3000, vol: 0.2, q: 2 });
	},
	// Swap Hands: sweeping stereo-like whoosh
	[SfxType.SwapHands]: () => {
		noise(0, 0.35, { from: 500, to: 3000, vol: 0.45, q: 1.5 });
		noise(0.25, 0.35, { from: 3000, to: 500, vol: 0.4, q: 1.5 });
		chorus(440, 0.1, 0.5, 0.2);
	},
	// Snatch: swift grab swish and steal pop
	[SfxType.Snatch]: () => {
		noise(0, 0.1, { from: 2800, to: 700, vol: 0.5, q: 2 });
		bell(1175, 0.08, 0.2, 0.6);
	},
	// Shield: protective crystal chime
	[SfxType.Shield]: () => {
		bell(1046, 0, 0.4, 0.8);
		bell(1568, 0.05, 0.5, 0.9);
		chorus(523, 0, 0.6, 0.25);
	},
	// Eliminated: dark low drop gong
	[SfxType.Eliminated]: () => {
		tone(130, 0, 0.6, { type: "sawtooth", vol: 0.25, slideTo: 55 });
		noise(0, 0.4, { from: 400, to: 100, vol: 0.35, q: 1 });
	},
};

export function play(sound: SfxType): void {
	if (muted) return;
	try {
		SOUNDS[sound]();
	} catch {
		// Audio is decorative; never let it break the game.
	}
}

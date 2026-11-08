import {
	DEFAULT_RULES,
	type GameState,
	NAME_MAX_LENGTH,
	ROOM_CODE_LENGTH,
	type Rules,
	type ServerMessage,
} from "@uno/shared";

import { config } from "../config";

/** Anything that can receive server messages (a WebSocket in production, a stub in tests). */
export interface Sender {
	send(message: ServerMessage): unknown;
	close?(code: number, reason: string): unknown;
}

export class RoomError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
		this.name = "RoomError";
	}
}

export interface PlayerRecord {
	id: string;
	name: string;
	token: string;
	score: number;
	socket: Sender | null;
}

export interface Room {
	code: string;
	hostId: string;
	rules: Rules;
	cardsPerPlayer: number;
	players: PlayerRecord[];
	game: GameState | null;
	lastRoundPoints: number | null;
	gameWinnerId: string | null;
	lastActive: number;
	autoTimer: ReturnType<typeof setTimeout> | null;
	turnTimerId: ReturnType<typeof setTimeout> | null;
	turnDeadline: number | null;
}

/** Normalises a display name for uniqueness checks (" Ann " and "ann" collide). */
export function normalizeName(name: string): string {
	return name.trim().replace(/\s+/g, " ");
}

export function validateName(raw: string): string {
	const name = normalizeName(raw);
	if (name.length < 1) throw new RoomError(400, "Name is required");
	if (name.length > NAME_MAX_LENGTH)
		throw new RoomError(400, `Name must be ${NAME_MAX_LENGTH} characters or fewer`);
	if (/[\u0000-\u001f]/.test(name)) throw new RoomError(400, "Name contains invalid characters");
	return name;
}

export function randomCode(): string {
	let code = "";
	for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
		code += config.codeAlphabet[Math.floor(Math.random() * config.codeAlphabet.length)];
	}
	return code;
}

export function normalizeRules(input: Partial<Rules>): Rules {
	const targetScore = Math.round(Number(input.targetScore ?? DEFAULT_RULES.targetScore));
	if (!Number.isFinite(targetScore) || targetScore < 100 || targetScore > 5000) {
		throw new RoomError(400, "Target score must be between 100 and 5000");
	}

	let turnTimer = DEFAULT_RULES.turnTimer;
	if (input.turnTimer !== undefined) {
		const parsedTimer = Math.round(Number(input.turnTimer));
		if (!Number.isFinite(parsedTimer) || parsedTimer < 0 || parsedTimer > 300) {
			throw new RoomError(400, "Turn timer must be between 0 and 300 seconds");
		}
		turnTimer = parsedTimer;
	}

	let eliminationLimit: number | null = null;
	if (input.eliminationLimit !== undefined && input.eliminationLimit !== null) {
		const parsedElim = Math.round(Number(input.eliminationLimit));
		if (!Number.isFinite(parsedElim) || parsedElim < 5 || parsedElim > 50) {
			throw new RoomError(400, "Elimination limit must be between 5 and 50 cards");
		}
		eliminationLimit = parsedElim;
	}

	const customCards = {
		doubleTrouble: input.cards?.doubleTrouble ?? DEFAULT_RULES.cards.doubleTrouble,
		swapHands: input.cards?.swapHands ?? DEFAULT_RULES.cards.swapHands,
		snatch: input.cards?.snatch ?? DEFAULT_RULES.cards.snatch,
		shield: input.cards?.shield ?? DEFAULT_RULES.cards.shield,
		wild6: input.cards?.wild6 ?? DEFAULT_RULES.cards.wild6,
		wild10: input.cards?.wild10 ?? DEFAULT_RULES.cards.wild10,
	};

	return {
		stacking: Boolean(input.stacking),
		targetScore,
		turnTimer,
		eliminationLimit,
		cards: customCards,
	};
}

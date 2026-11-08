import {
	buildDeck,
	type Card,
	cardPoints,
	CardType,
	changesColor,
	Color,
	COLORS,
	type CustomCardSettings,
	DEFAULT_CUSTOM_CARDS,
	isWild,
	keepsCurrentColor,
	shuffle,
	SpecialColor,
} from "./cards";
import { ActionType } from "./types";

export { ActionType };

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export interface Rules {
	/**
	 * House rule: a plus card may be answered with another same or higher number plus card (+2, +4,
	 * +6, +10).
	 */
	stacking: boolean;
	/** Game ends when a player reaches this score. */
	targetScore: number;
	/** Turn timer in seconds. 0 means disabled. Default is 30. */
	turnTimer: number;
	/** Max cards a player can hold. If exceeded, player is eliminated. null means disabled. */
	eliminationLimit: number | null;
	/** Custom card expansion settings. */
	cards: CustomCardSettings;
}

/** Limits for the host's "cards per player" choice made before dealing. */
export const CARDS_PER_PLAYER = { min: 2, max: 15, default: 7 } as const;

export const DEFAULT_RULES: Rules = {
	stacking: false,
	targetScore: 500,
	turnTimer: 30,
	eliminationLimit: null,
	cards: { ...DEFAULT_CUSTOM_CARDS },
};

export interface GameState {
	rules: Rules;
	/** Active player ids in seat order. */
	order: string[];
	/** Player ids who were eliminated in this round. */
	eliminated: string[];
	names: Record<string, string>;
	hands: Record<string, Card[]>;
	/** Top of the draw pile is the LAST element. */
	drawPile: Card[];
	/** Top of the discard pile is the LAST element. */
	discardPile: Card[];
	currentIndex: number;
	direction: 1 | -1;
	activeColor: Color;
	/** Cards the current player must draw (and then loses their turn). */
	pendingDraw: number;
	/** Id of the card the current player drew this turn, if any. */
	drawnCardId: string | null;
	/** Number of extra plays remaining for the current player this turn (from Double Trouble). */
	extraPlays: number;
	/** Map of player ids with an active shield buff. */
	shielded: Record<string, boolean>;
	/** Player who went down to one card without calling UNO; catchable until the next action. */
	unoAlert: string | null;
	/** Number of UNO presses this round; clients use it to play the UNO call for everyone. */
	unoCalls: number;
	winnerId: string | null;
	log: string[];
	/** Points accumulated from eliminated players' hands in this round. */
	eliminatedPoints: number;
}

export type Action =
	| { type: ActionType.Play; cardId: string; color?: Color; uno?: boolean; target?: string }
	| { type: ActionType.Draw }
	| { type: ActionType.Pass }
	| { type: ActionType.CatchUno; target: string }
	| { type: ActionType.CallUno }
	| { type: ActionType.PlayShield; cardId: string };

export class GameError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GameError";
	}
}

/* -------------------------------------------------------------------------- */
/*                                 Helpers                                    */
/* -------------------------------------------------------------------------- */

const LOG_LIMIT = 60;

const LABELS: Record<CardType, string> = {
	[CardType.Number]: "",
	[CardType.Skip]: "Skip",
	[CardType.Reverse]: "Reverse",
	[CardType.Draw2]: "Draw Two",
	[CardType.Wild]: "Wild",
	[CardType.Wild4]: "Wild Draw Four",
	[CardType.DoubleTrouble]: "Double Trouble",
	[CardType.SwapHands]: "Swap Hands",
	[CardType.Snatch]: "Snatch",
	[CardType.Shield]: "Shield",
	[CardType.Wild6]: "Wild Draw Six",
	[CardType.Wild10]: "Wild Draw Ten",
};

export function plusValue(card: Card): number | null {
	switch (card.type) {
		case CardType.Draw2:
			return 2;
		case CardType.Wild4:
			return 4;
		case CardType.Wild6:
			return 6;
		case CardType.Wild10:
			return 10;
		default:
			return null;
	}
}

export function describeCard(card: Card, color: Color | SpecialColor.Wild = card.color): string {
	const label = card.type === CardType.Number ? String(card.value) : LABELS[card.type];
	return color === SpecialColor.Wild || keepsCurrentColor(card) ? label : `${color} ${label}`;
}

function mod(n: number, m: number): number {
	return ((n % m) + m) % m;
}

function log(s: GameState, message: string): void {
	s.log.push(message);
	if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

function topCard(s: GameState): Card {
	return s.discardPile[s.discardPile.length - 1]!;
}

function currentPlayer(s: GameState): string {
	return s.order[s.currentIndex]!;
}

function nameOf(s: GameState, pid: string): string {
	return s.names[pid] ?? pid;
}

function passTurn(s: GameState, steps = 1): void {
	if (s.order.length === 0) return;
	s.currentIndex = mod(s.currentIndex + steps * s.direction, s.order.length);
	s.drawnCardId = null;
	s.extraPlays = 0;
}

/** Draws `count` cards for `pid` from the draw pile, recycling the discard pile if needed. */
function drawCards(s: GameState, pid: string, count: number): Card[] {
	const drawn: Card[] = [];
	if (!s.hands[pid]) s.hands[pid] = [];
	for (let i = 0; i < count; i++) {
		if (s.drawPile.length === 0) {
			if (s.discardPile.length <= 1) break; // no cards left to draw
			const top = s.discardPile.pop()!;
			s.drawPile = shuffle(s.discardPile);
			s.discardPile = [top];
		}
		const card = s.drawPile.pop();
		if (card) {
			s.hands[pid]!.push(card);
			drawn.push(card);
		}
	}
	return drawn;
}

/** Checks whether a player exceeded the elimination card limit and handles elimination. */
function checkElimination(s: GameState, pid: string): boolean {
	if (typeof s.rules.eliminationLimit !== "number") return false;
	const hand = s.hands[pid];
	if (!hand || hand.length <= s.rules.eliminationLimit) return false;

	// Track points from the eliminated player's cards so the round winner receives them
	let handPoints = 0;
	for (const card of hand) {
		handPoints += cardPoints(card);
	}
	s.eliminatedPoints = (s.eliminatedPoints ?? 0) + handPoints;

	log(
		s,
		`${nameOf(s, pid)} exceeded the card limit of ${s.rules.eliminationLimit} (${hand.length} cards, ${handPoints} pts) and is eliminated!`,
	);
	s.eliminated.push(pid);
	if (hand.length > 0) {
		s.drawPile.unshift(...hand);
	}
	delete s.hands[pid];
	delete s.shielded[pid];
	if (s.unoAlert === pid) s.unoAlert = null;

	const idx = s.order.indexOf(pid);
	if (idx !== -1) {
		const wasCurrent = s.currentIndex === idx;
		s.order.splice(idx, 1);
		if (s.order.length <= 1) {
			s.winnerId = s.order[0] ?? null;
			if (s.winnerId) {
				log(s, `${nameOf(s, s.winnerId)} is the last survivor and wins the round!`);
			}
			return true;
		}
		if (wasCurrent) {
			s.currentIndex = mod(idx, s.order.length);
			s.drawnCardId = null;
			s.extraPlays = 0;
		} else if (idx < s.currentIndex) {
			s.currentIndex -= 1;
		}
	}
	return true;
}

function checkAllEliminations(s: GameState): void {
	if (typeof s.rules.eliminationLimit !== "number") return;
	const players = [...s.order];
	for (const pid of players) {
		if (checkElimination(s, pid) && s.winnerId) {
			break;
		}
	}
}

/** Pick the color in hand that appears on the most cards. Falls back to red. */
function mostCommonColor(hand: Card[]): Color {
	const counts = new Map<Color, number>(COLORS.map((c) => [c, 0]));
	for (const card of hand) {
		if (card.color !== SpecialColor.Wild)
			counts.set(card.color as Color, (counts.get(card.color as Color) ?? 0) + 1);
	}
	let best: Color = COLORS[0];
	for (const color of COLORS) if (counts.get(color)! > counts.get(best)!) best = color;
	return best;
}

/* -------------------------------------------------------------------------- */
/*                               Round lifecycle                              */
/* -------------------------------------------------------------------------- */

export interface PlayerInfo {
	id: string;
	name: string;
}

/**
 * Initializes a new round: shuffles a fresh deck (including enabled custom cards), deals
 * `cardsPerPlayer` cards, flips the starting card, and applies starting card effects per official
 * rules.
 */
export function startRound(
	players: PlayerInfo[],
	rules: Rules,
	rng: () => number = Math.random,
	cardsPerPlayer: number = CARDS_PER_PLAYER.default,
): GameState {
	const finalRules: Rules = {
		...DEFAULT_RULES,
		...rules,
		cards: { ...DEFAULT_RULES.cards, ...(rules?.cards ?? {}) },
	};
	if (players.length < 2) throw new GameError("At least two players are required");
	const count = Math.floor(cardsPerPlayer);
	if (count < CARDS_PER_PLAYER.min || count > CARDS_PER_PLAYER.max) {
		throw new GameError(
			`Cards per player must be between ${CARDS_PER_PLAYER.min} and ${CARDS_PER_PLAYER.max}`,
		);
	}

	const deck = shuffle(buildDeck(finalRules.cards), rng);
	if (players.length * count + 1 > deck.length) {
		throw new GameError(
			`${players.length} players with ${count} cards each do not fit in the deck (${deck.length} cards)`,
		);
	}

	const hands: Record<string, Card[]> = {};
	const names: Record<string, string> = {};
	for (const p of players) {
		hands[p.id] = deck.splice(deck.length - count, count);
		names[p.id] = p.name;
	}

	// Draw starting card. Per official rules, a Wild Draw Four and special wild expansion cards
	// cannot be the starting card: if drawn, return them to the bottom of the deck and draw another.
	const discard: Card[] = [];
	let start = deck.pop()!;
	while (
		start.type === CardType.Wild4 ||
		start.type === CardType.Wild6 ||
		start.type === CardType.Wild10 ||
		start.type === CardType.SwapHands ||
		start.type === CardType.DoubleTrouble ||
		start.type === CardType.Snatch ||
		start.type === CardType.Shield
	) {
		deck.unshift(start);
		start = deck.pop()!;
	}
	discard.push(start);

	const s: GameState = {
		rules: finalRules,
		order: players.map((p) => p.id),
		eliminated: [],
		names,
		hands,
		drawPile: deck,
		discardPile: discard,
		currentIndex: 0,
		direction: 1,
		activeColor: Color.Red,
		pendingDraw: 0,
		drawnCardId: null,
		extraPlays: 0,
		shielded: {},
		unoAlert: null,
		unoCalls: 0,
		winnerId: null,
		log: [],
		eliminatedPoints: 0,
	};

	// If the starter is a wild card, pick a random starting color.
	s.activeColor =
		start.color === SpecialColor.Wild
			? COLORS[Math.floor(rng() * COLORS.length)]!
			: (start.color as Color);

	log(s, `Round started. Starting card is ${describeCard(start, s.activeColor)}.`);

	// Apply starting card effects.
	switch (start.type) {
		case CardType.Skip:
			log(s, `${nameOf(s, currentPlayer(s))} is skipped.`);
			passTurn(s, 1);
			break;
		case CardType.Reverse:
			s.direction = -1;
			log(s, "Play direction reversed.");
			break;
		case CardType.Draw2:
			s.pendingDraw = 2;
			break;
		default:
			break;
	}

	return s;
}

/** Calculates points awarded to the round winner from cards left in opponents' hands. */
export function roundPoints(s: GameState): number {
	if (!s.winnerId) return 0;
	let total = s.eliminatedPoints ?? 0;
	for (const [pid, hand] of Object.entries(s.hands)) {
		if (pid === s.winnerId) continue;
		for (const card of hand) total += cardPoints(card);
	}
	return total;
}

/** Returns null if `card` may be played by `pid` right now, otherwise a human-readable reason. */
export function playError(s: GameState, pid: string, card: Card): string | null {
	if (s.winnerId) return "The round is over";
	const top = topCard(s);

	// Shield card can be used anytime
	if (card.type === CardType.Shield) return null;

	if (s.pendingDraw > 0) {
		if (s.rules.stacking) {
			const topPlus = plusValue(top);
			const cardPlus = plusValue(card);
			// Stacking rule: next player can play another same or higher number plus card to stack the effect
			if (topPlus !== null && cardPlus !== null && cardPlus >= topPlus) {
				return null;
			}
		}
		return `You must draw ${s.pendingDraw} cards`;
	}

	if (s.drawnCardId && card.id !== s.drawnCardId) {
		return "You can only play the card you just drew";
	}

	if (isWild(card)) return null;
	if (card.color === s.activeColor) return null;
	if (card.type === CardType.Number && top.type === CardType.Number && card.value === top.value)
		return null;
	if (card.type !== CardType.Number && card.type === top.type) return null;
	return "That card doesn't match the active color or number";
}

function isPlayable(s: GameState, pid: string, card: Card): boolean {
	return playError(s, pid, card) === null;
}

/* -------------------------------------------------------------------------- */
/*                                  Actions                                   */
/* -------------------------------------------------------------------------- */

/**
 * Applies `action` by `playerId` and returns the NEW state. The input state is never mutated.
 * Throws `GameError` if the action is illegal.
 */
export function applyAction(state: GameState, playerId: string, action: Action): GameState {
	if (state.winnerId) throw new GameError("The round is over");
	const s = structuredClone(state);

	// PlayShield can be done anytime, even out of turn.
	if (action.type === ActionType.PlayShield) {
		return doPlayShield(s, playerId, action.cardId);
	}

	// Only a normal action closes the UNO catch window; calling UNO or catching does not.
	if (action.type !== ActionType.CatchUno && action.type !== ActionType.CallUno)
		s.unoAlert = null;

	switch (action.type) {
		case ActionType.Play:
			return doPlay(s, playerId, action);
		case ActionType.Draw:
			return doDraw(s, playerId);
		case ActionType.Pass:
			return doPass(s, playerId);
		case ActionType.CatchUno:
			return doCatch(s, playerId, action.target);
		case ActionType.CallUno:
			return doCallUno(s, playerId);
		default:
			throw new GameError("Unknown action");
	}
}

function requireTurn(s: GameState, pid: string): void {
	if (currentPlayer(s) !== pid) throw new GameError("It is not your turn");
}

function doPlayShield(s: GameState, pid: string, cardId: string): GameState {
	const hand = s.hands[pid];
	if (!hand) throw new GameError("You have no cards in hand");
	const index = hand.findIndex((c) => c.id === cardId);
	if (index === -1) throw new GameError("That card is not in your hand");
	const card = hand[index]!;
	if (card.type !== CardType.Shield) throw new GameError("That card is not a Shield card");

	hand.splice(index, 1);
	s.discardPile.push(card);
	if (s.drawnCardId === cardId) {
		s.drawnCardId = null;
	}
	log(s, `${nameOf(s, pid)} activated a Shield!`);

	// If it's pid's turn and facing pending draws, absorb them immediately
	if (currentPlayer(s) === pid && s.pendingDraw > 0) {
		log(s, `${nameOf(s, pid)}'s Shield absorbed the draw penalty of ${s.pendingDraw} cards!`);
		s.pendingDraw = 0;
		s.shielded[pid] = false;
	} else {
		s.shielded[pid] = true;
	}

	if (hand.length === 0) {
		s.winnerId = pid;
		log(s, `${nameOf(s, pid)} went out and won the round!`);
	}
	return s;
}

function doPlay(
	s: GameState,
	pid: string,
	action: Extract<Action, { type: ActionType.Play }>,
): GameState {
	const hand = s.hands[pid];
	if (!hand) throw new GameError("You are not active in this round");
	const index = hand.findIndex((c) => c.id === action.cardId);
	if (index === -1) throw new GameError("That card is not in your hand");
	const card = hand[index]!;

	// Shield card can be played anytime (even out of turn or as a Play action)
	if (card.type === CardType.Shield) {
		return doPlayShield(s, pid, card.id);
	}

	requireTurn(s, pid);

	const err = playError(s, pid, card);
	if (err) throw new GameError(err);

	let chosen: Color;
	if (changesColor(card)) {
		if (!action.color || !(COLORS as readonly string[]).includes(action.color)) {
			throw new GameError("Choose a color for the wild card");
		}
		chosen = action.color;
	} else if (keepsCurrentColor(card)) {
		chosen = s.activeColor;
	} else {
		chosen = card.color as Color;
	}

	hand.splice(index, 1);
	s.discardPile.push(card);
	s.activeColor = chosen;
	s.drawnCardId = null;
	log(s, `${nameOf(s, pid)} played ${describeCard(card, chosen)}`);

	if (hand.length === 0) {
		s.winnerId = pid;
		log(s, `${nameOf(s, pid)} went out and won the round!`);
		return s;
	}

	if (hand.length === 1) {
		if (!action.uno) s.unoAlert = pid;
	}

	const n = s.order.length;

	// Double Trouble: grants 1 extra play to the same player
	if (card.type === CardType.DoubleTrouble) {
		s.extraPlays += 1;
		log(s, `${nameOf(s, pid)} activated Double Trouble! They get to play a second card.`);
		return s;
	}

	// Swap Hands: everyone swaps hand with the next player in direction of play
	if (card.type === CardType.SwapHands) {
		const oldHands: Record<string, Card[]> = {};
		for (const p of s.order) oldHands[p] = [...(s.hands[p] ?? [])];
		for (let i = 0; i < n; i++) {
			const receiverId = s.order[i]!;
			const giverIdx = s.direction === 1 ? mod(i - 1, n) : mod(i + 1, n);
			const giverId = s.order[giverIdx]!;
			s.hands[receiverId] = oldHands[giverId]!;
		}
		log(s, "Swap Hands! All players swapped hands in the direction of play.");
		checkAllEliminations(s);
		if (s.winnerId) return s;

		if (s.extraPlays > 0) {
			s.extraPlays -= 1;
			return s;
		}
		passTurn(s, 1);
		return s;
	}

	// Snatch: swap all cards directly between player and chosen target player
	if (card.type === CardType.Snatch) {
		if (!action.target) throw new GameError("Choose a player to snatch cards from");
		const targetId = action.target;
		if (!s.order.includes(targetId) || targetId === pid) {
			throw new GameError("Invalid target player for snatch");
		}
		if (s.shielded[targetId]) {
			s.shielded[targetId] = false;
			log(
				s,
				`${nameOf(s, pid)} tried to snatch cards from ${nameOf(s, targetId)}, but their Shield protected them!`,
			);
		} else {
			const targetHand = s.hands[targetId] ?? [];
			const myRemainingHand = [...hand];
			s.hands[pid] = [...targetHand];
			s.hands[targetId] = myRemainingHand;
			log(s, `${nameOf(s, pid)} snatched ${nameOf(s, targetId)}'s hand! They swapped cards.`);

			if (s.unoAlert === pid && s.hands[pid].length !== 1) s.unoAlert = null;
			if (s.unoAlert === targetId && s.hands[targetId].length !== 1) s.unoAlert = null;

			if (s.hands[pid].length === 0) {
				s.winnerId = pid;
				log(s, `${nameOf(s, pid)} went out and won the round!`);
				return s;
			}
			if (s.hands[targetId].length === 0) {
				s.winnerId = targetId;
				log(s, `${nameOf(s, targetId)} went out and won the round!`);
				return s;
			}

			checkElimination(s, pid);
			checkElimination(s, targetId);
			if (s.winnerId) return s;
		}

		if (s.extraPlays > 0) {
			s.extraPlays -= 1;
			return s;
		}
		passTurn(s, 1);
		return s;
	}

	// Handling extra play if active from earlier Double Trouble
	const hasRemainingExtraPlays = s.extraPlays > 1;
	if (s.extraPlays > 0) {
		s.extraPlays -= 1;
	}

	const nextTargetId = s.order[mod(s.currentIndex + s.direction, s.order.length)]!;

	switch (card.type) {
		case CardType.Number:
		case CardType.Wild:
			if (!hasRemainingExtraPlays) passTurn(s, 1);
			break;
		case CardType.Skip:
			if (s.shielded[nextTargetId]) {
				s.shielded[nextTargetId] = false;
				log(s, `${nameOf(s, nextTargetId)}'s Shield absorbed the Skip!`);
				if (!hasRemainingExtraPlays) passTurn(s, 1);
			} else {
				if (!hasRemainingExtraPlays) passTurn(s, 2);
			}
			break;
		case CardType.Reverse:
			if (n === 2) {
				if (s.shielded[nextTargetId]) {
					s.shielded[nextTargetId] = false;
					log(s, `${nameOf(s, nextTargetId)}'s Shield absorbed the Skip!`);
					if (!hasRemainingExtraPlays) passTurn(s, 1);
				} else {
					if (!hasRemainingExtraPlays) passTurn(s, 2); // with two players, reverse acts like skip
				}
			} else {
				s.direction = s.direction === 1 ? -1 : 1;
				if (!hasRemainingExtraPlays) passTurn(s, 1);
			}
			break;
		case CardType.Draw2:
			s.pendingDraw += 2;
			if (s.shielded[nextTargetId]) {
				s.shielded[nextTargetId] = false;
				s.pendingDraw = 0;
				log(s, `${nameOf(s, nextTargetId)}'s Shield absorbed the Draw Two!`);
			}
			if (!hasRemainingExtraPlays) passTurn(s, 1);
			break;
		case CardType.Wild4:
			s.pendingDraw += 4;
			if (s.shielded[nextTargetId]) {
				s.shielded[nextTargetId] = false;
				s.pendingDraw = 0;
				log(s, `${nameOf(s, nextTargetId)}'s Shield absorbed the Wild Draw Four!`);
			}
			if (!hasRemainingExtraPlays) passTurn(s, 1);
			break;
		case CardType.Wild6:
			s.pendingDraw += 6;
			if (s.shielded[nextTargetId]) {
				s.shielded[nextTargetId] = false;
				s.pendingDraw = 0;
				log(s, `${nameOf(s, nextTargetId)}'s Shield absorbed the Wild Draw Six!`);
			}
			if (!hasRemainingExtraPlays) passTurn(s, 1);
			break;
		case CardType.Wild10:
			s.pendingDraw += 10;
			if (s.shielded[nextTargetId]) {
				s.shielded[nextTargetId] = false;
				s.pendingDraw = 0;
				log(s, `${nameOf(s, nextTargetId)}'s Shield absorbed the Wild Draw Ten!`);
			}
			if (!hasRemainingExtraPlays) passTurn(s, 1);
			break;
	}
	return s;
}

function doDraw(s: GameState, pid: string): GameState {
	requireTurn(s, pid);

	if (s.pendingDraw > 0) {
		const count = s.pendingDraw;
		drawCards(s, pid, count);
		s.pendingDraw = 0;
		log(s, `${nameOf(s, pid)} drew ${count} cards`);
		checkElimination(s, pid);
		if (s.winnerId) return s;
		passTurn(s, 1);
		return s;
	}

	if (s.drawnCardId) throw new GameError("You already drew a card this turn");
	const [card] = drawCards(s, pid, 1);
	if (!card) throw new GameError("There are no cards left to draw");
	s.drawnCardId = card.id;
	log(s, `${nameOf(s, pid)} drew a card`);
	checkElimination(s, pid);
	return s;
}

function doPass(s: GameState, pid: string): GameState {
	requireTurn(s, pid);
	if (s.pendingDraw > 0) throw new GameError(`You must draw ${s.pendingDraw} cards`);
	if (!s.drawnCardId && s.extraPlays === 0) throw new GameError("Draw a card before passing");
	log(s, `${nameOf(s, pid)} passed`);
	passTurn(s, 1);
	return s;
}

function doCallUno(s: GameState, pid: string): GameState {
	const hand = s.hands[pid];
	if (!hand || hand.length > 2)
		throw new GameError("You can only call UNO with two or fewer cards");
	s.unoCalls += 1;
	if (s.unoAlert === pid) {
		s.unoAlert = null;
	}
	log(s, `${nameOf(s, pid)} says UNO!`);
	return s;
}

function doCatch(s: GameState, pid: string, target: string): GameState {
	if (s.unoAlert !== target) throw new GameError("There is no UNO to catch");
	if (target === pid) throw new GameError("You can't catch yourself");
	const targetHand = s.hands[target];
	if (!targetHand || targetHand.length !== 1)
		throw new GameError("That player is no longer on one card");

	if (s.shielded[target]) {
		s.shielded[target] = false;
		s.unoAlert = null;
		log(
			s,
			`${nameOf(s, pid)} tried to catch ${nameOf(s, target)}, but their Shield protected them!`,
		);
		return s;
	}

	drawCards(s, target, 2);
	s.unoAlert = null;
	log(s, `${nameOf(s, pid)} caught ${nameOf(s, target)} without UNO: draws 2`);
	checkElimination(s, target);
	return s;
}

/** Chooses a sensible action for `pid`. Used to keep the game moving when a player is disconnected. */
export function suggestAction(s: GameState, pid: string): Action {
	const hand = s.hands[pid];
	if (!hand) return { type: ActionType.Draw };

	// If shielded card is in hand and facing pending draws, use it
	if (s.pendingDraw > 0) {
		const shield = hand.find((c) => c.type === CardType.Shield);
		if (shield) return { type: ActionType.PlayShield, cardId: shield.id };
	}

	const playable = hand.filter((c) => isPlayable(s, pid, c));
	if (playable.length > 0) {
		const card = playable.find((c) => !isWild(c)) ?? playable[0]!;
		const color = changesColor(card) ? mostCommonColor(hand) : undefined;
		let target: string | undefined = undefined;
		if (card.type === CardType.Snatch) {
			const opponents = s.order.filter((id) => id !== pid && (s.hands[id]?.length ?? 0) > 0);
			if (opponents.length > 0) {
				opponents.sort((a, b) => (s.hands[a]?.length ?? 0) - (s.hands[b]?.length ?? 0));
				target = opponents[0];
			}
		}
		return {
			type: ActionType.Play,
			cardId: card.id,
			color,
			uno: true,
			target,
		};
	}
	if (s.pendingDraw > 0) return { type: ActionType.Draw };
	return s.drawnCardId ? { type: ActionType.Pass } : { type: ActionType.Draw };
}

/* -------------------------------------------------------------------------- */
/*                                    View                                    */
/* -------------------------------------------------------------------------- */

export interface PublicPlayerCards {
	id: string;
	name: string;
	cardCount: number;
	eliminated: boolean;
	shielded: boolean;
}

/** What one viewer is allowed to know about the round. Opponents' hands are hidden. */
export interface PublicRound {
	order: PublicPlayerCards[];
	eliminated: string[];
	currentId: string | null;
	direction: 1 | -1;
	activeColor: Color;
	top: Card;
	drawPileCount: number;
	pendingDraw: number;
	unoAlert: string | null;
	unoCalls: number;
	winnerId: string | null;
	hand: Card[];
	playableIds: string[];
	drawnCardId: string | null;
	extraPlays: number;
	shieldedPlayers: string[];
	hasShield: boolean;
	turnDeadline: number | null;
	eliminationLimit: number | null;
	log: string[];
}

export function viewFor(s: GameState, viewerId: string): PublicRound {
	const hand = s.hands[viewerId] ?? [];
	const isMyTurn = currentPlayer(s) === viewerId && !s.winnerId;
	const allIds = [...s.order, ...s.eliminated];

	return {
		order: allIds.map((id) => ({
			id,
			name: nameOf(s, id),
			cardCount: s.hands[id]?.length ?? 0,
			eliminated: s.eliminated.includes(id),
			shielded: Boolean(s.shielded[id]),
		})),
		eliminated: s.eliminated,
		currentId: s.winnerId ? null : currentPlayer(s),
		direction: s.direction,
		activeColor: s.activeColor,
		top: topCard(s),
		drawPileCount: s.drawPile.length,
		pendingDraw: s.pendingDraw,
		unoAlert: s.unoAlert,
		unoCalls: s.unoCalls,
		winnerId: s.winnerId,
		hand,
		playableIds: isMyTurn
			? hand.filter((c) => isPlayable(s, viewerId, c)).map((c) => c.id)
			: [],
		drawnCardId: isMyTurn ? s.drawnCardId : null,
		extraPlays: s.extraPlays,
		shieldedPlayers: Object.keys(s.shielded).filter((id) => s.shielded[id]),
		hasShield: Boolean(s.shielded[viewerId]) || hand.some((c) => c.type === CardType.Shield),
		turnDeadline: null,
		eliminationLimit: s.rules.eliminationLimit,
		log: s.log,
	};
}

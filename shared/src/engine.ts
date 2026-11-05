import {
    type Card,
    CardType,
    Color,
    COLORS,
    SpecialColor,
    buildDeck,
    cardPoints,
    isWild,
    shuffle,
} from './cards';
import { ActionType } from './types';

export { ActionType };

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export interface Rules {
    /** House rule: a Draw Two may be answered with another Draw Two to pass the penalty on. */
    stacking: boolean;
    /** Game ends when a player reaches this score. */
    targetScore: number;
}

/** Limits for the host's "cards per player" choice made before dealing. */
export const CARDS_PER_PLAYER = { min: 2, max: 15, default: 7 } as const;

export const DEFAULT_RULES: Rules = {
    stacking: false,
    targetScore: 500,
};

export interface GameState {
    rules: Rules;
    /** Player ids in seat order. */
    order: string[];
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
    /** Player who went down to one card without calling UNO; catchable until the next action. */
    unoAlert: string | null;
    /** Number of UNO presses this round; clients use it to play the UNO call for everyone. */
    unoCalls: number;
    winnerId: string | null;
    log: string[];
}

export type Action =
    | { type: ActionType.Play; cardId: string; color?: Color; uno?: boolean }
    | { type: ActionType.Draw }
    | { type: ActionType.Pass }
    | { type: ActionType.CatchUno; target: string }
    | { type: ActionType.CallUno };

export class GameError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GameError';
    }
}

/* -------------------------------------------------------------------------- */
/*                                 Helpers                                    */
/* -------------------------------------------------------------------------- */

const LOG_LIMIT = 60;

const LABELS: Record<CardType, string> = {
    [CardType.Number]: '',
    [CardType.Skip]: 'Skip',
    [CardType.Reverse]: 'Reverse',
    [CardType.Draw2]: 'Draw Two',
    [CardType.Wild]: 'Wild',
    [CardType.Wild4]: 'Wild Draw Four',
};

export function describeCard(card: Card, color: Color | SpecialColor.Wild = card.color): string {
    const label = card.type === CardType.Number ? String(card.value) : LABELS[card.type];
    return color === SpecialColor.Wild ? label : `${color} ${label}`;
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
    s.currentIndex = mod(s.currentIndex + steps * s.direction, s.order.length);
    s.drawnCardId = null;
}

/** Draws `count` cards for `pid` from the draw pile, recycling the discard pile if needed. */
function drawCards(s: GameState, pid: string, count: number): Card[] {
    const drawn: Card[] = [];
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

/** Pick the color in hand that appears on the most cards. Falls back to red. */
function mostCommonColor(hand: Card[]): Color {
    const counts = new Map<Color, number>(COLORS.map((c) => [c, 0]));
    for (const card of hand) {
        if (card.color !== SpecialColor.Wild) counts.set(card.color as Color, (counts.get(card.color as Color) ?? 0) + 1);
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
 * Initializes a new round: shuffles a fresh deck, deals `cardsPerPlayer` cards to each player,
 * flips the starting card, and applies starting card effects per official rules.
 */
export function startRound(
    players: PlayerInfo[],
    rules: Rules,
    rng: () => number = Math.random,
    cardsPerPlayer: number = CARDS_PER_PLAYER.default,
): GameState {
    if (players.length < 2) throw new GameError('At least two players are required');
    const count = Math.floor(cardsPerPlayer);
    if (count < CARDS_PER_PLAYER.min || count > CARDS_PER_PLAYER.max) {
        throw new GameError(`Cards per player must be between ${CARDS_PER_PLAYER.min} and ${CARDS_PER_PLAYER.max}`);
    }
    if (players.length * count + 1 > 108) {
        throw new GameError(`${players.length} players with ${count} cards each do not fit in one deck`);
    }

    const deck = shuffle(buildDeck(), rng);
    const hands: Record<string, Card[]> = {};
    const names: Record<string, string> = {};
    for (const p of players) {
        hands[p.id] = deck.splice(deck.length - count, count);
        names[p.id] = p.name;
    }

    // Draw starting card. Per official rules, a Wild Draw Four cannot be the starting card:
    // if drawn, return it to the bottom of the deck and draw another.
    const discard: Card[] = [];
    let start = deck.pop()!;
    while (start.type === CardType.Wild4) {
        deck.unshift(start);
        start = deck.pop()!;
    }
    discard.push(start);

    const s: GameState = {
        rules,
        order: players.map((p) => p.id),
        names,
        hands,
        drawPile: deck,
        discardPile: discard,
        currentIndex: 0,
        direction: 1,
        activeColor: Color.Red,
        pendingDraw: 0,
        drawnCardId: null,
        unoAlert: null,
        unoCalls: 0,
        winnerId: null,
        log: [],
    };

    // If the starter is a wild card, the first player chooses the color (we pick one randomly here).
    s.activeColor = start.color === SpecialColor.Wild ? COLORS[Math.floor(rng() * COLORS.length)]! : (start.color as Color);

    log(s, `Round started. Starting card is ${describeCard(start, s.activeColor)}.`);

    // Apply starting card effects.
    switch (start.type) {
        case CardType.Skip:
            log(s, `${nameOf(s, currentPlayer(s))} is skipped.`);
            passTurn(s, 1);
            break;
        case CardType.Reverse:
            s.direction = -1;
            log(s, 'Play direction reversed.');
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
    let total = 0;
    for (const [pid, hand] of Object.entries(s.hands)) {
        if (pid === s.winnerId) continue;
        for (const card of hand) total += cardPoints(card);
    }
    return total;
}

/** Returns null if `card` may be played by `pid` right now, otherwise a human-readable reason. */
export function playError(s: GameState, pid: string, card: Card): string | null {
    if (s.winnerId) return 'The round is over';
    const top = topCard(s);

    if (s.pendingDraw > 0) {
        const stackable = s.rules.stacking && card.type === CardType.Draw2 && top.type === CardType.Draw2;
        if (!stackable) return `You must draw ${s.pendingDraw} cards`;
    }

    if (s.drawnCardId && card.id !== s.drawnCardId) {
        return 'You can only play the card you just drew';
    }

    if (isWild(card)) return null;
    if (card.color === s.activeColor) return null;
    if (card.type === CardType.Number && top.type === CardType.Number && card.value === top.value) return null;
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
    if (state.winnerId) throw new GameError('The round is over');
    const s = structuredClone(state);
    // Only a normal action closes the UNO catch window; calling UNO or catching does not.
    if (action.type !== ActionType.CatchUno && action.type !== ActionType.CallUno) s.unoAlert = null;

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
            throw new GameError('Unknown action');
    }
}

function requireTurn(s: GameState, pid: string): void {
    if (currentPlayer(s) !== pid) throw new GameError('It is not your turn');
}

function doPlay(
    s: GameState,
    pid: string,
    action: Extract<Action, { type: ActionType.Play }>,
): GameState {
    requireTurn(s, pid);
    const hand = s.hands[pid]!;
    const index = hand.findIndex((c) => c.id === action.cardId);
    if (index === -1) throw new GameError('That card is not in your hand');
    const card = hand[index]!;

    const err = playError(s, pid, card);
    if (err) throw new GameError(err);

    let chosen: Color;
    if (isWild(card)) {
        if (!action.color || !(COLORS as readonly string[]).includes(action.color)) {
            throw new GameError('Choose a color for the wild card');
        }
        chosen = action.color;
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
    switch (card.type) {
        case CardType.Number:
        case CardType.Wild:
            passTurn(s, 1);
            break;
        case CardType.Skip:
            passTurn(s, 2);
            break;
        case CardType.Reverse:
            if (n === 2) {
                passTurn(s, 2); // with two players, reverse acts like skip
            } else {
                s.direction = s.direction === 1 ? -1 : 1;
                passTurn(s, 1);
            }
            break;
        case CardType.Draw2:
            s.pendingDraw += 2;
            passTurn(s, 1);
            break;
        case CardType.Wild4:
            s.pendingDraw += 4;
            passTurn(s, 1);
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
        passTurn(s, 1);
        return s;
    }

    if (s.drawnCardId) throw new GameError('You already drew a card this turn');
    const [card] = drawCards(s, pid, 1);
    if (!card) throw new GameError('There are no cards left to draw');
    s.drawnCardId = card.id;
    log(s, `${nameOf(s, pid)} drew a card`);
    return s;
}

function doPass(s: GameState, pid: string): GameState {
    requireTurn(s, pid);
    if (s.pendingDraw > 0) throw new GameError(`You must draw ${s.pendingDraw} cards`);
    if (!s.drawnCardId) throw new GameError('Draw a card before passing');
    log(s, `${nameOf(s, pid)} passed`);
    passTurn(s, 1);
    return s;
}

function doCallUno(s: GameState, pid: string): GameState {
    if (s.hands[pid]!.length > 2) throw new GameError('You can only call UNO with two or fewer cards');
    s.unoCalls += 1;
    // If this player had forgotten to call UNO when playing and was exposed to catchUno,
    // calling UNO now saves them from being caught.
    if (s.unoAlert === pid) {
        s.unoAlert = null;
    }
    log(s, `${nameOf(s, pid)} says UNO!`);
    return s;
}

function doCatch(s: GameState, pid: string, target: string): GameState {
    if (s.unoAlert !== target) throw new GameError('There is no UNO to catch');
    if (target === pid) throw new GameError("You can't catch yourself");
    if (s.hands[target]!.length !== 1) throw new GameError('That player is no longer on one card');
    drawCards(s, target, 2);
    s.unoAlert = null;
    log(s, `${nameOf(s, pid)} caught ${nameOf(s, target)} without UNO: draws 2`);
    return s;
}

/**
 * Chooses a sensible action for `pid`. Used to keep the game moving when a player is disconnected.
 * Returns an action that `applyAction` accepts (assuming `pid` is the relevant player).
 */
export function suggestAction(s: GameState, pid: string): Action {
    if (s.pendingDraw > 0) return { type: ActionType.Draw };

    const hand = s.hands[pid]!;
    const playable = hand.filter((c) => isPlayable(s, pid, c));
    if (playable.length > 0) {
        const card = playable.find((c) => !isWild(c)) ?? playable[0]!;
        return isWild(card)
            ? { type: ActionType.Play, cardId: card.id, color: mostCommonColor(hand), uno: true }
            : { type: ActionType.Play, cardId: card.id, uno: true };
    }
    return s.drawnCardId ? { type: ActionType.Pass } : { type: ActionType.Draw };
}

/* -------------------------------------------------------------------------- */
/*                                    View                                    */
/* -------------------------------------------------------------------------- */

export interface PublicPlayerCards {
    id: string;
    name: string;
    cardCount: number;
}

/** What one viewer is allowed to know about the round. Opponents' hands are hidden. */
export interface PublicRound {
    order: PublicPlayerCards[];
    currentId: string | null;
    direction: 1 | -1;
    activeColor: Color;
    top: Card;
    drawPileCount: number;
    pendingDraw: number;
    unoAlert: string | null;
    unoCalls: number;
    winnerId: string | null;
    /** The viewer's own hand (empty for spectators). */
    hand: Card[];
    /** Ids of cards in `hand` the viewer may legally play right now. */
    playableIds: string[];
    /** Id of the card the current player drew this turn, if it is the viewer. */
    drawnCardId: string | null;
    log: string[];
}

export function viewFor(s: GameState, viewerId: string): PublicRound {
    const hand = s.hands[viewerId] ?? [];
    const isMyTurn = currentPlayer(s) === viewerId && !s.winnerId;
    return {
        order: s.order.map((id) => ({
            id,
            name: nameOf(s, id),
            cardCount: s.hands[id]!.length,
        })),
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
        playableIds: isMyTurn ? hand.filter((c) => isPlayable(s, viewerId, c)).map((c) => c.id) : [],
        drawnCardId: isMyTurn ? s.drawnCardId : null,
        log: s.log,
    };
}

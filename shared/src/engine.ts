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
    stacking: true,
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
/*                                 Constants                                  */
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

/** Cards a penalty the next player must draw (or answer with a higher plus / a Shield). */
const DRAW_PENALTY: Record<
    CardType.Draw2 | CardType.Wild4 | CardType.Wild6 | CardType.Wild10,
    number
> = {
    [CardType.Draw2]: 2,
    [CardType.Wild4]: 4,
    [CardType.Wild6]: 6,
    [CardType.Wild10]: 10,
};

/** Card types that may not be the first flipped card of a round. */
const FORBIDDEN_STARTING_CARDS = new Set<CardType>([
    CardType.Wild4,
    CardType.Wild6,
    CardType.Wild10,
    CardType.SwapHands,
    CardType.DoubleTrouble,
    CardType.Snatch,
    CardType.Shield,
]);

/* -------------------------------------------------------------------------- */
/*                                 Helpers                                    */
/* -------------------------------------------------------------------------- */

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

function mod(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

function log(state: GameState, message: string): void {
    state.log.push(message);
    if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

function topCard(state: GameState): Card {
    return state.discardPile[state.discardPile.length - 1]!;
}

function currentPlayer(state: GameState): string {
    return state.order[state.currentIndex]!;
}

function nameOf(state: GameState, playerId: string): string {
    return state.names[playerId] ?? playerId;
}

function passTurn(state: GameState, steps = 1): void {
    if (state.order.length === 0) return;
    state.currentIndex = mod(state.currentIndex + steps * state.direction, state.order.length);
    state.drawnCardId = null;
    state.extraPlays = 0;
}

/** Draws `count` cards for `playerId` from the draw pile, recycling the discard pile if needed. */
function drawCards(state: GameState, playerId: string, count: number): Card[] {
    const drawn: Card[] = [];
    if (!state.hands[playerId]) state.hands[playerId] = [];
    for (let i = 0; i < count; i++) {
        if (state.drawPile.length === 0) {
            if (state.discardPile.length <= 1) break; // no cards left to draw
            const top = state.discardPile.pop()!;
            state.drawPile = shuffle(state.discardPile);
            state.discardPile = [top];
        }
        const card = state.drawPile.pop();
        if (card) {
            state.hands[playerId]!.push(card);
            drawn.push(card);
        }
    }
    return drawn;
}

/**
 * Checks whether `playerId` exceeded the elimination card limit and, if so, removes them from the
 * round. Returns true when the player was eliminated.
 */
function checkElimination(state: GameState, playerId: string): boolean {
    if (typeof state.rules.eliminationLimit !== "number") return false;
    const hand = state.hands[playerId];
    if (!hand || hand.length <= state.rules.eliminationLimit) return false;

    // Track points from the eliminated player's cards so the round winner receives them
    let handPoints = 0;
    for (const card of hand) handPoints += cardPoints(card);
    state.eliminatedPoints += handPoints;

    log(
        state,
        `${nameOf(state, playerId)} exceeded the card limit of ${state.rules.eliminationLimit} (${hand.length} cards, ${handPoints} pts) and is eliminated!`,
    );
    state.eliminated.push(playerId);
    if (hand.length > 0) state.drawPile.unshift(...hand);
    delete state.hands[playerId];
    delete state.shielded[playerId];
    if (state.unoAlert === playerId) state.unoAlert = null;

    const seatIndex = state.order.indexOf(playerId);
    if (seatIndex !== -1) {
        const wasCurrent = state.currentIndex === seatIndex;
        state.order.splice(seatIndex, 1);
        if (state.order.length <= 1) {
            state.winnerId = state.order[0] ?? null;
            if (state.winnerId) {
                log(state, `${nameOf(state, state.winnerId)} is the last survivor and wins the round!`);
            }
            return true;
        }
        if (wasCurrent) {
            state.currentIndex = mod(seatIndex, state.order.length);
            state.drawnCardId = null;
            state.extraPlays = 0;
        } else if (seatIndex < state.currentIndex) {
            state.currentIndex -= 1;
        }
    }
    return true;
}

function checkAllEliminations(state: GameState): void {
    if (typeof state.rules.eliminationLimit !== "number") return;
    for (const playerId of [...state.order]) {
        if (checkElimination(state, playerId) && state.winnerId) break;
    }
}

/** Pick the color in hand that appears on the most cards. Falls back to red. */
function mostCommonColor(hand: Card[]): Color {
    const counts = new Map<Color, number>(COLORS.map((color) => [color, 0]));
    for (const card of hand) {
        if (card.color !== SpecialColor.Wild) {
            const color = card.color as Color;
            counts.set(color, (counts.get(color) ?? 0) + 1);
        }
    }
    let best: Color = COLORS[0];
    for (const color of COLORS) if (counts.get(color)! > counts.get(best)!) best = color;
    return best;
}

/**
 * Removes the target player's shield buff and logs the absorption if they had one.
 * Returns true when a shield was consumed and cancelled the card's effect.
 */
function absorbWithShield(state: GameState, targetId: string, effectName: string): boolean {
    if (!state.shielded[targetId]) return false;
    state.shielded[targetId] = false;
    log(state, `${nameOf(state, targetId)}'s Shield absorbed the ${effectName}!`);
    return true;
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
    const dealCount = Math.floor(cardsPerPlayer);
    if (dealCount < CARDS_PER_PLAYER.min || dealCount > CARDS_PER_PLAYER.max) {
        throw new GameError(
            `Cards per player must be between ${CARDS_PER_PLAYER.min} and ${CARDS_PER_PLAYER.max}`,
        );
    }

    const deck = shuffle(buildDeck(finalRules.cards), rng);
    if (players.length * dealCount + 1 > deck.length) {
        throw new GameError(
            `${players.length} players with ${dealCount} cards each do not fit in the deck (${deck.length} cards)`,
        );
    }

    const hands: Record<string, Card[]> = {};
    const names: Record<string, string> = {};
    for (const player of players) {
        hands[player.id] = deck.splice(deck.length - dealCount, dealCount);
        names[player.id] = player.name;
    }

    // Per official rules, a Wild Draw Four and special wild expansion cards cannot be the starting
    // card: if flipped, return them to the bottom of the deck and draw another.
    const discard: Card[] = [];
    let startingCard = deck.pop()!;
    while (FORBIDDEN_STARTING_CARDS.has(startingCard.type)) {
        deck.unshift(startingCard);
        startingCard = deck.pop()!;
    }
    discard.push(startingCard);

    const state: GameState = {
        rules: finalRules,
        order: players.map((player) => player.id),
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
    state.activeColor =
        startingCard.color === SpecialColor.Wild
            ? COLORS[Math.floor(rng() * COLORS.length)]!
            : (startingCard.color as Color);

    log(state, `Round started. Starting card is ${describeCard(startingCard, state.activeColor)}.`);

    // Apply starting card effects.
    switch (startingCard.type) {
        case CardType.Skip:
            log(state, `${nameOf(state, currentPlayer(state))} is skipped.`);
            passTurn(state, 1);
            break;
        case CardType.Reverse:
            state.direction = -1;
            log(state, "Play direction reversed.");
            break;
        case CardType.Draw2:
            state.pendingDraw = 2;
            break;
        default:
            break;
    }

    return state;
}

/** Calculates points awarded to the round winner from cards left in opponents' hands. */
export function roundPoints(state: GameState): number {
    if (!state.winnerId) return 0;
    let total = state.eliminatedPoints;
    for (const [playerId, hand] of Object.entries(state.hands)) {
        if (playerId === state.winnerId) continue;
        for (const card of hand) total += cardPoints(card);
    }
    return total;
}

/** Returns null if `card` may be played by `playerId` right now, otherwise a human-readable reason. */
export function playError(state: GameState, playerId: string, card: Card): string | null {
    if (state.winnerId) return "The round is over";
    const top = topCard(state);

    if (state.pendingDraw > 0) {
        if (state.rules.stacking) {
            const topPlus = plusValue(top);
            const cardPlus = plusValue(card);
            // Stacking rule: the next player may answer a plus card with another
            // same or higher number plus card to stack the effect
            if (topPlus !== null && cardPlus !== null && cardPlus >= topPlus) return null;
        }
        // Shield can be played on the player's turn to absorb the pending draw
        if (card.type === CardType.Shield) return null;
        return `You must draw ${state.pendingDraw} cards`;
    }

    if (state.drawnCardId && card.id !== state.drawnCardId) {
        return "You can only play the card you just drew";
    }

    if (isWild(card)) return null;
    if (card.color === state.activeColor) return null;
    if (card.type === CardType.Number && top.type === CardType.Number && card.value === top.value) {
        return null;
    }
    if (card.type !== CardType.Number && card.type === top.type) return null;
    return "That card doesn't match the active color or number";
}

/** True when `playerId` may legally play `card` right now. */
function isPlayable(state: GameState, playerId: string, card: Card): boolean {
    return playError(state, playerId, card) === null;
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
    const workingState = structuredClone(state);

    // Playing a shield is only allowed on the player's own turn
    if (action.type === ActionType.PlayShield) {
        requireTurn(workingState, playerId);
        return playShieldCard(workingState, playerId, action.cardId);
    }

    // Only a normal action closes the UNO catch window; calling UNO or catching does not.
    if (action.type !== ActionType.CatchUno && action.type !== ActionType.CallUno) {
        workingState.unoAlert = null;
    }

    switch (action.type) {
        case ActionType.Play:
            return playCard(workingState, playerId, action);
        case ActionType.Draw:
            return drawCard(workingState, playerId);
        case ActionType.Pass:
            return passCards(workingState, playerId);
        case ActionType.CatchUno:
            return catchUno(workingState, playerId, action.target);
        case ActionType.CallUno:
            return callUno(workingState, playerId);
        default:
            throw new GameError("Unknown action");
    }
}

function requireTurn(state: GameState, playerId: string): void {
    if (currentPlayer(state) !== playerId) throw new GameError("It is not your turn");
}

function playShieldCard(state: GameState, playerId: string, cardId: string): GameState {
    const hand = state.hands[playerId];
    if (!hand) throw new GameError("You have no cards in hand");
    const cardIndex = hand.findIndex((card) => card.id === cardId);
    if (cardIndex === -1) throw new GameError("That card is not in your hand");
    const card = hand[cardIndex]!;
    if (card.type !== CardType.Shield) throw new GameError("That card is not a Shield card");

    hand.splice(cardIndex, 1);
    state.discardPile.push(card);
    if (state.drawnCardId === cardId) state.drawnCardId = null;
    log(state, `${nameOf(state, playerId)} activated a Shield!`);

    // A shield facing pending draws absorbs them immediately; otherwise it guards future effects
    if (state.pendingDraw > 0) {
        log(state, `${nameOf(state, playerId)}'s Shield absorbed the draw penalty of ${state.pendingDraw} cards!`);
        state.pendingDraw = 0;
        state.shielded[playerId] = false;
    } else {
        state.shielded[playerId] = true;
    }

    if (hand.length === 0) {
        state.winnerId = playerId;
        log(state, `${nameOf(state, playerId)} went out and won the round!`);
        return state;
    }

    if (hand.length === 1) state.unoAlert = playerId;

    const hasExtraPlayPending = state.extraPlays > 1;
    if (state.extraPlays > 0) state.extraPlays -= 1;
    if (!hasExtraPlayPending) passTurn(state, 1);
    return state;
}

/** Resolves the active color for a just-played card (wilds require the player's declaration). */
function resolveChosenColor(state: GameState, card: Card, declaredColor?: Color): Color {
    if (changesColor(card)) {
        if (!declaredColor || !(COLORS as readonly string[]).includes(declaredColor)) {
            throw new GameError("Choose a color for the wild card");
        }
        return declaredColor;
    }
    if (keepsCurrentColor(card)) return state.activeColor;
    return card.color as Color;
}

/** Swap Hands: every players receives their new hand from the neighbour they give theirs to. */
function swapAllHands(state: GameState): void {
    const playerCount = state.order.length;
    const previousHands = new Map(
        state.order.map((playerId) => [playerId, [...(state.hands[playerId] ?? [])]]),
    );
    for (let seat = 0; seat < playerCount; seat++) {
        const receiverId = state.order[seat]!;
        const giverSeat = state.direction === 1 ? mod(seat - 1, playerCount) : mod(seat + 1, playerCount);
        const giverId = state.order[giverSeat]!;
        state.hands[receiverId] = previousHands.get(giverId)!;
    }
    log(state, "Swap Hands! All players swapped hands in the direction of play.");
}

/** Snatch: the player and chosen target swap their remaining hands directly. */
function performSnatch(
    state: GameState,
    playerId: string,
    action: Extract<Action, { type: ActionType.Play }>,
): GameState {
    if (!action.target) throw new GameError("Choose a player to snatch cards from");
    const targetId = action.target;
    if (!state.order.includes(targetId) || targetId === playerId) {
        throw new GameError("Invalid target player for snatch");
    }

    if (state.shielded[targetId]) {
        state.shielded[targetId] = false;
        log(
            state,
            `${nameOf(state, playerId)} tried to snatch cards from ${nameOf(state, targetId)}, but their Shield protected them!`,
        );
    } else {
        const targetHand = state.hands[targetId] ?? [];
        const playerHand = [...state.hands[playerId]!];
        state.hands[playerId] = [...targetHand];
        state.hands[targetId] = playerHand;
        log(state, `${nameOf(state, playerId)} snatched ${nameOf(state, targetId)}'s hand! They swapped cards.`);

        // The stolen hand may no longer be on exactly one card
        if (state.unoAlert === playerId && state.hands[playerId]!.length !== 1) state.unoAlert = null;
        if (state.unoAlert === targetId && state.hands[targetId]!.length !== 1) state.unoAlert = null;

        if (state.hands[playerId]!.length === 0) {
            state.winnerId = playerId;
            log(state, `${nameOf(state, playerId)} went out and won the round!`);
            return state;
        }
        if (state.hands[targetId]!.length === 0) {
            state.winnerId = targetId;
            log(state, `${nameOf(state, targetId)} went out and won the round!`);
            return state;
        }

        checkElimination(state, playerId);
        checkElimination(state, targetId);
        if (state.winnerId) return state;
    }

    if (state.extraPlays > 0) {
        state.extraPlays -= 1;
        return state;
    }
    passTurn(state, 1);
    return state;
}

/** Applies the standard card effects (Skip / Reverse / plus cards etc.) and advances the turn. */
function applyCardEffects(state: GameState, card: Card): void {
    const playerCount = state.order.length;
    const hasExtraPlayPending = state.extraPlays > 1;
    if (state.extraPlays > 0) state.extraPlays -= 1;
    const nextPlayerId = state.order[mod(state.currentIndex + state.direction, playerCount)]!;

    // With extra plays left, the same player plays again instead of the turn passing on
    const advanceTurn = (steps: number = 1) => {
        if (!hasExtraPlayPending) passTurn(state, steps);
    };

    switch (card.type) {
        case CardType.Number:
        case CardType.Wild:
            advanceTurn();
            break;

        case CardType.Skip: {
            if (absorbWithShield(state, nextPlayerId, "Skip")) advanceTurn();
            else advanceTurn(2);
            break;
        }

        case CardType.Reverse: {
            if (playerCount === 2) {
                // With two players, reverse acts like skip
                if (absorbWithShield(state, nextPlayerId, "Skip")) advanceTurn();
                else advanceTurn(2);
            } else {
                state.direction = state.direction === 1 ? -1 : 1;
                advanceTurn();
            }
            break;
        }

        case CardType.Draw2:
        case CardType.Wild4:
        case CardType.Wild6:
        case CardType.Wild10: {
            state.pendingDraw += DRAW_PENALTY[card.type];
            if (absorbWithShield(state, nextPlayerId, LABELS[card.type])) state.pendingDraw = 0;
            advanceTurn();
            break;
        }

        // DoubleTrouble, SwapHands, Snatch and Shield are handled before reaching this switch
    }
}

/** Validates and plays a regular card, then either wins, grants special effects, or moves the turn. */
function playCard(
    state: GameState,
    playerId: string,
    action: Extract<Action, { type: ActionType.Play }>,
): GameState {
    const hand = state.hands[playerId];
    if (!hand) throw new GameError("You are not active in this round");
    const cardIndex = hand.findIndex((card) => card.id === action.cardId);
    if (cardIndex === -1) throw new GameError("That card is not in your hand");
    const card = hand[cardIndex]!;

    requireTurn(state, playerId);

    const illegalReason = playError(state, playerId, card);
    if (illegalReason) throw new GameError(illegalReason);

    // Shield cards follow their own dedicated flow, playable on the player's turn
    if (card.type === CardType.Shield) return playShieldCard(state, playerId, card.id);

    const chosenColor = resolveChosenColor(state, card, action.color);

    hand.splice(cardIndex, 1);
    state.discardPile.push(card);
    state.activeColor = chosenColor;
    state.drawnCardId = null;
    log(state, `${nameOf(state, playerId)} played ${describeCard(card, chosenColor)}`);

    if (hand.length === 0) {
        state.winnerId = playerId;
        log(state, `${nameOf(state, playerId)} went out and won the round!`);
        return state;
    }

    if (hand.length === 1 && !action.uno) state.unoAlert = playerId;

    if (card.type === CardType.DoubleTrouble) {
        state.extraPlays += 1;
        log(state, `${nameOf(state, playerId)} activated Double Trouble! They get to play a second card.`);
        return state;
    }

    if (card.type === CardType.SwapHands) {
        swapAllHands(state);
        checkAllEliminations(state);
        if (state.winnerId) return state;

        if (state.extraPlays > 0) {
            state.extraPlays -= 1;
            return state;
        }
        passTurn(state, 1);
        return state;
    }

    if (card.type === CardType.Snatch) return performSnatch(state, playerId, action);

    applyCardEffects(state, card);
    return state;
}

function drawCard(state: GameState, playerId: string): GameState {
    requireTurn(state, playerId);

    if (state.pendingDraw > 0) {
        const penalty = state.pendingDraw;
        drawCards(state, playerId, penalty);
        state.pendingDraw = 0;
        log(state, `${nameOf(state, playerId)} drew ${penalty} cards`);
        checkElimination(state, playerId);
        if (state.winnerId) return state;
        passTurn(state, 1);
        return state;
    }

    if (state.drawnCardId) throw new GameError("You already drew a card this turn");
    const [card] = drawCards(state, playerId, 1);
    if (!card) throw new GameError("There are no cards left to draw");
    state.drawnCardId = card.id;
    log(state, `${nameOf(state, playerId)} drew a card`);
    checkElimination(state, playerId);
    if (state.winnerId) return state;

    // If the drawn card cannot be played, auto-pass the turn immediately
    if (!isPlayable(state, playerId, card)) {
        state.drawnCardId = null;
        passTurn(state, 1);
    }

    return state;
}

function passCards(state: GameState, playerId: string): GameState {
    requireTurn(state, playerId);
    if (state.pendingDraw > 0) throw new GameError(`You must draw ${state.pendingDraw} cards`);
    if (!state.drawnCardId && state.extraPlays === 0) throw new GameError("Draw a card before passing");
    log(state, `${nameOf(state, playerId)} passed`);
    passTurn(state, 1);
    return state;
}

function callUno(state: GameState, playerId: string): GameState {
    const hand = state.hands[playerId];
    if (!hand || hand.length > 2) {
        throw new GameError("You can only call UNO with two or fewer cards");
    }
    state.unoCalls += 1;
    if (state.unoAlert === playerId) state.unoAlert = null;
    log(state, `${nameOf(state, playerId)} says UNO!`);
    return state;
}

function catchUno(state: GameState, catcherId: string, targetId: string): GameState {
    if (state.unoAlert !== targetId) throw new GameError("There is no UNO to catch");
    if (targetId === catcherId) throw new GameError("You can't catch yourself");
    const targetHand = state.hands[targetId];
    if (!targetHand || targetHand.length !== 1) {
        throw new GameError("That player is no longer on one card");
    }

    if (state.shielded[targetId]) {
        state.shielded[targetId] = false;
        state.unoAlert = null;
        log(
            state,
            `${nameOf(state, catcherId)} tried to catch ${nameOf(state, targetId)}, but their Shield protected them!`,
        );
        return state;
    }

    drawCards(state, targetId, 2);
    state.unoAlert = null;
    log(state, `${nameOf(state, catcherId)} caught ${nameOf(state, targetId)} without UNO: draws 2`);
    checkElimination(state, targetId);
    return state;
}

/** Chooses a sensible action for `playerId`. Used to keep the game moving when a player is disconnected. */
export function suggestAction(state: GameState, playerId: string): Action {
    const hand = state.hands[playerId];
    if (!hand) return { type: ActionType.Draw };

    // A Shield is the best answer to pending draws
    if (state.pendingDraw > 0) {
        const shield = hand.find((card) => card.type === CardType.Shield);
        if (shield) return { type: ActionType.PlayShield, cardId: shield.id };
    }

    const playableCards = hand.filter((card) => isPlayable(state, playerId, card));
    if (playableCards.length > 0) {
        const card = playableCards.find((candidate) => !isWild(candidate)) ?? playableCards[0]!;
        const color = changesColor(card) ? mostCommonColor(hand) : undefined;
        let target: string | undefined;
        if (card.type === CardType.Snatch) {
            const opponents = state.order.filter(
                (id) => id !== playerId && (state.hands[id]?.length ?? 0) > 0,
            );
            if (opponents.length > 0) {
                opponents.sort((a, b) => (state.hands[a]?.length ?? 0) - (state.hands[b]?.length ?? 0));
                target = opponents[0];
            }
        }
        return { type: ActionType.Play, cardId: card.id, color, uno: true, target };
    }

    if (state.pendingDraw > 0) return { type: ActionType.Draw };
    return state.drawnCardId ? { type: ActionType.Pass } : { type: ActionType.Draw };
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

export function viewFor(state: GameState, viewerId: string): PublicRound {
    const hand = state.hands[viewerId] ?? [];
    const isMyTurn = currentPlayer(state) === viewerId && !state.winnerId;
    const allIds = [...state.order, ...state.eliminated];

    return {
        order: allIds.map((playerId) => ({
            id: playerId,
            name: nameOf(state, playerId),
            cardCount: state.hands[playerId]?.length ?? 0,
            eliminated: state.eliminated.includes(playerId),
            shielded: Boolean(state.shielded[playerId]),
        })),
        eliminated: state.eliminated,
        currentId: state.winnerId ? null : currentPlayer(state),
        direction: state.direction,
        activeColor: state.activeColor,
        top: topCard(state),
        drawPileCount: state.drawPile.length,
        pendingDraw: state.pendingDraw,
        unoAlert: state.unoAlert,
        unoCalls: state.unoCalls,
        winnerId: state.winnerId,
        hand,
        playableIds: isMyTurn
            ? hand.filter((card) => isPlayable(state, viewerId, card)).map((card) => card.id)
            : [],
        drawnCardId: isMyTurn ? state.drawnCardId : null,
        extraPlays: state.extraPlays,
        shieldedPlayers: Object.keys(state.shielded).filter((playerId) => state.shielded[playerId]),
        hasShield: Boolean(state.shielded[viewerId]) || hand.some((card) => card.type === CardType.Shield),
        turnDeadline: null,
        eliminationLimit: state.rules.eliminationLimit,
        log: state.log,
    };
}

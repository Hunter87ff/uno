import { cardPoints, CardType, COLORS, SpecialColor, type Card, keepsCurrentColor, shuffle } from "../cards";
import { Color } from "../types";
import { LABELS, LOG_LIMIT } from "./constants";
import type { GameState } from "./types";

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

export function mod(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

export function log(state: GameState, message: string): void {
    state.log.push(message);
    if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

export function topCard(state: GameState): Card {
    return state.discardPile[state.discardPile.length - 1]!;
}

export function currentPlayer(state: GameState): string {
    return state.order[state.currentIndex]!;
}

export function nameOf(state: GameState, playerId: string): string {
    return state.names[playerId] ?? playerId;
}

export function passTurn(state: GameState, steps = 1): void {
    if (state.order.length === 0) return;
    state.currentIndex = mod(state.currentIndex + steps * state.direction, state.order.length);
    state.drawnCardId = null;
    state.extraPlays = 0;
}

/** Draws `count` cards for `playerId` from the draw pile, recycling the discard pile if needed. */
export function drawCards(state: GameState, playerId: string, count: number): Card[] {
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
export function checkElimination(state: GameState, playerId: string): boolean {
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

export function checkAllEliminations(state: GameState): void {
    if (typeof state.rules.eliminationLimit !== "number") return;
    for (const playerId of [...state.order]) {
        if (checkElimination(state, playerId) && state.winnerId) break;
    }
}

/** Pick the color in hand that appears on the most cards. Falls back to red. */
export function mostCommonColor(hand: Card[]): Color {
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
export function absorbWithShield(state: GameState, targetId: string, effectName: string): boolean {
    if (!state.shielded[targetId]) return false;
    state.shielded[targetId] = false;
    log(state, `${nameOf(state, targetId)}'s Shield absorbed the ${effectName}!`);
    return true;
}

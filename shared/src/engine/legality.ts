import { CardType, isWild, type Card } from "../cards";
import { plusValue, topCard } from "./helpers";
import type { GameState } from "./types";

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
export function isPlayable(state: GameState, playerId: string, card: Card): boolean {
    return playError(state, playerId, card) === null;
}

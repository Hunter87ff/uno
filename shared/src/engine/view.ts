import { type Card, CardType } from "../cards";
import { Color } from "../types";
import { currentPlayer, nameOf, topCard } from "./helpers";
import { isPlayable } from "./legality";
import type { GameState } from "./types";

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

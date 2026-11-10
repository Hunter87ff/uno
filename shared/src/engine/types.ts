import type { Card, CustomCardSettings } from "../cards";
import { DEFAULT_CUSTOM_CARDS } from "../cards";
import { ActionType, Color } from "../types";

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

export interface PlayerInfo {
    id: string;
    name: string;
}

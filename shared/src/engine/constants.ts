import { CardType } from "../cards";

export const LOG_LIMIT = 60;

export const LABELS: Record<CardType, string> = {
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

/** Cards whose play puts a draw penalty on the next player (stealable by stacking or a Shield). */
export const DRAW_PENALTY: Record<
    CardType.Draw2 | CardType.Wild4 | CardType.Wild6 | CardType.Wild10,
    number
> = {
    [CardType.Draw2]: 2,
    [CardType.Wild4]: 4,
    [CardType.Wild6]: 6,
    [CardType.Wild10]: 10,
};

/** Card types that may not be the first flipped card of a round. */
export const FORBIDDEN_STARTING_CARDS = new Set<CardType>([
    CardType.Wild4,
    CardType.Wild6,
    CardType.Wild10,
    CardType.SwapHands,
    CardType.DoubleTrouble,
    CardType.Snatch,
    CardType.Shield,
]);

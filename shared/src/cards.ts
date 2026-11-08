import {
    type CardColor,
    CardType,
    Color,
    COLORS,
    SpecialColor,
} from './types';

export { Color, SpecialColor, type CardColor, CardType, COLORS };

export interface Card {
    id: string;
    type: CardType;
    color: CardColor;
    /** Face value for number cards, otherwise null. */
    value: number | null;
}

export interface CustomCardSettings {
    doubleTrouble: boolean;
    swapHands: boolean;
    snatch: boolean;
    shield: boolean;
    wild6: boolean;
    wild10: boolean;
}

export const DEFAULT_CUSTOM_CARDS: CustomCardSettings = {
    doubleTrouble: false,
    swapHands: false,
    snatch: false,
    shield: false,
    wild6: false,
    wild10: false,
};

export const ACTION_POINTS = 20;
export const WILD_POINTS = 50;

export function isWild(card: Card): boolean {
    return (
        card.type === CardType.Wild ||
        card.type === CardType.Wild4 ||
        card.type === CardType.DoubleTrouble ||
        card.type === CardType.SwapHands ||
        card.type === CardType.Snatch ||
        card.type === CardType.Shield ||
        card.type === CardType.Wild6 ||
        card.type === CardType.Wild10
    );
}

export function isAction(card: Card): boolean {
    return card.type !== CardType.Number;
}

/** Points a card is worth when left in an opponent's hand at round end. */
export function cardPoints(card: Card): number {
    if (card.type === CardType.Number) return card.value ?? 0;
    if (isWild(card)) return WILD_POINTS;
    return ACTION_POINTS;
}

/** Standard 108-card UNO deck plus any enabled custom expansion cards. */
export function buildDeck(customCards?: Partial<CustomCardSettings>): Card[] {
    const deck: Card[] = [];
    let n = 0;
    const add = (type: CardType, color: CardColor, value: number | null = null) => {
        deck.push({ id: `c${n++}`, type, color, value });
    };

    for (const color of COLORS) {
        add(CardType.Number, color, 0);
        for (let v = 1; v <= 9; v++) {
            add(CardType.Number, color, v);
            add(CardType.Number, color, v);
        }
        for (let i = 0; i < 2; i++) {
            add(CardType.Skip, color);
            add(CardType.Reverse, color);
            add(CardType.Draw2, color);
        }
    }
    for (let i = 0; i < 4; i++) {
        add(CardType.Wild, SpecialColor.Wild);
        add(CardType.Wild4, SpecialColor.Wild);
    }

    if (customCards?.doubleTrouble) {
        for (let i = 0; i < 2; i++) add(CardType.DoubleTrouble, SpecialColor.Wild);
    }
    if (customCards?.swapHands) {
        for (let i = 0; i < 2; i++) add(CardType.SwapHands, SpecialColor.Wild);
    }
    if (customCards?.snatch) {
        for (let i = 0; i < 2; i++) add(CardType.Snatch, SpecialColor.Wild);
    }
    if (customCards?.shield) {
        add(CardType.Shield, SpecialColor.Wild); // 1 in deck
    }
    if (customCards?.wild6) {
        for (let i = 0; i < 2; i++) add(CardType.Wild6, SpecialColor.Wild);
    }
    if (customCards?.wild10) {
        for (let i = 0; i < 2; i++) add(CardType.Wild10, SpecialColor.Wild);
    }

    return deck;
}

/** Fisher–Yates shuffle, in place. `rng` must return values in [0, 1). */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
}

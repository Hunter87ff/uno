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

export const ACTION_POINTS = 20;
export const WILD_POINTS = 50;

export function isWild(card: Card): boolean {
    return card.type === CardType.Wild || card.type === CardType.Wild4;
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

/** Standard 108-card UNO deck. */
export function buildDeck(): Card[] {
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

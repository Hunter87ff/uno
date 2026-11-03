export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];

/** Color of a card. Wild cards have no color until one is chosen when played. */
export type CardColor = Color | 'wild';

export type CardType = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

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
  return card.type === 'wild' || card.type === 'wild4';
}

export function isAction(card: Card): boolean {
  return card.type !== 'number';
}

/** Points a card is worth when left in an opponent's hand at round end. */
export function cardPoints(card: Card): number {
  if (card.type === 'number') return card.value ?? 0;
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
    add('number', color, 0);
    for (let v = 1; v <= 9; v++) {
      add('number', color, v);
      add('number', color, v);
    }
    for (let i = 0; i < 2; i++) {
      add('skip', color);
      add('reverse', color);
      add('draw2', color);
    }
  }
  for (let i = 0; i < 4; i++) {
    add('wild', 'wild');
    add('wild4', 'wild');
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

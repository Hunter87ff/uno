import { describe, expect, test } from 'bun:test';
import { type Card, COLORS, buildDeck } from './cards';
import {
  type GameState,
  applyAction,
  DEFAULT_RULES,
  GameError,
  playError,
  roundPoints,
  startRound,
  suggestAction,
  viewFor,
} from './engine';

const PLAYERS = [
  { id: 'a', name: 'Ann' },
  { id: 'b', name: 'Bob' },
  { id: 'c', name: 'Cy' },
];

const card = (id: string, type: Card['type'], color: Card['color'], value: number | null = null): Card => ({
  id,
  type,
  color,
  value,
});

/** Builds a deterministic state and overrides fields for targeted rule tests. */
function setup(overrides: Partial<GameState> & { hands?: Record<string, Card[]> } = {}, players = PLAYERS): GameState {
  const s = startRound(players, DEFAULT_RULES, () => 0.5);
  // Neutralise the random starting card so each test controls the top of the discard pile.
  s.discardPile = [card('top', 'number', 'red', 9)];
  s.activeColor = 'red';
  s.currentIndex = 0;
  s.direction = 1;
  s.pendingDraw = 0;
  s.drawnCardId = null;
  s.unoAlert = null;
  s.winnerId = null;
  s.drawPile = [card('d1', 'number', 'blue', 1), card('d2', 'number', 'blue', 2), card('d3', 'number', 'blue', 3), card('d4', 'number', 'blue', 4), card('d5', 'number', 'blue', 5), card('d6', 'number', 'blue', 6), card('d7', 'number', 'blue', 7), card('d8', 'number', 'blue', 8)];
  const { hands, ...rest } = overrides;
  Object.assign(s, rest);
  if (hands) s.hands = hands;
  return s;
}

describe('deck', () => {
  test('has 108 cards with the standard distribution', () => {
    const deck = buildDeck();
    expect(deck.length).toBe(108);
    expect(deck.filter((c) => c.type === 'wild').length).toBe(4);
    expect(deck.filter((c) => c.type === 'wild4').length).toBe(4);
    for (const color of COLORS) {
      expect(deck.filter((c) => c.color === color && c.type === 'number' && c.value === 0).length).toBe(1);
      expect(deck.filter((c) => c.color === color && c.type === 'draw2').length).toBe(2);
    }
  });
});

describe('startRound', () => {
  test('deals 7 cards each and leaves a discard pile with a starting card', () => {
    const s = startRound(PLAYERS, DEFAULT_RULES, () => 0.3);
    for (const p of PLAYERS) expect(s.hands[p.id]!.length).toBe(7);
    expect(s.discardPile.length).toBe(1);
    expect(s.discardPile[0]!.type).not.toBe('wild4');
    expect(s.hands.a!.length + s.hands.b!.length + s.hands.c!.length + s.drawPile.length + 1).toBe(108);
  });

  test('deals the requested number of cards and rejects impossible counts', () => {
    const s = startRound(PLAYERS, DEFAULT_RULES, () => 0.3, 4);
    for (const p of PLAYERS) expect(s.hands[p.id]!.length).toBe(4);
    expect(() => startRound(PLAYERS, DEFAULT_RULES, Math.random, 1)).toThrow('between 2 and 15');
    expect(() => startRound(PLAYERS, DEFAULT_RULES, Math.random, 16)).toThrow('between 2 and 15');
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    expect(() => startRound(ten, DEFAULT_RULES, Math.random, 11)).toThrow('do not fit');
    expect(() => startRound(ten, DEFAULT_RULES, Math.random, 10)).not.toThrow();
  });

  test('requires at least two players', () => {
    expect(() => startRound([{ id: 'a', name: 'A' }])).toThrow(GameError);
  });
});

describe('playing cards', () => {
  test('matching color is playable and advances the turn', () => {
    let s = setup({ hands: { a: [card('x', 'number', 'red', 3), card('y', 'number', 'blue', 4)], b: [card('z', 'number', 'green', 1)], c: [card('w', 'number', 'green', 2)] } });
    s = applyAction(s, 'a', { type: 'play', cardId: 'x' });
    expect(s.discardPile.at(-1)!.id).toBe('x');
    expect(s.currentIndex).toBe(1);
  });

  test('non-matching card is rejected', () => {
    const s = setup({ hands: { a: [card('x', 'number', 'blue', 3)], b: [], c: [] } });
    expect(() => applyAction(s, 'a', { type: 'play', cardId: 'x' })).toThrow(GameError);
  });

  test('out-of-turn play is rejected', () => {
    const s = setup({ hands: { a: [], b: [card('x', 'number', 'red', 3)], c: [] } });
    expect(() => applyAction(s, 'b', { type: 'play', cardId: 'x' })).toThrow('not your turn');
  });

  test('wild requires a color and sets the active color', () => {
    const s = setup({ hands: { a: [card('w', 'wild', 'wild')], b: [card('z', 'number', 'red', 1)], c: [] } });
    expect(() => applyAction(s, 'a', { type: 'play', cardId: 'w' })).toThrow('Choose a color');
    const next = applyAction(s, 'a', { type: 'play', cardId: 'w', color: 'green' });
    expect(next.activeColor).toBe('green');
  });

  test('skip skips the next player', () => {
    const s = setup({ hands: { a: [card('s', 'skip', 'red'), card('k', 'number', 'red', 1)], b: [], c: [card('q', 'number', 'red', 2)] } });
    const next = applyAction(s, 'a', { type: 'play', cardId: 's' });
    expect(next.order[next.currentIndex]).toBe('c');
  });

  test('reverse flips direction', () => {
    const s = setup({ hands: { a: [card('r', 'reverse', 'red'), card('k', 'number', 'red', 1)], b: [], c: [card('q', 'number', 'red', 2)] } });
    const next = applyAction(s, 'a', { type: 'play', cardId: 'r' });
    expect(next.direction).toBe(-1);
    expect(next.order[next.currentIndex]).toBe('c');
  });

  test('reverse acts as skip with two players', () => {
    const s = setup({ hands: { a: [card('r', 'reverse', 'red'), card('k', 'number', 'red', 1)], b: [card('q', 'number', 'red', 2)] } }, PLAYERS.slice(0, 2));
    const next = applyAction(s, 'a', { type: 'play', cardId: 'r' });
    expect(next.order[next.currentIndex]).toBe('a');
  });

  test('draw two forces the next player to draw 2 and lose their turn', () => {
    let s = setup({ hands: { a: [card('d', 'draw2', 'red'), card('k', 'number', 'red', 1)], b: [card('q', 'number', 'yellow', 2)], c: [] } });
    s = applyAction(s, 'a', { type: 'play', cardId: 'd' });
    expect(s.pendingDraw).toBe(2);
    expect(() => applyAction(s, 'b', { type: 'play', cardId: 'q' })).toThrow('must draw 2');
    s = applyAction(s, 'b', { type: 'draw' });
    expect(s.hands.b!.length).toBe(3);
    expect(s.order[s.currentIndex]).toBe('c');
    expect(s.pendingDraw).toBe(0);
  });

  test('stacking lets a draw two be answered with a draw two when enabled', () => {
    let s = setup({ rules: { ...DEFAULT_RULES, stacking: true }, hands: { a: [card('d', 'draw2', 'red'), card('k', 'number', 'red', 1)], b: [card('e', 'draw2', 'red'), card('m', 'number', 'green', 3)], c: [] } });
    s = applyAction(s, 'a', { type: 'play', cardId: 'd' });
    s = applyAction(s, 'b', { type: 'play', cardId: 'e' });
    expect(s.pendingDraw).toBe(4);
  });
});

describe('drawing', () => {
  test('drawing is allowed even when a playable card exists', () => {
    const s = setup({ hands: { a: [card('x', 'number', 'red', 3)], b: [], c: [] } });
    const next = applyAction(s, 'a', { type: 'draw' });
    expect(next.drawnCardId).toBeTruthy();
  });

  test('cannot pass without drawing first', () => {
    const s = setup({ hands: { a: [card('x', 'number', 'red', 3)], b: [], c: [] } });
    expect(() => applyAction(s, 'a', { type: 'pass' })).toThrow('Draw a card before passing');
  });

  test('draw one, may play the drawn card or pass', () => {
    let s = setup({ hands: { a: [card('x', 'number', 'blue', 3)], b: [], c: [] } });
    s.drawPile.push(card('drawn', 'number', 'red', 5));
    s = applyAction(s, 'a', { type: 'draw' });
    expect(s.drawnCardId).toBe('drawn');
    expect(s.currentIndex).toBe(0);
    expect(() => applyAction(s, 'a', { type: 'play', cardId: 'x' })).toThrow('just drew');

    // Player can pass after drawing
    const passed = applyAction(s, 'a', { type: 'pass' });
    expect(passed.currentIndex).toBe(1);

    // Or play the drawn card
    const played = applyAction(s, 'a', { type: 'play', cardId: 'drawn' });
    expect(played.currentIndex).toBe(1);
  });
});

describe('UNO', () => {
  test('going to one card without UNO can be caught for a 2-card penalty', () => {
    let s = setup({ hands: { a: [card('x', 'number', 'red', 3), card('y', 'number', 'red', 4)], b: [card('z', 'number', 'blue', 9)], c: [] } });
    s = applyAction(s, 'a', { type: 'play', cardId: 'x' });
    expect(s.unoAlert).toBe('a');
    s = applyAction(s, 'b', { type: 'catchUno', target: 'a' });
    expect(s.hands.a!.length).toBe(3);
    expect(s.unoAlert).toBeNull();
  });

  test('calling UNO prevents the alert', () => {
    const s = applyAction(
      setup({ hands: { a: [card('x', 'number', 'red', 3), card('y', 'number', 'red', 4)], b: [], c: [] } }),
      'a',
      { type: 'play', cardId: 'x', uno: true },
    );
    expect(s.unoAlert).toBeNull();
  });

  test('pressing UNO is counted, announced and does not clear someone else\'s catch window', () => {
    let s = setup({ hands: { a: [card('x', 'number', 'red', 3), card('y', 'number', 'red', 4)], b: [card('z', 'number', 'blue', 9), card('q', 'number', 'blue', 2)], c: [] } });
    s = applyAction(s, 'a', { type: 'play', cardId: 'x' });
    expect(s.unoAlert).toBe('a');
    s = applyAction(s, 'b', { type: 'callUno' });
    expect(s.unoCalls).toBe(1);
    expect(s.unoAlert).toBe('a');
    expect(s.log.at(-1)).toContain('says UNO');
  });

  test('UNO cannot be called with more than two cards', () => {
    const s = setup({ hands: { a: [card('x', 'number', 'red', 3), card('y', 'number', 'red', 4), card('w', 'number', 'red', 5)], b: [], c: [] } });
    expect(() => applyAction(s, 'a', { type: 'callUno' })).toThrow('two or fewer');
  });

  test('the alert is cleared by the next action', () => {
    let s = setup({ hands: { a: [card('x', 'number', 'red', 3), card('y', 'number', 'red', 4)], b: [card('z', 'number', 'blue', 9)], c: [] } });
    s = applyAction(s, 'a', { type: 'play', cardId: 'x' });
    s = applyAction(s, 'b', { type: 'draw' });
    expect(s.unoAlert).toBeNull();
  });
});

describe('wild draw four', () => {
  test('wild draw four can be played even while holding a matching color and adds 4 pending draws', () => {
    let s = setup({ hands: { a: [card('w4', 'wild4', 'wild'), card('r', 'number', 'red', 2)], b: [card('r2', 'number', 'red', 5)], c: [] } });
    expect(playError(s, 'a', s.hands.a![0]!)).toBeNull();
    s = applyAction(s, 'a', { type: 'play', cardId: 'w4', color: 'blue' });
    expect(s.pendingDraw).toBe(4);
    expect(s.activeColor).toBe('blue');
    expect(s.order[s.currentIndex]).toBe('b');
  });
});

describe('round end and scoring', () => {
  test('going out ends the round and scores opponents cards', () => {
    let s = setup({ hands: { a: [card('x', 'number', 'red', 3)], b: [card('y', 'skip', 'blue'), card('z', 'number', 'blue', 4)], c: [card('w', 'wild', 'wild')] } });
    s = applyAction(s, 'a', { type: 'play', cardId: 'x' });
    expect(s.winnerId).toBe('a');
    expect(roundPoints(s)).toBe(20 + 4 + 50);
    expect(viewFor(s, 'b').currentId).toBeNull();
    expect(() => applyAction(s, 'b', { type: 'draw' })).toThrow('round is over');
  });
});

describe('suggestAction', () => {
  test('auto-plays a legal card for a disconnected player', () => {
    const s = setup({ hands: { a: [card('x', 'number', 'blue', 3), card('y', 'number', 'red', 4)], b: [], c: [] } });
    const action = suggestAction(s, 'a');
    expect(action).toEqual({ type: 'play', cardId: 'y', uno: true });
    expect(() => applyAction(s, 'a', action)).not.toThrow();
  });

  test('draws when nothing is playable', () => {
    const s = setup({ hands: { a: [card('x', 'number', 'blue', 3)], b: [], c: [] } });
    expect(suggestAction(s, 'a')).toEqual({ type: 'draw' });
  });
});

describe('viewFor', () => {
  test('hides opponents hands but shows counts and own hand', () => {
    const s = setup({ hands: { a: [card('x', 'number', 'red', 3)], b: [card('y', 'number', 'blue', 4), card('q', 'number', 'blue', 6)], c: [] } });
    const v = viewFor(s, 'b');
    expect(v.hand.map((c) => c.id)).toEqual(['y', 'q']);
    expect(v.order.find((p) => p.id === 'a')!.cardCount).toBe(1);
    expect(JSON.stringify(v)).not.toContain('"x"');
  });
});

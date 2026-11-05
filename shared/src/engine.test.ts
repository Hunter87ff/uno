import { describe, expect, test } from 'bun:test';
import { CardType, Color, SpecialColor, type Card, COLORS, buildDeck } from './cards';
import {
    type GameState,
    ActionType,
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

const card = (id: string, type: CardType, color: Card['color'], value: number | null = null): Card => ({
    id,
    type,
    color,
    value,
});

/** Builds a deterministic state and overrides fields for targeted rule tests. */
function setup(overrides: Partial<GameState> & { hands?: Record<string, Card[]> } = {}, players = PLAYERS): GameState {
    const s = startRound(players, DEFAULT_RULES, () => 0.5);
    // Neutralise the random starting card so each test controls the top of the discard pile.
    s.discardPile = [card('top', CardType.Number, Color.Red, 9)];
    s.activeColor = Color.Red;
    s.currentIndex = 0;
    s.direction = 1;
    s.pendingDraw = 0;
    s.drawnCardId = null;
    s.unoAlert = null;
    s.winnerId = null;
    s.drawPile = [
        card('d1', CardType.Number, Color.Blue, 1),
        card('d2', CardType.Number, Color.Blue, 2),
        card('d3', CardType.Number, Color.Blue, 3),
        card('d4', CardType.Number, Color.Blue, 4),
        card('d5', CardType.Number, Color.Blue, 5),
        card('d6', CardType.Number, Color.Blue, 6),
        card('d7', CardType.Number, Color.Blue, 7),
        card('d8', CardType.Number, Color.Blue, 8),
    ];
    const { hands, ...rest } = overrides;
    Object.assign(s, rest);
    if (hands) s.hands = hands;
    return s;
}

describe('deck', () => {
    test('has 108 cards with the standard distribution', () => {
        const deck = buildDeck();
        expect(deck.length).toBe(108);
        expect(deck.filter((c) => c.type === CardType.Wild).length).toBe(4);
        expect(deck.filter((c) => c.type === CardType.Wild4).length).toBe(4);
        for (const color of COLORS) {
            expect(deck.filter((c) => c.color === color && c.type === CardType.Number && c.value === 0).length).toBe(1);
            expect(deck.filter((c) => c.color === color && c.type === CardType.Draw2).length).toBe(2);
        }
    });
});

describe('startRound', () => {
    test('deals 7 cards each and leaves a discard pile with a starting card', () => {
        const s = startRound(PLAYERS, DEFAULT_RULES, () => 0.3);
        for (const p of PLAYERS) expect(s.hands[p.id]!.length).toBe(7);
        expect(s.discardPile.length).toBe(1);
        expect(s.discardPile[0]!.type).not.toBe(CardType.Wild4);
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
        expect(() => startRound([{ id: 'a', name: 'A' }], DEFAULT_RULES)).toThrow(GameError);
    });
});

describe('playing cards', () => {
    test('matching color is playable and advances the turn', () => {
        let s = setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3), card('y', CardType.Number, Color.Blue, 4)], b: [card('z', CardType.Number, Color.Green, 1)], c: [card('w', CardType.Number, Color.Green, 2)] } });
        s = applyAction(s, 'a', { type: ActionType.Play, cardId: 'x' });
        expect(s.discardPile.at(-1)!.id).toBe('x');
        expect(s.currentIndex).toBe(1);
    });

    test('non-matching card is rejected', () => {
        const s = setup({ hands: { a: [card('x', CardType.Number, Color.Blue, 3)], b: [], c: [] } });
        expect(() => applyAction(s, 'a', { type: ActionType.Play, cardId: 'x' })).toThrow(GameError);
    });

    test('out-of-turn play is rejected', () => {
        const s = setup({ hands: { a: [], b: [card('x', CardType.Number, Color.Red, 3)], c: [] } });
        expect(() => applyAction(s, 'b', { type: ActionType.Play, cardId: 'x' })).toThrow('not your turn');
    });

    test('wild requires a color and sets the active color', () => {
        const s = setup({ hands: { a: [card('w', CardType.Wild, SpecialColor.Wild)], b: [card('z', CardType.Number, Color.Red, 1)], c: [] } });
        expect(() => applyAction(s, 'a', { type: ActionType.Play, cardId: 'w' })).toThrow('Choose a color');
        const next = applyAction(s, 'a', { type: ActionType.Play, cardId: 'w', color: Color.Green });
        expect(next.activeColor).toBe(Color.Green);
    });

    test('skip skips the next player', () => {
        const s = setup({ hands: { a: [card('s', CardType.Skip, Color.Red), card('k', CardType.Number, Color.Red, 1)], b: [], c: [card('q', CardType.Number, Color.Red, 2)] } });
        const next = applyAction(s, 'a', { type: ActionType.Play, cardId: 's' });
        expect(next.order[next.currentIndex]).toBe('c');
    });

    test('reverse flips direction', () => {
        const s = setup({ hands: { a: [card('r', CardType.Reverse, Color.Red), card('k', CardType.Number, Color.Red, 1)], b: [], c: [card('q', CardType.Number, Color.Red, 2)] } });
        const next = applyAction(s, 'a', { type: ActionType.Play, cardId: 'r' });
        expect(next.direction).toBe(-1);
        expect(next.order[next.currentIndex]).toBe('c');
    });

    test('reverse acts as skip with two players', () => {
        const s = setup({ hands: { a: [card('r', CardType.Reverse, Color.Red), card('k', CardType.Number, Color.Red, 1)], b: [card('q', CardType.Number, Color.Red, 2)] } }, PLAYERS.slice(0, 2));
        const next = applyAction(s, 'a', { type: ActionType.Play, cardId: 'r' });
        expect(next.order[next.currentIndex]).toBe('a');
    });

    test('draw two forces the next player to draw 2 and lose their turn', () => {
        let s = setup({ hands: { a: [card('d', CardType.Draw2, Color.Red), card('k', CardType.Number, Color.Red, 1)], b: [card('q', CardType.Number, Color.Yellow, 2)], c: [] } });
        s = applyAction(s, 'a', { type: ActionType.Play, cardId: 'd' });
        expect(s.pendingDraw).toBe(2);
        expect(() => applyAction(s, 'b', { type: ActionType.Play, cardId: 'q' })).toThrow('must draw 2');
        s = applyAction(s, 'b', { type: ActionType.Draw });
        expect(s.hands.b!.length).toBe(3);
        expect(s.order[s.currentIndex]).toBe('c');
        expect(s.pendingDraw).toBe(0);
    });

    test('stacking lets a draw two be answered with a draw two when enabled', () => {
        let s = setup({ rules: { ...DEFAULT_RULES, stacking: true }, hands: { a: [card('d', CardType.Draw2, Color.Red), card('k', CardType.Number, Color.Red, 1)], b: [card('e', CardType.Draw2, Color.Red), card('m', CardType.Number, Color.Green, 3)], c: [] } });
        s = applyAction(s, 'a', { type: ActionType.Play, cardId: 'd' });
        s = applyAction(s, 'b', { type: ActionType.Play, cardId: 'e' });
        expect(s.pendingDraw).toBe(4);
    });
});

describe('drawing', () => {
    test('drawing is allowed even when a playable card exists', () => {
        const s = setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3)], b: [], c: [] } });
        const next = applyAction(s, 'a', { type: ActionType.Draw });
        expect(next.drawnCardId).toBeTruthy();
    });

    test('cannot pass without drawing first', () => {
        const s = setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3)], b: [], c: [] } });
        expect(() => applyAction(s, 'a', { type: ActionType.Pass })).toThrow('Draw a card before passing');
    });

    test('draw one, may play the drawn card or pass', () => {
        let s = setup({ hands: { a: [card('x', CardType.Number, Color.Blue, 3)], b: [], c: [] } });
        s.drawPile.push(card('drawn', CardType.Number, Color.Red, 5));
        s = applyAction(s, 'a', { type: ActionType.Draw });
        expect(s.drawnCardId).toBe('drawn');
        expect(s.currentIndex).toBe(0);
        expect(() => applyAction(s, 'a', { type: ActionType.Play, cardId: 'x' })).toThrow('just drew');

        // Player can pass after drawing
        const passed = applyAction(s, 'a', { type: ActionType.Pass });
        expect(passed.currentIndex).toBe(1);

        // Or play the drawn card
        const played = applyAction(s, 'a', { type: ActionType.Play, cardId: 'drawn' });
        expect(played.currentIndex).toBe(1);
    });
});

describe('UNO', () => {
    test('going to one card without UNO can be caught for a 2-card penalty', () => {
        let s = setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3), card('y', CardType.Number, Color.Red, 4)], b: [card('z', CardType.Number, Color.Blue, 9)], c: [] } });
        s = applyAction(s, 'a', { type: ActionType.Play, cardId: 'x' });
        expect(s.unoAlert).toBe('a');
        s = applyAction(s, 'b', { type: ActionType.CatchUno, target: 'a' });
        expect(s.hands.a!.length).toBe(3);
        expect(s.unoAlert).toBeNull();
    });

    test('calling UNO prevents the alert', () => {
        const s = applyAction(
            setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3), card('y', CardType.Number, Color.Red, 4)], b: [], c: [] } }),
            'a',
            { type: ActionType.Play, cardId: 'x', uno: true },
        );
        expect(s.unoAlert).toBeNull();
    });

    test('calling UNO clears own catch window if exposed', () => {
        let s = setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3), card('y', CardType.Number, Color.Red, 4)], b: [card('z', CardType.Number, Color.Blue, 9)], c: [] } });
        s = applyAction(s, 'a', { type: ActionType.Play, cardId: 'x' });
        expect(s.unoAlert).toBe('a');
        s = applyAction(s, 'a', { type: ActionType.CallUno });
        expect(s.unoAlert).toBeNull();
        expect(s.unoCalls).toBe(1);
        expect(() => applyAction(s, 'b', { type: ActionType.CatchUno, target: 'a' })).toThrow('There is no UNO to catch');
    });

    test('pressing UNO is counted, announced and does not clear someone else\'s catch window', () => {
        let s = setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3), card('y', CardType.Number, Color.Red, 4)], b: [card('z', CardType.Number, Color.Blue, 9), card('q', CardType.Number, Color.Blue, 2)], c: [] } });
        s = applyAction(s, 'a', { type: ActionType.Play, cardId: 'x' });
        expect(s.unoAlert).toBe('a');
        s = applyAction(s, 'b', { type: ActionType.CallUno });
        expect(s.unoCalls).toBe(1);
        expect(s.unoAlert).toBe('a');
        expect(s.log.at(-1)).toContain('says UNO');
    });

    test('UNO cannot be called with more than two cards', () => {
        const s = setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3), card('y', CardType.Number, Color.Red, 4), card('w', CardType.Number, Color.Red, 5)], b: [], c: [] } });
        expect(() => applyAction(s, 'a', { type: ActionType.CallUno })).toThrow('two or fewer');
    });

    test('the alert is cleared by the next action', () => {
        let s = setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3), card('y', CardType.Number, Color.Red, 4)], b: [card('z', CardType.Number, Color.Blue, 9)], c: [] } });
        s = applyAction(s, 'a', { type: ActionType.Play, cardId: 'x' });
        s = applyAction(s, 'b', { type: ActionType.Draw });
        expect(s.unoAlert).toBeNull();
    });
});

describe('wild draw four', () => {
    test('wild draw four can be played even while holding a matching color and adds 4 pending draws', () => {
        let s = setup({ hands: { a: [card('w4', CardType.Wild4, SpecialColor.Wild), card('r', CardType.Number, Color.Red, 2)], b: [card('r2', CardType.Number, Color.Red, 5)], c: [] } });
        expect(playError(s, 'a', s.hands.a![0]!)).toBeNull();
        s = applyAction(s, 'a', { type: ActionType.Play, cardId: 'w4', color: Color.Blue });
        expect(s.pendingDraw).toBe(4);
        expect(s.activeColor).toBe(Color.Blue);
        expect(s.order[s.currentIndex]).toBe('b');
    });
});

describe('round end and scoring', () => {
    test('going out ends the round and scores opponents cards', () => {
        let s = setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3)], b: [card('y', CardType.Skip, Color.Blue), card('z', CardType.Number, Color.Blue, 4)], c: [card('w', CardType.Wild, SpecialColor.Wild)] } });
        s = applyAction(s, 'a', { type: ActionType.Play, cardId: 'x' });
        expect(s.winnerId).toBe('a');
        expect(roundPoints(s)).toBe(20 + 4 + 50);
        expect(viewFor(s, 'b').currentId).toBeNull();
        expect(() => applyAction(s, 'b', { type: ActionType.Draw })).toThrow('round is over');
    });
});

describe('suggestAction', () => {
    test('auto-plays a legal card for a disconnected player', () => {
        const s = setup({ hands: { a: [card('x', CardType.Number, Color.Blue, 3), card('y', CardType.Number, Color.Red, 4)], b: [], c: [] } });
        const action = suggestAction(s, 'a');
        expect(action).toEqual({ type: ActionType.Play, cardId: 'y', uno: true });
        expect(() => applyAction(s, 'a', action)).not.toThrow();
    });

    test('draws when nothing is playable', () => {
        const s = setup({ hands: { a: [card('x', CardType.Number, Color.Blue, 3)], b: [], c: [] } });
        expect(suggestAction(s, 'a')).toEqual({ type: ActionType.Draw });
    });
});

describe('viewFor', () => {
    test('hides opponents hands but shows counts and own hand', () => {
        const s = setup({ hands: { a: [card('x', CardType.Number, Color.Red, 3)], b: [card('y', CardType.Number, Color.Blue, 4), card('q', CardType.Number, Color.Blue, 6)], c: [] } });
        const v = viewFor(s, 'b');
        expect(v.hand.map((c) => c.id)).toEqual(['y', 'q']);
        expect(v.order.find((p) => p.id === 'a')!.cardCount).toBe(1);
        expect(JSON.stringify(v)).not.toContain('"x"');
    });
});

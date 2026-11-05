import { describe, expect, test } from 'bun:test';
import type { Card, PublicRound, RoomView } from '@uno/shared';
import { soundsForUpdate } from './events';

const card = (id: string, type: Card['type'] = 'number', color: Card['color'] = 'red', value: number | null = 1): Card => ({
  id,
  type,
  color,
  value,
});

function round(overrides: Partial<PublicRound> = {}): PublicRound {
  return {
    order: [
      { id: 'me', name: 'Me', cardCount: 5 },
      { id: 'bob', name: 'Bob', cardCount: 5 },
    ],
    currentId: 'bob',
    direction: 1,
    activeColor: 'red',
    top: card('t1'),
    drawPileCount: 50,
    unoCalls: 0,
    pendingDraw: 0,
    unoAlert: null,
    winnerId: null,
    hand: [],
    playableIds: [],
    drawnCardId: null,
    log: [],
    ...overrides,
  };
}

function room(r: PublicRound | null, status: RoomView['status'] = 'playing'): RoomView {
  return {
    code: 'ABCDE',
    status,
    rules: { stacking: false, targetScore: 500 },
    hostId: 'me',
    you: 'me',
    players: [
      { id: 'me', name: 'Me', connected: true, isHost: true, score: 0 },
      { id: 'bob', name: 'Bob', connected: true, isHost: false, score: 0 },
    ],
    cardsPerPlayer: 7,
    round: r,
    lastRoundPoints: null,
    gameWinnerId: null,
  };
}

describe('soundsForUpdate', () => {
  test('a card played on the pile plays a sound matching its type', () => {
    const before = room(round());
    const after = room(round({ top: card('t2', 'skip') }));
    expect(soundsForUpdate(before, after)).toContain('skip');
  });

  test('my turn starting plays the turn chime', () => {
    const before = room(round({ currentId: 'bob' }));
    const after = room(round({ currentId: 'me' }));
    expect(soundsForUpdate(before, after)).toContain('turn');
  });

  test('a hand growing plays the draw sound', () => {
    const before = room(round());
    const after = room(
      round({
        order: [
          { id: 'me', name: 'Me', cardCount: 6 },
          { id: 'bob', name: 'Bob', cardCount: 5 },
        ],
      }),
    );
    expect(soundsForUpdate(before, after)).toContain('draw');
  });

  test('a catch plays the catch sound, not a draw', () => {
    const before = room(
      round({
        unoAlert: 'bob',
        order: [
          { id: 'me', name: 'Me', cardCount: 5 },
          { id: 'bob', name: 'Bob', cardCount: 1 },
        ],
      }),
    );
    const after = room(
      round({
        unoAlert: null,
        order: [
          { id: 'me', name: 'Me', cardCount: 5 },
          { id: 'bob', name: 'Bob', cardCount: 3 },
        ],
      }),
    );
    const sounds = soundsForUpdate(before, after);
    expect(sounds).toContain('catch');
    expect(sounds).not.toContain('draw');
  });

  test('pressing UNO plays the UNO call', () => {
    const before = room(round());
    const after = room(round({ unoCalls: 1 }));
    expect(soundsForUpdate(before, after)).toContain('uno');
  });

  test('a player left on one card without calling UNO is not announced', () => {
    const before = room(round());
    const after = room(round({ unoAlert: 'bob' }));
    expect(soundsForUpdate(before, after)).not.toContain('uno');
  });

  test('going out plays the round win sound', () => {
    const before = room(round());
    const after = room(round({ winnerId: 'bob' }), 'roundOver');
    expect(soundsForUpdate(before, after)).toContain('roundWin');
  });

  test('a new round plays the shuffle', () => {
    const before = room(round({ winnerId: 'bob' }), 'roundOver');
    const after = room(round(), 'playing');
    expect(soundsForUpdate(before, after)).toContain('shuffle');
  });

  test('an unchanged snapshot plays nothing', () => {
    const before = room(round());
    expect(soundsForUpdate(before, room(round()))).toEqual([]);
  });
});

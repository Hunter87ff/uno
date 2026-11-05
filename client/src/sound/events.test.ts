import { describe, expect, test } from 'bun:test';
import { CardType, Color, RoomStatus, SfxType, type Card, type PublicRound, type RoomView } from '@uno/shared';
import { soundsForUpdate } from './events';

const card = (
    id: string,
    type: Card['type'] = CardType.Number,
    color: Card['color'] = Color.Red,
    value: number | null = 1,
): Card => ({
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
        activeColor: Color.Red,
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

function room(r: PublicRound | null, status: RoomView['status'] = RoomStatus.Playing): RoomView {
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
        const after = room(round({ top: card('t2', CardType.Skip) }));
        expect(soundsForUpdate(before, after)).toContain(SfxType.Skip);
    });

    test('my turn starting plays the turn chime', () => {
        const before = room(round({ currentId: 'bob' }));
        const after = room(round({ currentId: 'me' }));
        expect(soundsForUpdate(before, after)).toContain(SfxType.Turn);
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
        expect(soundsForUpdate(before, after)).toContain(SfxType.Draw);
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
        expect(sounds).toContain(SfxType.Catch);
        expect(sounds).not.toContain(SfxType.Draw);
    });

    test('pressing UNO plays the UNO call', () => {
        const before = room(round());
        const after = room(round({ unoCalls: 1 }));
        expect(soundsForUpdate(before, after)).toContain(SfxType.Uno);
    });

    test('a player left on one card without calling UNO is not announced', () => {
        const before = room(round());
        const after = room(round({ unoAlert: 'bob' }));
        expect(soundsForUpdate(before, after)).not.toContain(SfxType.Uno);
    });

    test('going out plays the round win sound', () => {
        const before = room(round());
        const after = room(round({ winnerId: 'bob' }), RoomStatus.RoundOver);
        expect(soundsForUpdate(before, after)).toContain(SfxType.RoundWin);
    });

    test('a new round plays the shuffle', () => {
        const before = room(round({ winnerId: 'bob' }), RoomStatus.RoundOver);
        const after = room(round(), RoomStatus.Playing);
        expect(soundsForUpdate(before, after)).toContain(SfxType.Shuffle);
    });

    test('an unchanged snapshot plays nothing', () => {
        const before = room(round());
        expect(soundsForUpdate(before, room(round()))).toEqual([]);
    });
});

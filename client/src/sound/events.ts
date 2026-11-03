import type { RoomView } from '@uno/shared';
import type { Sfx } from './sfx';

const TOP_SOUND: Record<string, Sfx> = {
  number: 'play',
  skip: 'skip',
  reverse: 'reverse',
  draw2: 'draw2',
  wild: 'wild',
  wild4: 'wild4',
};

/** Keeps a burst of simultaneous events from turning into noise. */
const MAX_PER_UPDATE = 3;

/**
 * Works out which sounds to play when the room state changes from `before` to `after`.
 * Pure, so it can be tested without audio. The first snapshot should not call this.
 */
export function soundsForUpdate(before: RoomView, after: RoomView): Sfx[] {
  const out: Sfx[] = [];
  const me = after.you;

  // Someone joining the lobby.
  if (after.status === 'lobby' && after.players.length > before.players.length) out.push('join');

  if (!after.round) return out.slice(0, MAX_PER_UPDATE);

  const newRound = !before.round || before.status === 'lobby' || before.status === 'roundOver' || before.status === 'gameOver';
  if (newRound) {
    out.push('shuffle');
    if (after.round.currentId === me) out.push('turn');
    return out.slice(0, MAX_PER_UPDATE);
  }
  const prev = before.round!;
  const cur = after.round;

  if (after.status === 'gameOver' && before.status !== 'gameOver') out.push('gameWin');
  else if (after.status === 'roundOver' && before.status === 'playing') out.push('roundWin');

  if (cur.top.id !== prev.top.id) out.push(TOP_SOUND[cur.top.type] ?? 'play');

  // Catch: the alerted player gained two cards and the alert cleared.
  const alerted = prev.unoAlert;
  const catchHappened =
    alerted !== null &&
    cur.unoAlert === null &&
    (cur.order.find((p) => p.id === alerted)?.cardCount ?? 0) > (prev.order.find((p) => p.id === alerted)?.cardCount ?? 0);
  if (catchHappened) out.push('catch');

  // Anyone's hand grew (and it was not a catch penalty): a draw.
  const grew = cur.order.some((p) => {
    const was = prev.order.find((q) => q.id === p.id)?.cardCount ?? 0;
    return p.cardCount > was;
  });
  if (grew && !catchHappened) out.push('draw');

  // Someone pressed UNO: everyone hears the recorded call.
  if (cur.unoCalls > prev.unoCalls) out.push('uno');
  if (!prev.pendingChallenge && cur.pendingChallenge) out.push('challenge');
  if (cur.currentId === me && prev.currentId !== me) out.push('turn');

  return out.slice(0, MAX_PER_UPDATE);
}

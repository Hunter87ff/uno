import { CardType, RoomStatus, type RoomView, SfxType } from "@uno/shared";

import type { Sfx } from "./sfx";

const TOP_SOUND: Record<CardType, Sfx> = {
	[CardType.Number]: SfxType.Play,
	[CardType.Skip]: SfxType.Skip,
	[CardType.Reverse]: SfxType.Reverse,
	[CardType.Draw2]: SfxType.Draw2,
	[CardType.Wild]: SfxType.Wild,
	[CardType.Wild4]: SfxType.Wild4,
	[CardType.DoubleTrouble]: SfxType.DoubleTrouble,
	[CardType.SwapHands]: SfxType.SwapHands,
	[CardType.Snatch]: SfxType.Snatch,
	[CardType.Shield]: SfxType.Shield,
	[CardType.Wild6]: SfxType.Wild4,
	[CardType.Wild10]: SfxType.Wild4,
};

/** Keeps a burst of simultaneous events from turning into noise. */
const MAX_PER_UPDATE = 3;

/**
 * Works out which sounds to play when the room state changes from `before` to `after`. Pure, so it
 * can be tested without audio. The first snapshot should not call this.
 */
export function soundsForUpdate(before: RoomView, after: RoomView): Sfx[] {
	const out: Sfx[] = [];
	const me = after.you;

	// Someone joining the lobby.
	if (after.status === RoomStatus.Lobby && after.players.length > before.players.length) {
		out.push(SfxType.Join);
	}

	if (!after.round) return out.slice(0, MAX_PER_UPDATE);

	const newRound =
		!before.round ||
		before.status === RoomStatus.Lobby ||
		before.status === RoomStatus.RoundOver ||
		before.status === RoomStatus.GameOver;
	if (newRound) {
		out.push(SfxType.Shuffle);
		if (after.round.currentId === me) out.push(SfxType.Turn);
		return out.slice(0, MAX_PER_UPDATE);
	}
	const prev = before.round!;
	const cur = after.round;

	if (after.status === RoomStatus.GameOver && before.status !== RoomStatus.GameOver) {
		out.push(SfxType.GameWin);
	} else if (after.status === RoomStatus.RoundOver && before.status === RoomStatus.Playing) {
		out.push(SfxType.RoundWin);
	}

	if (cur.top.id !== prev.top.id) out.push(TOP_SOUND[cur.top.type] ?? SfxType.Play);

	// Catch: the alerted player gained two cards and the alert cleared.
	const alerted = prev.unoAlert;
	const catchHappened =
		alerted !== null &&
		cur.unoAlert === null &&
		(cur.order.find((p) => p.id === alerted)?.cardCount ?? 0) >
			(prev.order.find((p) => p.id === alerted)?.cardCount ?? 0);
	if (catchHappened) out.push(SfxType.Catch);

	// Anyone's hand grew (and it was not a catch penalty): a draw.
	const grew = cur.order.some((p) => {
		const was = prev.order.find((q) => q.id === p.id)?.cardCount ?? 0;
		return p.cardCount > was;
	});
	if (grew && !catchHappened) out.push(SfxType.Draw);

	// Someone pressed UNO: everyone hears the recorded call.
	if (cur.unoCalls > prev.unoCalls) out.push(SfxType.Uno);
	if (cur.currentId === me && prev.currentId !== me) out.push(SfxType.Turn);

	return out.slice(0, MAX_PER_UPDATE);
}

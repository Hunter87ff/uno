import type { RoomView } from "@uno/shared";
import { useEffect, useRef } from "react";

import { soundsForUpdate } from "./events";
import { play } from "./sfx";

/** Plays sound effects for changes between successive room snapshots. */
export function useGameSounds(room: RoomView | null): void {
	const previous = useRef<RoomView | null>(null);

	useEffect(() => {
		const before = previous.current;
		previous.current = room;
		if (!room || !before) return;
		for (const sound of soundsForUpdate(before, room)) play(sound);
	}, [room]);
}

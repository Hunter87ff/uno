import { describe, expect, test } from "bun:test";

import { COLORS, SpecialColor } from "./cards";
import {
	type Action,
	ActionType,
	applyAction,
	DEFAULT_RULES,
	type GameState,
	playError,
	startRound,
} from "./engine";

/** Small seeded PRNG so failures are reproducible. */
function lcg(seed: number) {
	let x = seed >>> 0;
	return () => {
		x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
		return x / 2 ** 32;
	};
}

function legalActions(s: GameState): { pid: string; action: Action }[] {
	const out: { pid: string; action: Action }[] = [];
	const current = s.order[s.currentIndex]!;

	const hand = s.hands[current]!;
	for (const card of hand) {
		if (playError(s, current, card) !== null) continue;
		if (card.color === SpecialColor.Wild) {
			for (const color of COLORS) {
				out.push({
					pid: current,
					action: { type: ActionType.Play, cardId: card.id, color, uno: true },
				});
			}
		} else {
			out.push({
				pid: current,
				action: { type: ActionType.Play, cardId: card.id, uno: true },
			});
		}
	}
	if (s.pendingDraw > 0) {
		out.push({ pid: current, action: { type: ActionType.Draw } });
	} else if (s.drawnCardId) {
		out.push({ pid: current, action: { type: ActionType.Pass } });
	} else {
		out.push({ pid: current, action: { type: ActionType.Draw } });
	}

	if (s.unoAlert) {
		const catcher = s.order.find((p) => p !== s.unoAlert)!;
		out.push({ pid: catcher, action: { type: ActionType.CatchUno, target: s.unoAlert } });
	}
	return out;
}

function totalCards(s: GameState): number {
	return (
		Object.values(s.hands).reduce((n, h) => n + h.length, 0) +
		s.drawPile.length +
		s.discardPile.length
	);
}

describe("randomized full games keep engine invariants", () => {
	test("200 games with random legal play never break rules", () => {
		let finished = 0;

		for (let g = 0; g < 200; g++) {
			const rng = lcg(1000 + g);
			const n = 2 + (g % 4); // 2..5 players
			const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
			const rules = { ...DEFAULT_RULES, stacking: g % 2 === 0, targetScore: 500 };
			let s = startRound(players, rules, rng);
			let steps = 0;

			while (!s.winnerId && steps < 4000) {
				expect(totalCards(s)).toBe(108);
				expect(s.pendingDraw).toBeGreaterThanOrEqual(0);
				if (s.drawnCardId) {
					const cur = s.order[s.currentIndex]!;
					expect(s.hands[cur]!.some((c) => c.id === s.drawnCardId)).toBe(true);
				}

				const options = legalActions(s);
				expect(options.length).toBeGreaterThan(0);
				// Prefer plays so games actually finish.
				const plays = options.filter((o) => o.action.type === ActionType.Play);
				const pool = plays.length > 0 && rng() < 0.8 ? plays : options;
				const pick = pool[Math.floor(rng() * pool.length)]!;

				s = applyAction(s, pick.pid, pick.action); // must never throw for a legal option
				steps++;
			}

			if (s.winnerId) {
				finished++;
				expect(s.hands[s.winnerId]!.length).toBe(0);
			}
		}

		expect(finished).toBeGreaterThan(150);
	});
});

import { describe, expect, test } from "bun:test";

import {
	buildDeck,
	type Card,
	CardType,
	changesColor,
	Color,
	COLORS,
	DEFAULT_CUSTOM_CARDS,
	keepsCurrentColor,
	SpecialColor,
} from "./cards";
import {
	ActionType,
	applyAction,
	DEFAULT_RULES,
	GameError,
	type GameState,
	playError,
	roundPoints,
	startRound,
	suggestAction,
	viewFor,
} from "./engine";

const PLAYERS = [
	{ id: "a", name: "Ann" },
	{ id: "b", name: "Bob" },
	{ id: "c", name: "Cy" },
];

const card = (
	id: string,
	type: CardType,
	color: Card["color"],
	value: number | null = null,
): Card => ({
	id,
	type,
	color,
	value,
});

/** Builds a deterministic state and overrides fields for targeted rule tests. */
function setup(
	overrides: Partial<GameState> & { hands?: Record<string, Card[]> } = {},
	players = PLAYERS,
): GameState {
	const s = startRound(players, DEFAULT_RULES, () => 0.5);
	// Neutralise the random starting card so each test controls the top of the discard pile.
	s.discardPile = [card("top", CardType.Number, Color.Red, 9)];
	s.activeColor = Color.Red;
	s.currentIndex = 0;
	s.direction = 1;
	s.pendingDraw = 0;
	s.drawnCardId = null;
	s.unoAlert = null;
	s.winnerId = null;
	s.drawPile = [
		card("d1", CardType.Number, Color.Blue, 1),
		card("d2", CardType.Number, Color.Blue, 2),
		card("d3", CardType.Number, Color.Blue, 3),
		card("d4", CardType.Number, Color.Blue, 4),
		card("d5", CardType.Number, Color.Blue, 5),
		card("d6", CardType.Number, Color.Blue, 6),
		card("d7", CardType.Number, Color.Blue, 7),
		card("d8", CardType.Number, Color.Blue, 8),
	];
	const { hands, ...rest } = overrides;
	Object.assign(s, rest);
	if (hands) s.hands = hands;
	return s;
}

describe("deck", () => {
	test("has 108 cards with the standard distribution", () => {
		const deck = buildDeck();
		expect(deck.length).toBe(108);
		expect(deck.filter((c) => c.type === CardType.Wild).length).toBe(4);
		expect(deck.filter((c) => c.type === CardType.Wild4).length).toBe(4);
		for (const color of COLORS) {
			expect(
				deck.filter((c) => c.color === color && c.type === CardType.Number && c.value === 0)
					.length,
			).toBe(1);
			expect(deck.filter((c) => c.color === color && c.type === CardType.Draw2).length).toBe(
				2,
			);
		}
	});

	test("DEFAULT_CUSTOM_CARDS enables all custom expansion cards by default", () => {
		expect(DEFAULT_CUSTOM_CARDS).toEqual({
			doubleTrouble: true,
			swapHands: true,
			snatch: true,
			shield: true,
			wild6: true,
			wild10: true,
		});

		const defaultDeck = buildDeck(DEFAULT_CUSTOM_CARDS);
		expect(defaultDeck.length).toBe(119);
		expect(defaultDeck.filter((c) => c.type === CardType.DoubleTrouble).length).toBe(2);
		expect(defaultDeck.filter((c) => c.type === CardType.SwapHands).length).toBe(2);
		expect(defaultDeck.filter((c) => c.type === CardType.Snatch).length).toBe(2);
		expect(defaultDeck.filter((c) => c.type === CardType.Shield).length).toBe(1);
		expect(defaultDeck.filter((c) => c.type === CardType.Wild6).length).toBe(2);
		expect(defaultDeck.filter((c) => c.type === CardType.Wild10).length).toBe(2);
	});

	test("identifies cards that change color vs keep current active color", () => {
		const wild = card("w", CardType.Wild, SpecialColor.Wild);
		const wild4 = card("w4", CardType.Wild4, SpecialColor.Wild);
		const wild6 = card("w6", CardType.Wild6, SpecialColor.Wild);
		const wild10 = card("w10", CardType.Wild10, SpecialColor.Wild);
		const dt = card("dt", CardType.DoubleTrouble, SpecialColor.Wild);
		const sh = card("sh", CardType.SwapHands, SpecialColor.Wild);
		const sn = card("sn", CardType.Snatch, SpecialColor.Wild);
		const shield = card("shld", CardType.Shield, SpecialColor.Wild);

		expect(changesColor(wild)).toBe(true);
		expect(changesColor(wild4)).toBe(true);
		expect(changesColor(wild6)).toBe(true);
		expect(changesColor(wild10)).toBe(true);

		expect(changesColor(dt)).toBe(false);
		expect(changesColor(sh)).toBe(false);
		expect(changesColor(sn)).toBe(false);
		expect(changesColor(shield)).toBe(false);

		expect(keepsCurrentColor(dt)).toBe(true);
		expect(keepsCurrentColor(sh)).toBe(true);
		expect(keepsCurrentColor(sn)).toBe(true);
		expect(keepsCurrentColor(shield)).toBe(true);
	});
});

describe("startRound", () => {
	test("deals 7 cards each and leaves a discard pile with a starting card", () => {
		const s = startRound(PLAYERS, DEFAULT_RULES, () => 0.3);
		for (const p of PLAYERS) expect(s.hands[p.id]!.length).toBe(7);
		expect(s.discardPile.length).toBe(1);
		expect(s.discardPile[0]!.type).not.toBe(CardType.Wild4);
		expect(
			s.hands.a!.length + s.hands.b!.length + s.hands.c!.length + s.drawPile.length + 1,
		).toBe(buildDeck(DEFAULT_RULES.cards).length);
	});

	test("deals the requested number of cards and rejects impossible counts", () => {
		const s = startRound(PLAYERS, DEFAULT_RULES, () => 0.3, 4);
		for (const p of PLAYERS) expect(s.hands[p.id]!.length).toBe(4);
		expect(() => startRound(PLAYERS, DEFAULT_RULES, Math.random, 1)).toThrow(
			"between 2 and 15",
		);
		expect(() => startRound(PLAYERS, DEFAULT_RULES, Math.random, 16)).toThrow(
			"between 2 and 15",
		);
		const ten = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
		expect(() => startRound(ten, DEFAULT_RULES, Math.random, 12)).toThrow("do not fit");
		expect(() => startRound(ten, DEFAULT_RULES, Math.random, 10)).not.toThrow();
	});

	test("requires at least two players", () => {
		expect(() => startRound([{ id: "a", name: "A" }], DEFAULT_RULES)).toThrow(GameError);
	});
});

describe("playing cards", () => {
	test("matching color is playable and advances the turn", () => {
		let s = setup({
			hands: {
				a: [
					card("x", CardType.Number, Color.Red, 3),
					card("y", CardType.Number, Color.Blue, 4),
				],
				b: [card("z", CardType.Number, Color.Green, 1)],
				c: [card("w", CardType.Number, Color.Green, 2)],
			},
		});
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "x" });
		expect(s.discardPile.at(-1)!.id).toBe("x");
		expect(s.currentIndex).toBe(1);
	});

	test("non-matching card is rejected", () => {
		const s = setup({
			hands: { a: [card("x", CardType.Number, Color.Blue, 3)], b: [], c: [] },
		});
		expect(() => applyAction(s, "a", { type: ActionType.Play, cardId: "x" })).toThrow(
			GameError,
		);
	});

	test("out-of-turn play is rejected", () => {
		const s = setup({ hands: { a: [], b: [card("x", CardType.Number, Color.Red, 3)], c: [] } });
		expect(() => applyAction(s, "b", { type: ActionType.Play, cardId: "x" })).toThrow(
			"not your turn",
		);
	});

	test("wild requires a color and sets the active color", () => {
		const s = setup({
			hands: {
				a: [card("w", CardType.Wild, SpecialColor.Wild)],
				b: [card("z", CardType.Number, Color.Red, 1)],
				c: [],
			},
		});
		expect(() => applyAction(s, "a", { type: ActionType.Play, cardId: "w" })).toThrow(
			"Choose a color",
		);
		const next = applyAction(s, "a", {
			type: ActionType.Play,
			cardId: "w",
			color: Color.Green,
		});
		expect(next.activeColor).toBe(Color.Green);
	});

	test("skip skips the next player", () => {
		const s = setup({
			hands: {
				a: [card("s", CardType.Skip, Color.Red), card("k", CardType.Number, Color.Red, 1)],
				b: [],
				c: [card("q", CardType.Number, Color.Red, 2)],
			},
		});
		const next = applyAction(s, "a", { type: ActionType.Play, cardId: "s" });
		expect(next.order[next.currentIndex]).toBe("c");
	});

	test("reverse flips direction", () => {
		const s = setup({
			hands: {
				a: [
					card("r", CardType.Reverse, Color.Red),
					card("k", CardType.Number, Color.Red, 1),
				],
				b: [],
				c: [card("q", CardType.Number, Color.Red, 2)],
			},
		});
		const next = applyAction(s, "a", { type: ActionType.Play, cardId: "r" });
		expect(next.direction).toBe(-1);
		expect(next.order[next.currentIndex]).toBe("c");
	});

	test("reverse acts as skip with two players", () => {
		const s = setup(
			{
				hands: {
					a: [
						card("r", CardType.Reverse, Color.Red),
						card("k", CardType.Number, Color.Red, 1),
					],
					b: [card("q", CardType.Number, Color.Red, 2)],
				},
			},
			PLAYERS.slice(0, 2),
		);
		const next = applyAction(s, "a", { type: ActionType.Play, cardId: "r" });
		expect(next.order[next.currentIndex]).toBe("a");
	});

	test("draw two forces the next player to draw 2 and lose their turn", () => {
		let s = setup({
			hands: {
				a: [card("d", CardType.Draw2, Color.Red), card("k", CardType.Number, Color.Red, 1)],
				b: [card("q", CardType.Number, Color.Yellow, 2)],
				c: [],
			},
		});
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "d" });
		expect(s.pendingDraw).toBe(2);
		expect(() => applyAction(s, "b", { type: ActionType.Play, cardId: "q" })).toThrow(
			"must draw 2",
		);
		s = applyAction(s, "b", { type: ActionType.Draw });
		expect(s.hands.b!.length).toBe(3);
		expect(s.order[s.currentIndex]).toBe("c");
		expect(s.pendingDraw).toBe(0);
	});

	test("stacking lets a draw two be answered with a draw two when enabled", () => {
		let s = setup({
			rules: { ...DEFAULT_RULES, stacking: true },
			hands: {
				a: [card("d", CardType.Draw2, Color.Red), card("k", CardType.Number, Color.Red, 1)],
				b: [
					card("e", CardType.Draw2, Color.Red),
					card("m", CardType.Number, Color.Green, 3),
				],
				c: [],
			},
		});
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "d" });
		s = applyAction(s, "b", { type: ActionType.Play, cardId: "e" });
		expect(s.pendingDraw).toBe(4);
	});
});

describe("drawing", () => {
	test("drawing is allowed even when a playable card exists", () => {
		const s = setup({ hands: { a: [card("x", CardType.Number, Color.Red, 3)], b: [], c: [] } });
		const next = applyAction(s, "a", { type: ActionType.Draw });
		expect(next.drawnCardId).toBeTruthy();
	});

	test("cannot pass without drawing first", () => {
		const s = setup({ hands: { a: [card("x", CardType.Number, Color.Red, 3)], b: [], c: [] } });
		expect(() => applyAction(s, "a", { type: ActionType.Pass })).toThrow(
			"Draw a card before passing",
		);
	});

	test("draw one, may play the drawn card or pass", () => {
		let s = setup({ hands: { a: [card("x", CardType.Number, Color.Blue, 3)], b: [], c: [] } });
		s.drawPile.push(card("drawn", CardType.Number, Color.Red, 5));
		s = applyAction(s, "a", { type: ActionType.Draw });
		expect(s.drawnCardId).toBe("drawn");
		expect(s.currentIndex).toBe(0);
		expect(() => applyAction(s, "a", { type: ActionType.Play, cardId: "x" })).toThrow(
			"just drew",
		);

		// Player can pass after drawing
		const passed = applyAction(s, "a", { type: ActionType.Pass });
		expect(passed.currentIndex).toBe(1);

		// Or play the drawn card
		const played = applyAction(s, "a", { type: ActionType.Play, cardId: "drawn" });
		expect(played.currentIndex).toBe(1);
	});
});

describe("UNO", () => {
	test("going to one card without UNO can be caught for a 2-card penalty", () => {
		let s = setup({
			hands: {
				a: [
					card("x", CardType.Number, Color.Red, 3),
					card("y", CardType.Number, Color.Red, 4),
				],
				b: [card("z", CardType.Number, Color.Blue, 9)],
				c: [],
			},
		});
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "x" });
		expect(s.unoAlert).toBe("a");
		s = applyAction(s, "b", { type: ActionType.CatchUno, target: "a" });
		expect(s.hands.a!.length).toBe(3);
		expect(s.unoAlert).toBeNull();
	});

	test("calling UNO prevents the alert", () => {
		const s = applyAction(
			setup({
				hands: {
					a: [
						card("x", CardType.Number, Color.Red, 3),
						card("y", CardType.Number, Color.Red, 4),
					],
					b: [],
					c: [],
				},
			}),
			"a",
			{ type: ActionType.Play, cardId: "x", uno: true },
		);
		expect(s.unoAlert).toBeNull();
	});

	test("calling UNO clears own catch window if exposed", () => {
		let s = setup({
			hands: {
				a: [
					card("x", CardType.Number, Color.Red, 3),
					card("y", CardType.Number, Color.Red, 4),
				],
				b: [card("z", CardType.Number, Color.Blue, 9)],
				c: [],
			},
		});
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "x" });
		expect(s.unoAlert).toBe("a");
		s = applyAction(s, "a", { type: ActionType.CallUno });
		expect(s.unoAlert).toBeNull();
		expect(s.unoCalls).toBe(1);
		expect(() => applyAction(s, "b", { type: ActionType.CatchUno, target: "a" })).toThrow(
			"There is no UNO to catch",
		);
	});

	test("pressing UNO is counted, announced and does not clear someone else's catch window", () => {
		let s = setup({
			hands: {
				a: [
					card("x", CardType.Number, Color.Red, 3),
					card("y", CardType.Number, Color.Red, 4),
				],
				b: [
					card("z", CardType.Number, Color.Blue, 9),
					card("q", CardType.Number, Color.Blue, 2),
				],
				c: [],
			},
		});
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "x" });
		expect(s.unoAlert).toBe("a");
		s = applyAction(s, "b", { type: ActionType.CallUno });
		expect(s.unoCalls).toBe(1);
		expect(s.unoAlert).toBe("a");
		expect(s.log.at(-1)).toContain("says UNO");
	});

	test("UNO cannot be called with more than two cards", () => {
		const s = setup({
			hands: {
				a: [
					card("x", CardType.Number, Color.Red, 3),
					card("y", CardType.Number, Color.Red, 4),
					card("w", CardType.Number, Color.Red, 5),
				],
				b: [],
				c: [],
			},
		});
		expect(() => applyAction(s, "a", { type: ActionType.CallUno })).toThrow("two or fewer");
	});

	test("the alert is cleared by the next action", () => {
		let s = setup({
			hands: {
				a: [
					card("x", CardType.Number, Color.Red, 3),
					card("y", CardType.Number, Color.Red, 4),
				],
				b: [card("z", CardType.Number, Color.Blue, 9)],
				c: [],
			},
		});
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "x" });
		s = applyAction(s, "b", { type: ActionType.Draw });
		expect(s.unoAlert).toBeNull();
	});
});

describe("wild draw four", () => {
	test("wild draw four can be played even while holding a matching color and adds 4 pending draws", () => {
		let s = setup({
			hands: {
				a: [
					card("w4", CardType.Wild4, SpecialColor.Wild),
					card("r", CardType.Number, Color.Red, 2),
				],
				b: [card("r2", CardType.Number, Color.Red, 5)],
				c: [],
			},
		});
		expect(playError(s, "a", s.hands.a![0]!)).toBeNull();
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "w4", color: Color.Blue });
		expect(s.pendingDraw).toBe(4);
		expect(s.activeColor).toBe(Color.Blue);
		expect(s.order[s.currentIndex]).toBe("b");
	});
});

describe("round end and scoring", () => {
	test("going out ends the round and scores opponents cards", () => {
		let s = setup({
			hands: {
				a: [card("x", CardType.Number, Color.Red, 3)],
				b: [
					card("y", CardType.Skip, Color.Blue),
					card("z", CardType.Number, Color.Blue, 4),
				],
				c: [card("w", CardType.Wild, SpecialColor.Wild)],
			},
		});
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "x" });
		expect(s.winnerId).toBe("a");
		expect(roundPoints(s)).toBe(20 + 4 + 50);
		expect(viewFor(s, "b").currentId).toBeNull();
		expect(() => applyAction(s, "b", { type: ActionType.Draw })).toThrow("round is over");
	});
});

describe("suggestAction", () => {
	test("auto-plays a legal card for a disconnected player", () => {
		const s = setup({
			hands: {
				a: [
					card("x", CardType.Number, Color.Blue, 3),
					card("y", CardType.Number, Color.Red, 4),
				],
				b: [],
				c: [],
			},
		});
		const action = suggestAction(s, "a");
		expect(action).toEqual({ type: ActionType.Play, cardId: "y", uno: true });
		expect(() => applyAction(s, "a", action)).not.toThrow();
	});

	test("draws when nothing is playable", () => {
		const s = setup({
			hands: { a: [card("x", CardType.Number, Color.Blue, 3)], b: [], c: [] },
		});
		expect(suggestAction(s, "a")).toEqual({ type: ActionType.Draw });
	});
});

describe("viewFor", () => {
	test("hides opponents hands but shows counts and own hand", () => {
		const s = setup({
			hands: {
				a: [card("x", CardType.Number, Color.Red, 3)],
				b: [
					card("y", CardType.Number, Color.Blue, 4),
					card("q", CardType.Number, Color.Blue, 6),
				],
				c: [],
			},
		});
		const v = viewFor(s, "b");
		expect(v.hand.map((c) => c.id)).toEqual(["y", "q"]);
		expect(v.order.find((p) => p.id === "a")!.cardCount).toBe(1);
		expect(JSON.stringify(v)).not.toContain('"x"');
	});
});

describe("plus card stacking", () => {
	test("allows playing same or higher plus cards to stack draw penalty", () => {
		let s = setup({
			rules: {
				stacking: true,
				targetScore: 500,
				turnTimer: 30,
				eliminationLimit: null,
				cards: {
					doubleTrouble: true,
					swapHands: true,
					snatch: true,
					shield: true,
					wild6: true,
					wild10: true,
				},
			},
			hands: {
				a: [
					card("d2", CardType.Draw2, Color.Red),
					card("extra_a", CardType.Number, Color.Red, 1),
				],
				b: [
					card("w4", CardType.Wild4, SpecialColor.Wild),
					card("other", CardType.Number, Color.Blue, 1),
				],
				c: [
					card("w6", CardType.Wild6, SpecialColor.Wild),
					card("other2", CardType.Number, Color.Blue, 2),
				],
			},
		});

		// Player A plays +2
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "d2" });
		expect(s.pendingDraw).toBe(2);
		expect(s.order[s.currentIndex]).toBe("b");

		// Player B stacks +4 on top of +2
		s = applyAction(s, "b", { type: ActionType.Play, cardId: "w4", color: Color.Green });
		expect(s.pendingDraw).toBe(6);
		expect(s.order[s.currentIndex]).toBe("c");

		// Player C stacks +6 on top of +4
		s = applyAction(s, "c", { type: ActionType.Play, cardId: "w6", color: Color.Red });
		expect(s.pendingDraw).toBe(12);
		expect(s.order[s.currentIndex]).toBe("a");
	});

	test("rejects playing a lower plus card on a higher plus card", () => {
		let s = setup({
			rules: {
				stacking: true,
				targetScore: 500,
				turnTimer: 30,
				eliminationLimit: null,
				cards: {
					doubleTrouble: true,
					swapHands: true,
					snatch: true,
					shield: true,
					wild6: true,
					wild10: true,
				},
			},
			hands: {
				a: [
					card("w4", CardType.Wild4, SpecialColor.Wild),
					card("extra_a", CardType.Number, Color.Red, 1),
				],
				b: [
					card("d2", CardType.Draw2, Color.Red),
					card("extra_b", CardType.Number, Color.Blue, 1),
				],
				c: [],
			},
		});

		s = applyAction(s, "a", { type: ActionType.Play, cardId: "w4", color: Color.Red });
		expect(s.pendingDraw).toBe(4);

		// Player B tries to stack +2 on +4 -> rejected!
		expect(playError(s, "b", s.hands.b![0]!)).toBe("You must draw 4 cards");
		expect(() => applyAction(s, "b", { type: ActionType.Play, cardId: "d2" })).toThrow(
			"You must draw 4 cards",
		);
	});
});

describe("new cards: Double Trouble", () => {
	test("allows playing two cards in one turn and preserves current active color", () => {
		let s = setup({
			activeColor: Color.Red,
			hands: {
				a: [
					card("dt", CardType.DoubleTrouble, SpecialColor.Wild),
					card("n1", CardType.Number, Color.Red, 5),
					card("n2", CardType.Number, Color.Yellow, 2),
				],
				b: [card("b1", CardType.Number, Color.Red, 1)],
				c: [],
			},
		});

		// Player A plays Double Trouble without choosing a color
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "dt" });
		expect(s.extraPlays).toBe(1);
		expect(s.activeColor).toBe(Color.Red); // keeps active color
		expect(s.order[s.currentIndex]).toBe("a"); // turn stays with player A!

		// Player A plays their second card matching the active color
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "n1" });
		expect(s.extraPlays).toBe(0);
		expect(s.order[s.currentIndex]).toBe("b"); // turn now advances to player B!
	});
});

describe("new cards: Swap Hands", () => {
	test("all players swap their hands in current direction and preserves color", () => {
		let s = setup({
			activeColor: Color.Green,
			hands: {
				a: [card("sh", CardType.SwapHands, SpecialColor.Wild)],
				b: [
					card("b1", CardType.Number, Color.Blue, 1),
					card("b2", CardType.Number, Color.Blue, 2),
				],
				c: [card("c1", CardType.Number, Color.Green, 3)],
			},
		});

		s = applyAction(s, "a", { type: ActionType.Play, cardId: "sh" });
		expect(s.activeColor).toBe(Color.Green);
		expect(s.winnerId).toBe("a");
	});

	test("swaps hands when players have cards remaining", () => {
		let s = setup({
			activeColor: Color.Red,
			hands: {
				a: [
					card("sh", CardType.SwapHands, SpecialColor.Wild),
					card("a1", CardType.Number, Color.Red, 9),
				],
				b: [
					card("b1", CardType.Number, Color.Blue, 1),
					card("b2", CardType.Number, Color.Blue, 2),
				],
				c: [card("c1", CardType.Number, Color.Green, 3)],
			},
		});

		s = applyAction(s, "a", { type: ActionType.Play, cardId: "sh" });

		expect(s.activeColor).toBe(Color.Red);
		expect(s.hands.a!.map((c) => c.id)).toEqual(["c1"]);
		expect(s.hands.b!.map((c) => c.id)).toEqual(["a1"]);
		expect(s.hands.c!.map((c) => c.id)).toEqual(["b1", "b2"]);
		expect(s.order[s.currentIndex]).toBe("b");
	});
});

describe("new cards: Snatch", () => {
	test("swaps entire hand directly with the target player and preserves color", () => {
		let s = setup({
			activeColor: Color.Yellow,
			hands: {
				a: [
					card("sn", CardType.Snatch, SpecialColor.Wild),
					card("a1", CardType.Number, Color.Red, 1),
					card("a2", CardType.Number, Color.Blue, 2),
				],
				b: [card("b1", CardType.Number, Color.Green, 5)],
				c: [card("c1", CardType.Number, Color.Green, 3)],
			},
		});

		s = applyAction(s, "a", {
			type: ActionType.Play,
			cardId: "sn",
			target: "b",
		});
		// Player a had [sn, a1, a2]. sn was played, leaving [a1, a2].
		// Player b had [b1]. They swap hands:
		expect(s.activeColor).toBe(Color.Yellow);
		expect(s.hands.a!.map((c) => c.id)).toEqual(["b1"]);
		expect(s.hands.b!.map((c) => c.id)).toEqual(["a1", "a2"]);
		expect(s.hands.c!.map((c) => c.id)).toEqual(["c1"]);
		expect(s.order[s.currentIndex]).toBe("b");
	});

	test("shield protects target from snatch swap", () => {
		let s = setup({
			activeColor: Color.Yellow,
			shielded: { b: true },
			hands: {
				a: [
					card("sn", CardType.Snatch, SpecialColor.Wild),
					card("a1", CardType.Number, Color.Red, 1),
				],
				b: [card("b1", CardType.Number, Color.Green, 5)],
				c: [card("c1", CardType.Number, Color.Green, 3)],
			},
		});

		s = applyAction(s, "a", {
			type: ActionType.Play,
			cardId: "sn",
			target: "b",
		});
		// Shield absorbed the snatch: hands remain unchanged!
		expect(s.shielded.b).toBe(false);
		expect(s.hands.a!.map((c) => c.id)).toEqual(["a1"]);
		expect(s.hands.b!.map((c) => c.id)).toEqual(["b1"]);
		expect(s.order[s.currentIndex]).toBe("b");
	});
});

describe("new cards: Shield", () => {
	test("shield can be used anytime to absorb pending draws", () => {
		let s = setup({
			hands: {
				a: [
					card("d2", CardType.Draw2, Color.Red),
					card("extra_a", CardType.Number, Color.Red, 1),
				],
				b: [
					card("shld", CardType.Shield, SpecialColor.Wild),
					card("b1", CardType.Number, Color.Blue, 1),
				],
				c: [],
			},
		});

		// Player A plays +2
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "d2" });
		expect(s.pendingDraw).toBe(2);
		expect(s.order[s.currentIndex]).toBe("b");

		// Player B uses Shield card to absorb pending draw
		s = applyAction(s, "b", { type: ActionType.PlayShield, cardId: "shld" });
		expect(s.pendingDraw).toBe(0); // absorbed!
		expect(s.order[s.currentIndex]).toBe("b"); // still player B's turn to play!
	});

	test("shield protects against skip", () => {
		let s = setup({
			hands: {
				a: [
					card("sk", CardType.Skip, Color.Red),
					card("extra_a", CardType.Number, Color.Red, 1),
				],
				b: [
					card("shld", CardType.Shield, SpecialColor.Wild),
					card("b1", CardType.Number, Color.Blue, 1),
				],
				c: [card("c1", CardType.Number, Color.Green, 2)],
			},
		});

		// Player B activates shield out of turn before A plays
		s = applyAction(s, "b", { type: ActionType.PlayShield, cardId: "shld" });
		expect(s.shielded.b).toBe(true);

		// Player A plays Skip targeting B
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "sk" });
		// B's shield absorbed the skip! Turn goes to B instead of skipping to C!
		expect(s.shielded.b).toBe(false);
		expect(s.order[s.currentIndex]).toBe("b");
	});
});

describe("elimination card limit", () => {
	test("eliminates players who exceed the max card limit and declares last survivor winner", () => {
		let s = setup({
			rules: {
				stacking: false,
				targetScore: 500,
				turnTimer: 30,
				eliminationLimit: 4, // Max 4 cards
				cards: {
					doubleTrouble: false,
					swapHands: false,
					snatch: false,
					shield: false,
					wild6: false,
					wild10: false,
				},
			},
			hands: {
				a: [
					card("d2", CardType.Draw2, Color.Red),
					card("extra_a", CardType.Number, Color.Red, 1),
				],
				b: [
					card("b1", CardType.Number, Color.Blue, 1),
					card("b2", CardType.Number, Color.Blue, 2),
					card("b3", CardType.Number, Color.Blue, 3),
				],
				c: [card("c1", CardType.Number, Color.Green, 1)],
			},
		});

		// Player A plays Draw2. B had 3 cards, draws 2 -> 5 cards > limit of 4!
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "d2" });
		s = applyAction(s, "b", { type: ActionType.Draw });

		// Player B should be eliminated!
		expect(s.eliminated).toContain("b");
		expect(s.order).not.toContain("b");
		expect(s.order).toEqual(["a", "c"]);
	});

	test("awards points from eliminated player hand to the round winner", () => {
		// Player A plays Wild 10. Player B holds 6 cards, draws 10 cards -> 16 cards > limit of 15!
		// Player B is eliminated. Player A is the sole survivor and wins.
		const bCards = [
			card("b1", CardType.Number, Color.Blue, 5),
			card("b2", CardType.Number, Color.Blue, 5),
			card("b3", CardType.Draw2, Color.Red), // 20 pts
			card("b4", CardType.Wild, SpecialColor.Wild), // 50 pts
			card("b5", CardType.Number, Color.Green, 8),
			card("b6", CardType.Number, Color.Yellow, 2),
		];
		let s = setup(
			{
				rules: {
					stacking: false,
					targetScore: 500,
					turnTimer: 30,
					eliminationLimit: 15, // Limit is 15 cards
					cards: {
						doubleTrouble: false,
						swapHands: false,
						snatch: false,
						shield: false,
						wild6: false,
						wild10: true,
					},
				},
				hands: {
					a: [
						card("w10", CardType.Wild10, SpecialColor.Wild),
						card("extra_a", CardType.Number, Color.Red, 1),
					],
					b: bCards,
				},
			},
			[PLAYERS[0]!, PLAYERS[1]!],
		);

		// Draw pile has 10 cards for B to draw
		s.drawPile = Array.from({ length: 10 }, (_, i) =>
			card(`dp${i}`, CardType.Number, Color.Red, 1),
		); // 10 * 1 = 10 pts

		// A plays +10
		s = applyAction(s, "a", { type: ActionType.Play, cardId: "w10", color: Color.Red });
		expect(s.pendingDraw).toBe(10);

		// B draws 10 cards: B now has 16 cards, exceeding the limit of 15!
		s = applyAction(s, "b", { type: ActionType.Draw });

		// B is eliminated, A is winner
		expect(s.eliminated).toContain("b");
		expect(s.winnerId).toBe("a");

		// B had 5 + 5 + 20 + 50 + 8 + 2 = 90 pts, plus 10 drawn cards of 1 pt each = 100 pts total
		const points = roundPoints(s);
		expect(points).toBe(100);
	});
});

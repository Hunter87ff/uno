import { buildDeck, cardPoints, CardType, type Card, Color, COLORS, shuffle, SpecialColor } from "../cards";
import { GameError } from "./errors";
import { FORBIDDEN_STARTING_CARDS } from "./constants";
import { currentPlayer, describeCard, log, nameOf, passTurn } from "./helpers";
import { CARDS_PER_PLAYER, DEFAULT_RULES, type GameState, type PlayerInfo, type Rules } from "./types";

/**
 * Initializes a new round: shuffles a fresh deck (including enabled custom cards), deals
 * `cardsPerPlayer` cards, flips the starting card, and applies starting card effects per official
 * rules.
 */
export function startRound(
    players: PlayerInfo[],
    rules: Rules,
    rng: () => number = Math.random,
    cardsPerPlayer: number = CARDS_PER_PLAYER.default,
): GameState {
    const finalRules: Rules = {
        ...DEFAULT_RULES,
        ...rules,
        cards: { ...DEFAULT_RULES.cards, ...(rules?.cards ?? {}) },
    };
    if (players.length < 2) throw new GameError("At least two players are required");
    const dealCount = Math.floor(cardsPerPlayer);
    if (dealCount < CARDS_PER_PLAYER.min || dealCount > CARDS_PER_PLAYER.max) {
        throw new GameError(
            `Cards per player must be between ${CARDS_PER_PLAYER.min} and ${CARDS_PER_PLAYER.max}`,
        );
    }

    const deck = shuffle(buildDeck(finalRules.cards), rng);
    if (players.length * dealCount + 1 > deck.length) {
        throw new GameError(
            `${players.length} players with ${dealCount} cards each do not fit in the deck (${deck.length} cards)`,
        );
    }

    const hands: Record<string, Card[]> = {};
    const names: Record<string, string> = {};
    for (const player of players) {
        hands[player.id] = deck.splice(deck.length - dealCount, dealCount);
        names[player.id] = player.name;
    }

    // Per official rules, a Wild Draw Four and special wild expansion cards cannot be the starting
    // card: if flipped, return them to the bottom of the deck and draw another.
    const discard: Card[] = [];
    let startingCard = deck.pop()!;
    while (FORBIDDEN_STARTING_CARDS.has(startingCard.type)) {
        deck.unshift(startingCard);
        startingCard = deck.pop()!;
    }
    discard.push(startingCard);

    const state: GameState = {
        rules: finalRules,
        order: players.map((player) => player.id),
        eliminated: [],
        names,
        hands,
        drawPile: deck,
        discardPile: discard,
        currentIndex: 0,
        direction: 1,
        activeColor: Color.Red,
        pendingDraw: 0,
        drawnCardId: null,
        extraPlays: 0,
        shielded: {},
        unoAlert: null,
        unoCalls: 0,
        winnerId: null,
        log: [],
        eliminatedPoints: 0,
    };

    // If the starter is a wild card, pick a random starting color.
    state.activeColor =
        startingCard.color === SpecialColor.Wild
            ? COLORS[Math.floor(rng() * COLORS.length)]!
            : (startingCard.color as Color);

    log(state, `Round started. Starting card is ${describeCard(startingCard, state.activeColor)}.`);

    // Apply starting card effects.
    switch (startingCard.type) {
        case CardType.Skip:
            log(state, `${nameOf(state, currentPlayer(state))} is skipped.`);
            passTurn(state, 1);
            break;
        case CardType.Reverse:
            state.direction = -1;
            log(state, "Play direction reversed.");
            break;
        case CardType.Draw2:
            state.pendingDraw = 2;
            break;
        default:
            break;
    }

    return state;
}

/** Calculates points awarded to the round winner from cards left in opponents' hands. */
export function roundPoints(state: GameState): number {
    if (!state.winnerId) return 0;
    let total = state.eliminatedPoints;
    for (const [playerId, hand] of Object.entries(state.hands)) {
        if (playerId === state.winnerId) continue;
        for (const card of hand) total += cardPoints(card);
    }
    return total;
}

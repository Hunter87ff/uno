import { changesColor, isWild, keepsCurrentColor, type Card, CardType, COLORS } from "../cards";
import { ActionType, Color } from "../types";
import { DRAW_PENALTY, LABELS } from "./constants";
import { GameError } from "./errors";
import { isPlayable, playError } from "./legality";
import {
    absorbWithShield,
    checkAllEliminations,
    checkElimination,
    currentPlayer,
    describeCard,
    drawCards,
    log,
    mod,
    mostCommonColor,
    nameOf,
    passTurn,
} from "./helpers";
import type { Action, GameState } from "./types";

type PlayAction = Extract<Action, { type: ActionType.Play }>;

/**
 * Applies `action` by `playerId` and returns the NEW state. The input state is never mutated.
 * Throws `GameError` if the action is illegal.
 */
export function applyAction(state: GameState, playerId: string, action: Action): GameState {
    if (state.winnerId) throw new GameError("The round is over");
    const workingState = structuredClone(state);

    // Playing a shield is only allowed on the player's own turn
    if (action.type === ActionType.PlayShield) {
        requireTurn(workingState, playerId);
        return playShieldCard(workingState, playerId, action.cardId);
    }

    // Only a normal action closes the UNO catch window; calling UNO or catching does not.
    if (action.type !== ActionType.CatchUno && action.type !== ActionType.CallUno) {
        workingState.unoAlert = null;
    }

    switch (action.type) {
        case ActionType.Play:
            return playCard(workingState, playerId, action);
        case ActionType.Draw:
            return drawCard(workingState, playerId);
        case ActionType.Pass:
            return passTurnAfterDrawing(workingState, playerId);
        case ActionType.CatchUno:
            return catchUno(workingState, playerId, action.target);
        case ActionType.CallUno:
            return callUno(workingState, playerId);
        default:
            throw new GameError("Unknown action");
    }
}

function requireTurn(state: GameState, playerId: string): void {
    if (currentPlayer(state) !== playerId) throw new GameError("It is not your turn");
}

/** Plays the Shield card on the player's own turn (also reachable via the normal Play action). */
function playShieldCard(state: GameState, playerId: string, cardId: string): GameState {
    const hand = state.hands[playerId];
    if (!hand) throw new GameError("You have no cards in hand");
    const cardIndex = hand.findIndex((card) => card.id === cardId);
    if (cardIndex === -1) throw new GameError("That card is not in your hand");
    const card = hand[cardIndex]!;
    if (card.type !== CardType.Shield) throw new GameError("That card is not a Shield card");

    hand.splice(cardIndex, 1);
    state.discardPile.push(card);
    if (state.drawnCardId === cardId) state.drawnCardId = null;
    log(state, `${nameOf(state, playerId)} activated a Shield!`);

    // A shield facing pending draws absorbs them immediately; otherwise it guards future effects
    if (state.pendingDraw > 0) {
        log(state, `${nameOf(state, playerId)}'s Shield absorbed the draw penalty of ${state.pendingDraw} cards!`);
        state.pendingDraw = 0;
        state.shielded[playerId] = false;
    } else {
        state.shielded[playerId] = true;
    }

    if (hand.length === 0) {
        state.winnerId = playerId;
        log(state, `${nameOf(state, playerId)} went out and won the round!`);
        return state;
    }

    if (hand.length === 1) state.unoAlert = playerId;

    const hasExtraPlayPending = state.extraPlays > 1;
    if (state.extraPlays > 0) state.extraPlays -= 1;
    if (!hasExtraPlayPending) passTurn(state, 1);
    return state;
}

/** Resolves the active color for a just-played card (wilds require the player's declaration). */
function resolveChosenColor(state: GameState, card: Card, declaredColor?: Color): Color {
    if (changesColor(card)) {
        if (!declaredColor || !(COLORS as readonly string[]).includes(declaredColor)) {
            throw new GameError("Choose a color for the wild card");
        }
        return declaredColor;
    }
    if (keepsCurrentColor(card)) return state.activeColor;
    return card.color as Color;
}

/** Swap Hands: every player gives their hand to the next player in the direction of play. */
function swapAllHands(state: GameState): void {
    const playerCount = state.order.length;
    const previousHands = new Map(
        state.order.map((playerId) => [playerId, [...(state.hands[playerId] ?? [])]]),
    );
    for (let seat = 0; seat < playerCount; seat++) {
        const receiverId = state.order[seat]!;
        const giverSeat =
            state.direction === 1 ? mod(seat - 1, playerCount) : mod(seat + 1, playerCount);
        const giverId = state.order[giverSeat]!;
        state.hands[receiverId] = previousHands.get(giverId)!;
    }
    log(state, "Swap Hands! All players swapped hands in the direction of play.");
}

/** Snatch: the player and chosen target swap their remaining hands directly. */
function performSnatch(state: GameState, playerId: string, action: PlayAction): GameState {
    if (!action.target) throw new GameError("Choose a player to snatch cards from");
    const targetId = action.target;
    if (!state.order.includes(targetId) || targetId === playerId) {
        throw new GameError("Invalid target player for snatch");
    }

    if (state.shielded[targetId]) {
        state.shielded[targetId] = false;
        log(
            state,
            `${nameOf(state, playerId)} tried to snatch cards from ${nameOf(state, targetId)}, but their Shield protected them!`,
        );
    } else {
        const targetHand = state.hands[targetId] ?? [];
        const playerHand = [...state.hands[playerId]!];
        state.hands[playerId] = [...targetHand];
        state.hands[targetId] = playerHand;
        log(state, `${nameOf(state, playerId)} snatched ${nameOf(state, targetId)}'s hand! They swapped cards.`);

        // The received hand may no longer be on exactly one card
        if (state.unoAlert === playerId && state.hands[playerId]!.length !== 1) state.unoAlert = null;
        if (state.unoAlert === targetId && state.hands[targetId]!.length !== 1) state.unoAlert = null;

        if (state.hands[playerId]!.length === 0) {
            state.winnerId = playerId;
            log(state, `${nameOf(state, playerId)} went out and won the round!`);
            return state;
        }
        if (state.hands[targetId]!.length === 0) {
            state.winnerId = targetId;
            log(state, `${nameOf(state, targetId)} went out and won the round!`);
            return state;
        }

        checkElimination(state, playerId);
        checkElimination(state, targetId);
        if (state.winnerId) return state;
    }

    if (state.extraPlays > 0) {
        state.extraPlays -= 1;
        return state;
    }
    passTurn(state, 1);
    return state;
}

/** Applies the standard card effects (Skip / Reverse / plus cards etc.) and advances the turn. */
function applyCardEffects(state: GameState, card: Card): void {
    const playerCount = state.order.length;
    const hasExtraPlayPending = state.extraPlays > 1;
    if (state.extraPlays > 0) state.extraPlays -= 1;
    const nextPlayerId = state.order[mod(state.currentIndex + state.direction, playerCount)]!;

    // With extra plays left, the same player plays again instead of the turn passing on
    const advanceTurn = (steps: number = 1) => {
        if (!hasExtraPlayPending) passTurn(state, steps);
    };

    switch (card.type) {
        case CardType.Number:
        case CardType.Wild:
            advanceTurn();
            break;

        case CardType.Skip: {
            if (absorbWithShield(state, nextPlayerId, LABELS[CardType.Skip])) advanceTurn();
            else advanceTurn(2);
            break;
        }

        case CardType.Reverse: {
            if (playerCount === 2) {
                // With two players, reverse acts like skip
                if (absorbWithShield(state, nextPlayerId, LABELS[CardType.Skip])) advanceTurn();
                else advanceTurn(2);
            } else {
                state.direction = state.direction === 1 ? -1 : 1;
                advanceTurn();
            }
            break;
        }

        case CardType.Draw2:
        case CardType.Wild4:
        case CardType.Wild6:
        case CardType.Wild10: {
            state.pendingDraw += DRAW_PENALTY[card.type];
            if (absorbWithShield(state, nextPlayerId, LABELS[card.type])) state.pendingDraw = 0;
            advanceTurn();
            break;
        }

        // DoubleTrouble, SwapHands, Snatch and Shield are handled before reaching this switch
    }
}

/** Validates and plays a regular card, then either wins, grants special effects, or moves the turn. */
function playCard(state: GameState, playerId: string, action: PlayAction): GameState {
    const hand = state.hands[playerId];
    if (!hand) throw new GameError("You are not active in this round");
    const cardIndex = hand.findIndex((card) => card.id === action.cardId);
    if (cardIndex === -1) throw new GameError("That card is not in your hand");
    const card = hand[cardIndex]!;

    requireTurn(state, playerId);

    const illegalReason = playError(state, playerId, card);
    if (illegalReason) throw new GameError(illegalReason);

    // Shield cards follow their own dedicated flow, playable on the player's turn
    if (card.type === CardType.Shield) return playShieldCard(state, playerId, card.id);

    const chosenColor = resolveChosenColor(state, card, action.color);

    hand.splice(cardIndex, 1);
    state.discardPile.push(card);
    state.activeColor = chosenColor;
    state.drawnCardId = null;
    log(state, `${nameOf(state, playerId)} played ${describeCard(card, chosenColor)}`);

    if (hand.length === 0) {
        state.winnerId = playerId;
        log(state, `${nameOf(state, playerId)} went out and won the round!`);
        return state;
    }

    if (hand.length === 1 && !action.uno) state.unoAlert = playerId;

    if (card.type === CardType.DoubleTrouble) {
        state.extraPlays += 1;
        log(state, `${nameOf(state, playerId)} activated Double Trouble! They get to play a second card.`);
        return state;
    }

    if (card.type === CardType.SwapHands) {
        swapAllHands(state);
        checkAllEliminations(state);
        if (state.winnerId) return state;

        if (state.extraPlays > 0) {
            state.extraPlays -= 1;
            return state;
        }
        passTurn(state, 1);
        return state;
    }

    if (card.type === CardType.Snatch) return performSnatch(state, playerId, action);

    applyCardEffects(state, card);
    return state;
}

function drawCard(state: GameState, playerId: string): GameState {
    requireTurn(state, playerId);

    if (state.pendingDraw > 0) {
        const penalty = state.pendingDraw;
        drawCards(state, playerId, penalty);
        state.pendingDraw = 0;
        log(state, `${nameOf(state, playerId)} drew ${penalty} cards`);
        checkElimination(state, playerId);
        if (state.winnerId) return state;
        passTurn(state, 1);
        return state;
    }

    if (state.drawnCardId) throw new GameError("You already drew a card this turn");
    const [card] = drawCards(state, playerId, 1);
    if (!card) throw new GameError("There are no cards left to draw");
    state.drawnCardId = card.id;
    log(state, `${nameOf(state, playerId)} drew a card`);
    checkElimination(state, playerId);
    if (state.winnerId) return state;

    // If the drawn card cannot be played, auto-pass the turn immediately
    if (!isPlayable(state, playerId, card)) {
        state.drawnCardId = null;
        passTurn(state, 1);
    }

    return state;
}

function passTurnAfterDrawing(state: GameState, playerId: string): GameState {
    requireTurn(state, playerId);
    if (state.pendingDraw > 0) throw new GameError(`You must draw ${state.pendingDraw} cards`);
    if (!state.drawnCardId && state.extraPlays === 0) throw new GameError("Draw a card before passing");
    log(state, `${nameOf(state, playerId)} passed`);
    passTurn(state, 1);
    return state;
}

function callUno(state: GameState, playerId: string): GameState {
    const hand = state.hands[playerId];
    if (!hand || hand.length > 2) {
        throw new GameError("You can only call UNO with two or fewer cards");
    }
    state.unoCalls += 1;
    if (state.unoAlert === playerId) state.unoAlert = null;
    log(state, `${nameOf(state, playerId)} says UNO!`);
    return state;
}

function catchUno(state: GameState, catcherId: string, targetId: string): GameState {
    if (state.unoAlert !== targetId) throw new GameError("There is no UNO to catch");
    if (targetId === catcherId) throw new GameError("You can't catch yourself");
    const targetHand = state.hands[targetId];
    if (!targetHand || targetHand.length !== 1) {
        throw new GameError("That player is no longer on one card");
    }

    if (state.shielded[targetId]) {
        state.shielded[targetId] = false;
        state.unoAlert = null;
        log(
            state,
            `${nameOf(state, catcherId)} tried to catch ${nameOf(state, targetId)}, but their Shield protected them!`,
        );
        return state;
    }

    drawCards(state, targetId, 2);
    state.unoAlert = null;
    log(state, `${nameOf(state, catcherId)} caught ${nameOf(state, targetId)} without UNO: draws 2`);
    checkElimination(state, targetId);
    return state;
}

/** Chooses a sensible action for `playerId`. Used to keep the game moving when a player is disconnected. */
export function suggestAction(state: GameState, playerId: string): Action {
    const hand = state.hands[playerId];
    if (!hand) return { type: ActionType.Draw };

    // A Shield is the best answer to pending draws
    if (state.pendingDraw > 0) {
        const shield = hand.find((card) => card.type === CardType.Shield);
        if (shield) return { type: ActionType.PlayShield, cardId: shield.id };
    }

    const playableCards = hand.filter((card) => isPlayable(state, playerId, card));
    if (playableCards.length > 0) {
        const card = playableCards.find((candidate) => !isWild(candidate)) ?? playableCards[0]!;
        const color = changesColor(card) ? mostCommonColor(hand) : undefined;
        let target: string | undefined;
        if (card.type === CardType.Snatch) {
            const opponents = state.order.filter(
                (id) => id !== playerId && (state.hands[id]?.length ?? 0) > 0,
            );
            if (opponents.length > 0) {
                opponents.sort((a, b) => (state.hands[a]?.length ?? 0) - (state.hands[b]?.length ?? 0));
                target = opponents[0];
            }
        }
        return { type: ActionType.Play, cardId: card.id, color, uno: true, target };
    }

    if (state.pendingDraw > 0) return { type: ActionType.Draw };
    return state.drawnCardId ? { type: ActionType.Pass } : { type: ActionType.Draw };
}

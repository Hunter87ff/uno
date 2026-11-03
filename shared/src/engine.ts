import {
  COLORS,
  type Card,
  type CardType,
  type Color,
  buildDeck,
  cardPoints,
  isWild,
  shuffle,
} from './cards';

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

export interface Rules {
  /** House rule: a Draw Two may be answered with another Draw Two to pass the penalty on. */
  stacking: boolean;
  /** Official rule: the next player may challenge a Wild Draw Four they suspect was illegal. */
  challengeWild4: boolean;
  /** Game ends when a player reaches this score. */
  targetScore: number;
}

/** Limits for the host's "cards per player" choice made before dealing. */
export const CARDS_PER_PLAYER = { min: 2, max: 15, default: 7 } as const;

export const DEFAULT_RULES: Rules = {
  stacking: false,
  challengeWild4: true,
  targetScore: 500,
};

export interface PendingChallenge {
  /** Player who played the Wild Draw Four. */
  from: string;
  /** Next player, who must challenge or accept. */
  target: string;
  /** Whether `from` still held a card matching the previous color (i.e. the play was illegal). */
  hadMatchingColor: boolean;
  /** Active color before the Wild Draw Four was played. */
  prevColor: Color;
}

export interface GameState {
  rules: Rules;
  /** Player ids in seat order. */
  order: string[];
  names: Record<string, string>;
  hands: Record<string, Card[]>;
  /** Top of the draw pile is the LAST element. */
  drawPile: Card[];
  /** Top of the discard pile is the LAST element. */
  discardPile: Card[];
  currentIndex: number;
  direction: 1 | -1;
  activeColor: Color;
  /** Cards the current player must draw (and then loses their turn). */
  pendingDraw: number;
  pendingChallenge: PendingChallenge | null;
  /** Id of the card the current player drew this turn, if any. */
  drawnCardId: string | null;
  /** Player who went down to one card without calling UNO; catchable until the next action. */
  unoAlert: string | null;
  /** Number of UNO presses this round; clients use it to play the UNO call for everyone. */
  unoCalls: number;
  winnerId: string | null;
  log: string[];
}

export type Action =
  | { type: 'play'; cardId: string; color?: Color; uno?: boolean }
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'challenge' }
  | { type: 'accept' }
  | { type: 'catchUno'; target: string }
  | { type: 'callUno' };

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Helpers                                    */
/* -------------------------------------------------------------------------- */

const LOG_LIMIT = 60;

const LABELS: Record<CardType, string> = {
  number: '',
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: 'Draw Two',
  wild: 'Wild',
  wild4: 'Wild Draw Four',
};

export function describeCard(card: Card, color: Color | 'wild' = card.color): string {
  const label = card.type === 'number' ? String(card.value) : LABELS[card.type];
  return color === 'wild' ? label : `${color} ${label}`;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

function log(s: GameState, message: string): void {
  s.log.push(message);
  if (s.log.length > LOG_LIMIT) s.log.splice(0, s.log.length - LOG_LIMIT);
}

function topCard(s: GameState): Card {
  return s.discardPile[s.discardPile.length - 1]!;
}

function currentPlayer(s: GameState): string {
  return s.order[s.currentIndex]!;
}

function nameOf(s: GameState, pid: string): string {
  return s.names[pid] ?? pid;
}

/** Index of the seat `steps` positions away from the current player, in the current direction. */
function seatAfter(s: GameState, steps: number): number {
  return mod(s.currentIndex + s.direction * steps, s.order.length);
}

function passTurn(s: GameState, steps = 1): void {
  s.currentIndex = seatAfter(s, steps);
  s.drawnCardId = null;
}

function reshuffleDiscardIntoDraw(s: GameState): void {
  if (s.discardPile.length <= 1) return;
  const top = s.discardPile.pop()!;
  s.drawPile = shuffle(s.discardPile);
  s.discardPile = [top];
}

function drawCards(s: GameState, pid: string, count: number): Card[] {
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) reshuffleDiscardIntoDraw(s);
    const card = s.drawPile.pop();
    if (!card) break;
    drawn.push(card);
  }
  s.hands[pid]!.push(...drawn);
  return drawn;
}

function mostCommonColor(hand: Card[]): Color {
  const counts = new Map<Color, number>(COLORS.map((c) => [c, 0]));
  for (const card of hand) {
    if (card.color !== 'wild') counts.set(card.color, counts.get(card.color)! + 1);
  }
  let best: Color = COLORS[0];
  for (const color of COLORS) if (counts.get(color)! > counts.get(best)!) best = color;
  return best;
}

/* -------------------------------------------------------------------------- */
/*                               Round lifecycle                              */
/* -------------------------------------------------------------------------- */

/** Deals a new round: 7 cards each, then flips a legal starting card. */
export function startRound(
  players: { id: string; name: string }[],
  rules: Rules = DEFAULT_RULES,
  rng: () => number = Math.random,
  cardsPerPlayer: number = CARDS_PER_PLAYER.default,
): GameState {
  if (players.length < 2) throw new GameError('At least 2 players are required');
  if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < CARDS_PER_PLAYER.min || cardsPerPlayer > CARDS_PER_PLAYER.max) {
    throw new GameError(`Cards per player must be between ${CARDS_PER_PLAYER.min} and ${CARDS_PER_PLAYER.max}`);
  }
  // One card must remain to flip as the starting card.
  if (players.length * cardsPerPlayer + 1 > 108) {
    throw new GameError(`${players.length} players with ${cardsPerPlayer} cards each do not fit in one deck`);
  }

  const deck = shuffle(buildDeck(), rng);
  const hands: Record<string, Card[]> = {};
  const names: Record<string, string> = {};
  for (const p of players) {
    hands[p.id] = deck.splice(0, cardsPerPlayer);
    names[p.id] = p.name;
  }

  const s: GameState = {
    rules: { ...rules },
    order: players.map((p) => p.id),
    names,
    hands,
    drawPile: deck,
    discardPile: [],
    currentIndex: 0,
    direction: 1,
    activeColor: 'red',
    pendingDraw: 0,
    pendingChallenge: null,
    drawnCardId: null,
    unoAlert: null,
    unoCalls: 0,
    winnerId: null,
    log: [],
  };

  // Flip the starting card. A Wild Draw Four is put back at the bottom of the pile instead.
  let start = s.drawPile.pop()!;
  while (start.type === 'wild4') {
    s.drawPile.unshift(start);
    start = s.drawPile.pop()!;
  }
  s.discardPile.push(start);
  s.activeColor = start.color === 'wild' ? COLORS[Math.floor(rng() * COLORS.length)]! : (start.color as Color);

  const n = s.order.length;
  switch (start.type) {
    case 'skip':
      s.currentIndex = 1 % n;
      break;
    case 'reverse':
      s.direction = -1;
      s.currentIndex = n - 1;
      break;
    case 'draw2':
      s.pendingDraw = 2;
      s.currentIndex = 0;
      break;
    default:
      s.currentIndex = 0;
  }

  log(s, `Round started. Starting card: ${describeCard(start, s.activeColor)}`);
  return s;
}

/** Points the round winner collects: the value of every card left in opponents' hands. */
export function roundPoints(s: GameState): number {
  if (!s.winnerId) return 0;
  let total = 0;
  for (const pid of s.order) {
    if (pid === s.winnerId) continue;
    for (const card of s.hands[pid]!) total += cardPoints(card);
  }
  return total;
}

/* -------------------------------------------------------------------------- */
/*                                 Validation                                 */
/* -------------------------------------------------------------------------- */

/** Returns null if `card` may be played by `pid` right now, otherwise a human-readable reason. */
export function playError(s: GameState, pid: string, card: Card): string | null {
  if (s.winnerId) return 'The round is over';
  if (s.pendingChallenge) return 'Respond to the Wild Draw Four first (challenge or accept)';
  const top = topCard(s);

  if (s.pendingDraw > 0) {
    const stackable = s.rules.stacking && card.type === 'draw2' && top.type === 'draw2';
    if (!stackable) return `You must draw ${s.pendingDraw} cards`;
  }

  if (s.drawnCardId && card.id !== s.drawnCardId) {
    return 'You can only play the card you just drew';
  }

  if (card.type === 'wild4' && s.rules.challengeWild4) {
    const hasMatch = s.hands[pid]!.some((c) => c.id !== card.id && c.color === s.activeColor);
    if (hasMatch) return `You still have a ${s.activeColor} card, so you cannot play Wild Draw Four`;
  }

  if (isWild(card)) return null;
  if (card.color === s.activeColor) return null;
  if (card.type === 'number' && top.type === 'number' && card.value === top.value) return null;
  if (card.type !== 'number' && card.type === top.type) return null;
  return "That card doesn't match the active color or number";
}

function isPlayable(s: GameState, pid: string, card: Card): boolean {
  return playError(s, pid, card) === null;
}

/* -------------------------------------------------------------------------- */
/*                                  Actions                                   */
/* -------------------------------------------------------------------------- */

/**
 * Applies `action` by `playerId` and returns the NEW state. The input state is never mutated.
 * Throws `GameError` if the action is illegal.
 */
export function applyAction(state: GameState, playerId: string, action: Action): GameState {
  if (state.winnerId) throw new GameError('The round is over');
  const s = structuredClone(state);
  // Only a normal action closes the UNO catch window; calling UNO or catching does not.
  if (action.type !== 'catchUno' && action.type !== 'callUno') s.unoAlert = null;

  switch (action.type) {
    case 'play':
      return doPlay(s, playerId, action);
    case 'draw':
      return doDraw(s, playerId);
    case 'pass':
      return doPass(s, playerId);
    case 'challenge':
      return doChallenge(s, playerId);
    case 'accept':
      return doAccept(s, playerId);
    case 'catchUno':
      return doCatch(s, playerId, action.target);
    case 'callUno':
      return doCallUno(s, playerId);
    default:
      throw new GameError('Unknown action');
  }
}

function requireTurn(s: GameState, pid: string): void {
  if (currentPlayer(s) !== pid) throw new GameError('It is not your turn');
}

function doPlay(
  s: GameState,
  pid: string,
  action: Extract<Action, { type: 'play' }>,
): GameState {
  requireTurn(s, pid);
  const hand = s.hands[pid]!;
  const index = hand.findIndex((c) => c.id === action.cardId);
  if (index === -1) throw new GameError('That card is not in your hand');
  const card = hand[index]!;

  const err = playError(s, pid, card);
  if (err) throw new GameError(err);

  const prevColor = s.activeColor;
  let chosen: Color;
  if (isWild(card)) {
    if (!action.color || !(COLORS as readonly string[]).includes(action.color)) {
      throw new GameError('Choose a color for the wild card');
    }
    chosen = action.color;
  } else {
    chosen = card.color as Color;
  }

  const hadMatchingColor =
    card.type === 'wild4' && hand.some((c) => c.id !== card.id && c.color === prevColor);

  hand.splice(index, 1);
  s.discardPile.push(card);
  s.activeColor = chosen;
  s.drawnCardId = null;
  log(s, `${nameOf(s, pid)} played ${describeCard(card, chosen)}`);

  if (hand.length === 0) {
    s.winnerId = pid;
    log(s, `${nameOf(s, pid)} went out and won the round!`);
    return s;
  }

  if (hand.length === 1) {
    if (!action.uno) s.unoAlert = pid;
  }

  const n = s.order.length;
  switch (card.type) {
    case 'number':
    case 'wild':
      passTurn(s, 1);
      break;
    case 'skip':
      passTurn(s, 2);
      break;
    case 'reverse':
      if (n === 2) {
        passTurn(s, 2); // with two players, reverse acts like skip
      } else {
        s.direction = s.direction === 1 ? -1 : 1;
        passTurn(s, 1);
      }
      break;
    case 'draw2':
      s.pendingDraw += 2;
      passTurn(s, 1);
      break;
    case 'wild4':
      if (s.rules.challengeWild4) {
        s.pendingChallenge = {
          from: pid,
          target: s.order[seatAfter(s, 1)]!,
          hadMatchingColor,
          prevColor,
        };
        passTurn(s, 1);
      } else {
        s.pendingDraw += 4;
        passTurn(s, 1);
      }
      break;
  }
  return s;
}

function doDraw(s: GameState, pid: string): GameState {
  requireTurn(s, pid);
  if (s.pendingChallenge) throw new GameError('Respond to the Wild Draw Four first');

  if (s.pendingDraw > 0) {
    const count = s.pendingDraw;
    drawCards(s, pid, count);
    s.pendingDraw = 0;
    log(s, `${nameOf(s, pid)} drew ${count} cards`);
    passTurn(s, 1);
    return s;
  }

  if (s.drawnCardId) throw new GameError('You already drew a card this turn');
  if (s.hands[pid]!.some((c) => isPlayable(s, pid, c))) {
    throw new GameError('You have a playable card, so you cannot draw');
  }
  const [card] = drawCards(s, pid, 1);
  if (!card) throw new GameError('There are no cards left to draw');
  s.drawnCardId = card.id;
  log(s, `${nameOf(s, pid)} drew a card`);
  return s;
}

function doPass(s: GameState, pid: string): GameState {
  requireTurn(s, pid);
  if (s.pendingChallenge) throw new GameError('Respond to the Wild Draw Four first');
  if (s.pendingDraw > 0) throw new GameError(`You must draw ${s.pendingDraw} cards`);
  if (!s.drawnCardId) throw new GameError('Draw a card before passing');
  log(s, `${nameOf(s, pid)} passed`);
  passTurn(s, 1);
  return s;
}

function doChallenge(s: GameState, pid: string): GameState {
  const pc = s.pendingChallenge;
  if (!pc) throw new GameError('There is nothing to challenge');
  if (pid !== pc.target) throw new GameError('Only the next player can challenge');
  s.pendingChallenge = null;

  if (pc.hadMatchingColor) {
    // Illegal play: the Wild Draw Four goes back to its owner, who draws 4. Challenger keeps the turn.
    const card = s.discardPile.pop()!;
    s.hands[pc.from]!.push(card);
    s.activeColor = pc.prevColor;
    drawCards(s, pc.from, 4);
    log(s, `${nameOf(s, pid)} challenged and WON: ${nameOf(s, pc.from)} draws 4 and returns the card`);
  } else {
    // Legal play: challenger draws 6 and loses the turn.
    s.pendingDraw = 6;
    log(s, `${nameOf(s, pid)} challenged and LOST: must draw 6`);
  }
  return s;
}

function doAccept(s: GameState, pid: string): GameState {
  const pc = s.pendingChallenge;
  if (!pc) throw new GameError('There is nothing to accept');
  if (pid !== pc.target) throw new GameError('Only the next player can respond');
  s.pendingChallenge = null;
  s.pendingDraw = 4;
  log(s, `${nameOf(s, pid)} accepted and must draw 4`);
  return s;
}

function doCallUno(s: GameState, pid: string): GameState {
  if (s.hands[pid]!.length > 2) throw new GameError('You can only call UNO with two or fewer cards');
  s.unoCalls += 1;
  log(s, `${nameOf(s, pid)} says UNO!`);
  return s;
}

function doCatch(s: GameState, pid: string, target: string): GameState {
  if (s.unoAlert !== target) throw new GameError('There is no UNO to catch');
  if (target === pid) throw new GameError("You can't catch yourself");
  if (s.hands[target]!.length !== 1) throw new GameError('That player is no longer on one card');
  drawCards(s, target, 2);
  s.unoAlert = null;
  log(s, `${nameOf(s, pid)} caught ${nameOf(s, target)} without UNO: draws 2`);
  return s;
}

/**
 * Chooses a sensible action for `pid`. Used to keep the game moving when a player is disconnected.
 * Returns an action that `applyAction` accepts (assuming `pid` is the relevant player).
 */
export function suggestAction(s: GameState, pid: string): Action {
  if (s.pendingChallenge && s.pendingChallenge.target === pid) return { type: 'accept' };
  if (s.pendingDraw > 0) return { type: 'draw' };

  const hand = s.hands[pid]!;
  const playable = hand.filter((c) => isPlayable(s, pid, c));
  if (playable.length > 0) {
    const card = playable.find((c) => !isWild(c)) ?? playable[0]!;
    return isWild(card)
      ? { type: 'play', cardId: card.id, color: mostCommonColor(hand), uno: true }
      : { type: 'play', cardId: card.id, uno: true };
  }
  return s.drawnCardId ? { type: 'pass' } : { type: 'draw' };
}

/* -------------------------------------------------------------------------- */
/*                                    View                                    */
/* -------------------------------------------------------------------------- */

export interface PublicPlayerCards {
  id: string;
  name: string;
  cardCount: number;
}

/** What one viewer is allowed to know about the round. Opponents' hands are hidden. */
export interface PublicRound {
  order: PublicPlayerCards[];
  currentId: string | null;
  direction: 1 | -1;
  activeColor: Color;
  top: Card;
  drawPileCount: number;
  pendingDraw: number;
  /** Who must respond to a Wild Draw Four. Whether it was legal stays hidden until resolved. */
  pendingChallenge: { from: string; target: string } | null;
  unoAlert: string | null;
  unoCalls: number;
  winnerId: string | null;
  /** The viewer's own hand (empty for spectators). */
  hand: Card[];
  /** Ids of cards in `hand` the viewer may legally play right now. */
  playableIds: string[];
  /** Id of the card the current player drew this turn, if it is the viewer. */
  drawnCardId: string | null;
  log: string[];
}

export function viewFor(s: GameState, viewerId: string): PublicRound {
  const hand = s.hands[viewerId] ?? [];
  const isMyTurn = currentPlayer(s) === viewerId && !s.winnerId;
  return {
    order: s.order.map((id) => ({
      id,
      name: nameOf(s, id),
      cardCount: s.hands[id]!.length,
    })),
    currentId: s.winnerId ? null : currentPlayer(s),
    direction: s.direction,
    activeColor: s.activeColor,
    top: topCard(s),
    drawPileCount: s.drawPile.length,
    pendingDraw: s.pendingDraw,
    pendingChallenge: s.pendingChallenge
      ? { from: s.pendingChallenge.from, target: s.pendingChallenge.target }
      : null,
    unoAlert: s.unoAlert,
    unoCalls: s.unoCalls,
    winnerId: s.winnerId,
    hand,
    playableIds: isMyTurn ? hand.filter((c) => isPlayable(s, viewerId, c)).map((c) => c.id) : [],
    drawnCardId: isMyTurn ? s.drawnCardId : null,
    log: s.log,
  };
}

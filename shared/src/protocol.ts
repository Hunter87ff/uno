import type { Action, PublicRound, Rules } from './engine';
export { CARDS_PER_PLAYER } from './engine';

export type RoomStatus = 'lobby' | 'playing' | 'roundOver' | 'gameOver';

export interface RoomPlayer {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  score: number;
}

/** Full room snapshot pushed to every connected player after each change. */
export interface RoomView {
  code: string;
  status: RoomStatus;
  rules: Rules;
  hostId: string;
  /** The receiving player's own id. */
  you: string;
  players: RoomPlayer[];
  /** Cards the host will deal to each player at the next deal. */
  cardsPerPlayer: number;
  round: PublicRound | null;
  /** Points awarded for the most recently finished round. */
  lastRoundPoints: number | null;
  gameWinnerId: string | null;
}

/** Messages sent from a client over the WebSocket. */
export type ClientMessage =
  | { type: 'settings'; rules: Partial<Rules> }
  | { type: 'start'; cardsPerPlayer: number }
  | { type: 'nextRound' }
  | { type: 'kick'; playerId: string }
  | { type: 'leave' }
  | { type: 'action'; action: Action };

/** Messages sent from the server over the WebSocket. */
export type ServerMessage = { type: 'room'; room: RoomView } | { type: 'error'; message: string };

/** Response of POST /api/rooms and POST /api/rooms/:code/join. */
export interface Session {
  code: string;
  playerId: string;
  token: string;
}

/** WebSocket close codes: tell the client why the socket was closed by the server. */
export const CLOSE_INVALID_SESSION = 4401;
export const CLOSE_REMOVED = 4403;
export const CLOSE_FORBIDDEN_ORIGIN = 4404; // WebSocket opened from a disallowed origin

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const NAME_MAX_LENGTH = 20;
export const ROOM_CODE_LENGTH = 5;

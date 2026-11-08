import type { Action, PublicRound, Rules } from "./engine";
import {
	type ActionType,
	ClientMessageType,
	CloseCode,
	RoomStatus,
	ServerMessageType,
} from "./types";

export { CARDS_PER_PLAYER } from "./engine";
export { RoomStatus, ClientMessageType, ServerMessageType, CloseCode };

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
	| { type: ClientMessageType.Settings; rules: Partial<Rules> }
	| { type: ClientMessageType.Start; cardsPerPlayer: number }
	| { type: ClientMessageType.NextRound }
	| { type: ClientMessageType.ResetRoom }
	| { type: ClientMessageType.Kick; playerId: string }
	| { type: ClientMessageType.Leave }
	| { type: ClientMessageType.Action; action: Action };

/** Messages sent from the server over the WebSocket. */
export type ServerMessage =
	| { type: ServerMessageType.Room; room: RoomView }
	| { type: ServerMessageType.Error; message: string };

/** Response of POST /api/rooms and POST /api/rooms/:code/join. */
export interface Session {
	code: string;
	playerId: string;
	token: string;
}

/** WebSocket close codes: tell the client why the socket was closed by the server. */
export const CLOSE_INVALID_SESSION = CloseCode.InvalidSession;
export const CLOSE_REMOVED = CloseCode.Removed;
export const CLOSE_FORBIDDEN_ORIGIN = CloseCode.ForbiddenOrigin;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const NAME_MAX_LENGTH = 20;
export const ROOM_CODE_LENGTH = 5;

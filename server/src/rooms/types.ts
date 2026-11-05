import {
  type GameState,
  NAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  type Rules,
  type ServerMessage,
} from "@uno/shared";
import { config } from "../config";

/** Anything that can receive server messages (a WebSocket in production, a stub in tests). */
export interface Sender {
  send(message: ServerMessage): unknown;
  close?(code: number, reason: string): unknown;
}

export class RoomError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "RoomError";
  }
}

export interface PlayerRecord {
  id: string;
  name: string;
  token: string;
  score: number;
  socket: Sender | null;
}

export interface Room {
  code: string;
  hostId: string;
  rules: Rules;
  cardsPerPlayer: number;
  players: PlayerRecord[];
  game: GameState | null;
  lastRoundPoints: number | null;
  gameWinnerId: string | null;
  lastActive: number;
  autoTimer: ReturnType<typeof setTimeout> | null;
}

/** Normalises a display name for uniqueness checks ("  Ann " and "ann" collide). */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function validateName(raw: string): string {
  const name = normalizeName(raw);
  if (name.length < 1) throw new RoomError(400, "Name is required");
  if (name.length > NAME_MAX_LENGTH)
    throw new RoomError(
      400,
      `Name must be ${NAME_MAX_LENGTH} characters or fewer`,
    );
  if (/[\u0000-\u001f]/.test(name))
    throw new RoomError(400, "Name contains invalid characters");
  return name;
}

export function randomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code +=
      config.codeAlphabet[
        Math.floor(Math.random() * config.codeAlphabet.length)
      ];
  }
  return code;
}

export function normalizeRules(input: Rules): Rules {
  const targetScore = Math.round(Number(input.targetScore));
  if (
    !Number.isFinite(targetScore) ||
    targetScore < 100 ||
    targetScore > 5000
  ) {
    throw new RoomError(400, "Target score must be between 100 and 5000");
  }
  return {
    stacking: Boolean(input.stacking),
    targetScore,
  };
}

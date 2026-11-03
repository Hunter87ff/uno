import {
  type Action,
  CARDS_PER_PLAYER,
  DEFAULT_RULES,
  GameError,
  type GameState,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  CLOSE_INVALID_SESSION,
  CLOSE_REMOVED,
  type ClientMessage,
  type RoomStatus,
  type RoomView,
  type Rules,
  type ServerMessage,
  type Session,
  applyAction,
  roundPoints,
  startRound,
  suggestAction,
  viewFor,
} from '@uno/shared';

/** How long a disconnected player may hold up their turn before the server plays for them. */
export const AUTO_PLAY_DELAY_MS = 20_000;
/** Empty rooms are forgotten after this much inactivity. */
const ROOM_IDLE_MS = 15 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes (I, O, 0, 1)

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
    this.name = 'RoomError';
  }
}

interface PlayerRecord {
  id: string;
  name: string;
  token: string;
  score: number;
  socket: Sender | null;
}

interface Room {
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
  return name.trim().replace(/\s+/g, ' ');
}

function validateName(raw: string): string {
  const name = normalizeName(raw);
  if (name.length < 1) throw new RoomError(400, 'Name is required');
  if (name.length > NAME_MAX_LENGTH) throw new RoomError(400, `Name must be ${NAME_MAX_LENGTH} characters or fewer`);
  if (/[\u0000-\u001f]/.test(name)) throw new RoomError(400, 'Name contains invalid characters');
  return name;
}

function randomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sweeper: ReturnType<typeof setInterval>;

  constructor(private now: () => number = Date.now) {
    this.sweeper = setInterval(() => this.sweepIdleRooms(), 60_000);
    this.sweeper.unref?.();
  }

  /* ----------------------------- REST operations ---------------------------- */

  createRoom(rawName: string): Session {
    const name = validateName(rawName);
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();

    const player = this.newPlayer(name);
    const room: Room = {
      code,
      hostId: player.id,
      rules: { ...DEFAULT_RULES },
      cardsPerPlayer: CARDS_PER_PLAYER.default,
      players: [player],
      game: null,
      lastRoundPoints: null,
      gameWinnerId: null,
      lastActive: this.now(),
      autoTimer: null,
    };
    this.rooms.set(code, room);
    return { code, playerId: player.id, token: player.token };
  }

  roomExists(code: string): { code: string; status: RoomStatus; playerCount: number } {
    const room = this.getRoom(code);
    return { code: room.code, status: this.statusOf(room), playerCount: room.players.length };
  }

  joinRoom(code: string, rawName: string): Session {
    const room = this.getRoom(code);
    const name = validateName(rawName);
    if (room.players.length >= MAX_PLAYERS) throw new RoomError(409, 'This room is full');
    if (this.statusOf(room) !== 'lobby') {
      throw new RoomError(409, 'A game is already in progress in this room');
    }
    const taken = room.players.some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (taken) throw new RoomError(409, `The name "${name}" is already taken in this room`);

    const player = this.newPlayer(name);
    room.players.push(player);
    this.touch(room);
    this.broadcast(room);
    return { code: room.code, playerId: player.id, token: player.token };
  }

  /* ---------------------------- WebSocket lifecycle ------------------------- */

  /** Binds a socket to the player holding `token`. Throws RoomError if the session is invalid. */
  attach(code: string, token: string, socket: Sender): string {
    const room = this.getRoom(code);
    const player = room.players.find((p) => p.token === token);
    if (!player) throw new RoomError(401, 'Unknown session for this room');
    player.socket = socket;
    this.touch(room);
    this.broadcast(room);
    return player.id;
  }

  detach(code: string, token: string, socket: Sender): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const player = room.players.find((p) => p.token === token);
    if (!player || player.socket !== socket) return; // a newer connection already took over
    player.socket = null;
    this.touch(room);
    this.broadcast(room);
  }

  /** Handles one message from a connected player. Errors are reported back to that player only. */
  handle(code: string, playerId: string, message: ClientMessage): void {
    const room = this.rooms.get(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;

    try {
      this.dispatch(room, player, message);
      this.touch(room);
      this.broadcast(room);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      if (err instanceof GameError || err instanceof RoomError) {
        player.socket?.send({ type: 'error', message });
      } else {
        console.error(err);
        player.socket?.send({ type: 'error', message: 'Internal server error' });
      }
    }
  }

  /** Returns the player id holding `token` in room `code`, or null if there is no such session. */
  playerIdFor(code: string, token: string): string | null {
    const room = this.rooms.get(code.toUpperCase());
    return room?.players.find((p) => p.token === token)?.id ?? null;
  }

  /** Snapshot of a room from one player's point of view. */
  viewFor(code: string, playerId: string): RoomView {
    return this.snapshot(this.getRoom(code), playerId);
  }

  /* -------------------------------- Internals ------------------------------- */

  private dispatch(room: Room, player: PlayerRecord, message: ClientMessage): void {
    const isHost = player.id === room.hostId;
    switch (message.type) {
      case 'settings': {
        if (!isHost) throw new RoomError(403, 'Only the host can change settings');
        if (room.game && !room.game.winnerId) throw new RoomError(409, 'Settings can be changed between rounds');
        room.rules = normalizeRules({ ...room.rules, ...message.rules });
        return;
      }

      case 'start': {
        if (!isHost) throw new RoomError(403, 'Only the host can start the game');
        const status = this.statusOf(room);
        if (status === 'playing' || status === 'roundOver') {
          throw new RoomError(409, 'A game is already in progress');
        }
        const playerCount = room.players.length;
        if (playerCount < MIN_PLAYERS) throw new RoomError(409, `At least ${MIN_PLAYERS} players are needed`);
        // Shuffle and deal first: an invalid card count throws before any state is changed.
        const game = this.deal(room, message.cardsPerPlayer);
        room.cardsPerPlayer = message.cardsPerPlayer;
        for (const p of room.players) p.score = 0;
        room.gameWinnerId = null;
        room.lastRoundPoints = null;
        room.game = game;
        return;
      }

      case 'nextRound': {
        if (!isHost) throw new RoomError(403, 'Only the host can start the next round');
        if (this.statusOf(room) !== 'roundOver') throw new RoomError(409, 'The round is not over yet');
        room.game = this.deal(room, room.cardsPerPlayer);
        room.lastRoundPoints = null;
        return;
      }

      case 'kick': {
        if (!isHost) throw new RoomError(403, 'Only the host can remove players');
        if (this.statusOf(room) !== 'lobby') throw new RoomError(409, 'Players can only be removed in the lobby');
        if (message.playerId === room.hostId) throw new RoomError(400, 'The host cannot be removed');
        const target = room.players.find((p) => p.id === message.playerId);
        if (!target) throw new RoomError(404, 'Player not found');
        this.removePlayer(room, target, 'You were removed from the room');
        return;
      }

      case 'leave': {
        if (this.statusOf(room) !== 'lobby') {
          throw new RoomError(409, 'You cannot leave a game in progress; the server will play your turns');
        }
        this.removePlayer(room, player, null);
        return;
      }

      case 'action': {
        if (!room.game) throw new RoomError(409, 'No game in progress');
        const before = room.game;
        const next = applyAction(before, player.id, message.action as Action);
        room.game = next;
        if (!before.winnerId && next.winnerId) this.finishRound(room);
        this.scheduleAutoPlay(room);
        return;
      }
    }
  }

  /** Shuffles the deck and deals `cardsPerPlayer` cards to every player in the room. */
  private deal(room: Room, cardsPerPlayer: number): GameState {
    return startRound(
      room.players.map((p) => ({ id: p.id, name: p.name })),
      room.rules,
      Math.random,
      cardsPerPlayer,
    );
  }

  /** Removes a player from a lobby. Transfers host if needed and deletes the room when it empties. */
  private removePlayer(room: Room, target: PlayerRecord, notice: string | null): void {
    room.players = room.players.filter((p) => p.id !== target.id);
    if (notice) target.socket?.send({ type: 'error', message: notice });
    target.socket?.close?.(CLOSE_REMOVED, notice ?? 'left');
    target.socket = null;
    if (room.players.length === 0) {
      if (room.autoTimer) clearTimeout(room.autoTimer);
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === target.id) room.hostId = room.players[0]!.id;
  }

  private finishRound(room: Room): void {
    const game = room.game!;
    const points = roundPoints(game);
    room.lastRoundPoints = points;
    const winner = room.players.find((p) => p.id === game.winnerId);
    if (!winner) return;
    winner.score += points;
    if (winner.score >= room.rules.targetScore) room.gameWinnerId = winner.id;
  }

  /**
   * If the player whose turn it is has no live connection, play for them after a grace period.
   * Re-scheduled after every state change, so a chain of disconnected players keeps moving.
   */
  private scheduleAutoPlay(room: Room): void {
    if (room.autoTimer) clearTimeout(room.autoTimer);
    room.autoTimer = null;
    const game = room.game;
    if (!game || game.winnerId) return;
    const currentId = game.order[game.currentIndex]!;
    const current = room.players.find((p) => p.id === currentId);
    if (!current || current.socket) return;

    room.autoTimer = setTimeout(() => {
      room.autoTimer = null;
      const live = this.rooms.get(room.code);
      if (!live?.game || live.game.winnerId) return;
      const turnOwner = live.game.order[live.game.currentIndex]!;
      const owner = live.players.find((p) => p.id === turnOwner);
      if (!owner || owner.socket) return;
      try {
        live.game = applyAction(live.game, owner.id, suggestAction(live.game, owner.id));
        if (live.game.winnerId) this.finishRound(live);
      } catch (err) {
        console.error('auto-play failed', err);
      }
      this.touch(live);
      this.broadcast(live);
      this.scheduleAutoPlay(live);
    }, AUTO_PLAY_DELAY_MS);
  }

  private statusOf(room: Room): RoomStatus {
    if (!room.game) return 'lobby';
    if (room.game.winnerId) return room.gameWinnerId ? 'gameOver' : 'roundOver';
    return 'playing';
  }

  private snapshot(room: Room, playerId: string): RoomView {
    const game = room.game;
    return {
      code: room.code,
      status: this.statusOf(room),
      rules: room.rules,
      hostId: room.hostId,
      you: playerId,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.socket !== null,
        isHost: p.id === room.hostId,
        score: p.score,
      })),
      cardsPerPlayer: room.cardsPerPlayer,
      round: game ? viewFor(game, playerId) : null,
      lastRoundPoints: room.lastRoundPoints,
      gameWinnerId: room.gameWinnerId,
    };
  }

  /** Pushes a fresh snapshot to every connected player in the room. */
  private broadcast(room: Room): void {
    for (const p of room.players) {
      p.socket?.send({ type: 'room', room: this.snapshot(room, p.id) });
    }
  }

  private newPlayer(name: string): PlayerRecord {
    return {
      id: crypto.randomUUID(),
      name,
      token: crypto.randomUUID(),
      score: 0,
      socket: null,
    };
  }

  private getRoom(code: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new RoomError(404, 'Room not found');
    return room;
  }

  private touch(room: Room): void {
    room.lastActive = this.now();
  }

  private sweepIdleRooms(): void {
    const cutoff = this.now() - ROOM_IDLE_MS;
    for (const room of this.rooms.values()) {
      const anyConnected = room.players.some((p) => p.socket !== null);
      if (!anyConnected && room.lastActive < cutoff) {
        if (room.autoTimer) clearTimeout(room.autoTimer);
        this.rooms.delete(room.code);
      }
    }
  }

  /** For tests and graceful shutdown. */
  dispose(): void {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) if (room.autoTimer) clearTimeout(room.autoTimer);
    this.rooms.clear();
  }
}

function normalizeRules(input: Rules): Rules {
  const targetScore = Math.round(Number(input.targetScore));
  if (!Number.isFinite(targetScore) || targetScore < 100 || targetScore > 5000) {
    throw new RoomError(400, 'Target score must be between 100 and 5000');
  }
  return {
    stacking: Boolean(input.stacking),
    challengeWild4: Boolean(input.challengeWild4),
    targetScore,
  };
}

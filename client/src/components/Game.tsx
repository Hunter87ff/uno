import {
  type Card,
  type ClientMessage,
  type Color,
  COLORS,
  type PublicRound,
  type RoomView,
  describeCard,
  isWild,
} from '@uno/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CardBack, CardFace, COLOR_FILL } from './Card';
import { Avatar, Badge, Button, Modal, Panel } from './ui';

interface GameProps {
  room: RoomView;
  connected: boolean;
  send: (message: ClientMessage) => void;
  onLeaveTable: () => void;
}

export function Game({ room, connected, send, onLeaveTable }: GameProps) {
  const round = room.round!;
  const me = room.you;
  const isHost = room.hostId === me;
  const isMyTurn = round.currentId === me;
  const names = useMemo(() => new Map(room.players.map((p) => [p.id, p.name])), [room.players]);
  const seatIndex = useMemo(() => new Map(room.players.map((p, i) => [p.id, i])), [room.players]);
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? 'Unknown') : '—');

  const [pickingFor, setPickingFor] = useState<Card | null>(null);
  const [unoArmed, setUnoArmed] = useState(false);

  const playable = new Set(round.playableIds);
  const handCount = round.hand.length;

  const canDraw = isMyTurn && !round.drawnCardId;
  const canPass = isMyTurn && round.pendingDraw === 0 && Boolean(round.drawnCardId);
  const canCatch = Boolean(round.unoAlert && round.unoAlert !== me);

  const act = (action: Extract<ClientMessage, { type: 'action' }>['action']) =>
    send({ type: 'action', action });

  function playCard(card: Card) {
    if (!isMyTurn || !playable.has(card.id)) return;
    if (isWild(card)) {
      setPickingFor(card);
      return;
    }
    act({ type: 'play', cardId: card.id, uno: unoArmed });
    setUnoArmed(false);
  }

  function chooseColor(color: Color) {
    if (!pickingFor) return;
    act({ type: 'play', cardId: pickingFor.id, color, uno: unoArmed });
    setPickingFor(null);
    setUnoArmed(false);
  }

  // Seats: opponents in turn order, starting after the viewer.
  const seats = useMemo(() => {
    const idx = round.order.findIndex((p) => p.id === me);
    if (idx === -1) return round.order;
    return [...round.order.slice(idx + 1), ...round.order.slice(0, idx)];
  }, [round.order, me]);

  const presence = new Map(room.players.map((p) => [p.id, p]));
  const turnText = (() => {
    if (round.winnerId) return '';
    if (isMyTurn) {
      if (round.pendingDraw > 0) return `You must draw ${round.pendingDraw} cards.`;
      if (round.drawnCardId) return 'Play the card you drew, or pass.';
      return playable.size > 0 ? 'Your turn. Play a card, or draw.' : 'Your turn. No playable card, so draw.';
    }
    return `Waiting for ${nameOf(round.currentId)}…`;
  })();

  const activeFill = COLOR_FILL[round.activeColor];

  return (
    <div className="app-bg flex min-h-full flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="glass rounded-xl px-3 py-1.5 font-mono text-sm font-black tracking-[0.2em] text-amber-200">
            {room.code}
          </span>
          <Badge>Play to {room.rules.targetScore}</Badge>
          {!connected && <Badge tone="red">Reconnecting…</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <span className="glass flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold capitalize">
            <span className="size-3.5 rounded-full ring-2 ring-white/50" style={{ background: activeFill }} />
            {round.activeColor}
          </span>
          <span className="glass rounded-xl px-3 py-1.5 text-sm font-bold" title="Direction of play">
            {round.direction === 1 ? '↻ Clockwise' : '↺ Counter-clockwise'}
          </span>
          {isHost && (
            <Button
              variant="secondary"
              className="px-3 py-1.5 text-xs text-rose-300 ring-rose-500/30 hover:bg-rose-500/20"
              onClick={() => send({ type: 'resetRoom' })}
              title="Reset the game and return everyone to lobby"
            >
              Restart room
            </Button>
          )}
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onLeaveTable}>
            Leave table
          </Button>
        </div>
      </header>

      {/* Opponents */}
      <section className="flex flex-wrap justify-center gap-3 px-4 pt-2" aria-label="Other players">
        {seats.map((seat) => {
          const isTurn = round.currentId === seat.id;
          const info = presence.get(seat.id);
          const alert = round.unoAlert === seat.id;
          const shown = Math.min(seat.cardCount, 7);
          return (
            <div
              key={seat.id}
              className={`glass relative w-44 rounded-2xl p-3 transition ${isTurn ? 'turn-glow' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                <Avatar name={seat.name} index={seatIndex.get(seat.id) ?? 0} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    <span className="truncate">{seat.name}</span>
                    {!info?.connected && <span className="size-1.5 shrink-0 rounded-full bg-slate-500" title="Offline" />}
                  </p>
                  <p className="text-xs text-white/50">{seat.cardCount} cards</p>
                </div>
                {isTurn && <Badge tone="gold">Turn</Badge>}
              </div>
              <div className="mt-2 flex h-11 items-center justify-center -space-x-5">
                {Array.from({ length: shown }).map((_, i) => (
                  <CardBack key={i} size="xs" />
                ))}
              </div>
              <div className="mt-1 flex min-h-7 items-center justify-center gap-2">
                {alert && <span className="uno-pulse rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-black shadow-lg shadow-rose-600/40">UNO!</span>}
                {alert && canCatch && (
                  <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => act({ type: 'catchUno', target: seat.id })}>
                    Catch!
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Table */}
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-4">
        <div className="table-felt relative flex aspect-[2.3/1] w-full max-w-2xl items-center justify-center rounded-[50%]">
          {/* Subtle table emblem */}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[120px] font-black tracking-tighter text-white/[0.04] select-none">
            UNO
          </span>

          <div className="relative flex items-center gap-6 sm:gap-10">
            <div className="flex flex-col items-center gap-2">
              <CardBack
                size="lg"
                label={canDraw ? (round.pendingDraw > 0 ? `Draw ${round.pendingDraw}` : 'Draw') : undefined}
                onClick={canDraw ? () => act({ type: 'draw' }) : undefined}
                className={canDraw ? 'ring-4 ring-amber-300 shadow-amber-400/40' : ''}
              />
              <span className="text-xs font-semibold text-white/50">{round.drawPileCount} left</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <span
                  className="absolute -inset-3 rounded-2xl opacity-60 blur-xl"
                  style={{ background: activeFill }}
                  aria-hidden
                />
                <div className="relative">
                  <CardFace card={round.top} size="lg" />
                </div>
                <span
                  className="absolute -right-3 -top-3 size-8 rounded-full border-4 border-white shadow-lg"
                  style={{ background: activeFill }}
                  title={`Active color: ${round.activeColor}`}
                />
              </div>
              <span className="text-xs font-semibold text-white/50">Discard</span>
            </div>
          </div>
        </div>

        <div
          className={`glass max-w-xl rounded-2xl px-5 py-2.5 text-center text-sm font-semibold ${
            isMyTurn ? 'text-amber-100 ring-1 ring-amber-300/40' : 'text-white/80'
          }`}
          role="status"
        >
          {turnText}
        </div>

        {/* Actions */}
        <div className="flex min-h-11 flex-wrap items-center justify-center gap-2.5">
          {isMyTurn && (
            <>
              {!round.drawnCardId ? (
                <Button variant="secondary" disabled={!canDraw} onClick={() => act({ type: 'draw' })}>
                  {round.pendingDraw > 0 ? `Draw ${round.pendingDraw}` : 'Draw card'}
                </Button>
              ) : (
                <Button variant="secondary" disabled={!canPass} onClick={() => act({ type: 'pass' })}>
                  Pass
                </Button>
              )}
            </>
          )}
          {handCount <= 2 && (
            <Button
              variant={unoArmed ? 'danger' : 'secondary'}
              className={unoArmed ? 'uno-pulse' : ''}
              aria-pressed={unoArmed}
              onClick={() => {
                // Pressing UNO announces it to every player (and plays the call); it also arms the next play.
                if (!unoArmed) act({ type: 'callUno' });
                setUnoArmed((v) => !v);
              }}
              title="Press before playing your second-to-last card to call UNO"
            >
              {unoArmed ? 'UNO called ✓' : 'Call UNO'}
            </Button>
          )}
        </div>

        <details className="glass w-full max-w-xl rounded-2xl px-4 py-2.5 text-xs text-white/70">
          <summary className="cursor-pointer select-none font-bold text-white/80">Game log</summary>
          <Log entries={round.log} />
        </details>
      </main>

      {/* Hand tray */}
      <Hand round={round} onPlay={playCard} disabled={!isMyTurn} />

      {pickingFor && <ColorPicker onPick={chooseColor} onCancel={() => setPickingFor(null)} />}
      <RoundOverlay room={room} round={round} isHost={room.hostId === me} send={send} nameOf={nameOf} />
    </div>
  );
}

/* -------------------------------- Hand ----------------------------------- */

function Hand({
  round,
  onPlay,
  disabled,
}: {
  round: PublicRound;
  onPlay: (card: Card) => void;
  disabled: boolean;
}) {
  const playable = new Set(round.playableIds);
  // Overlap leaves the card centre uncovered, so every card stays clickable.
  const overlap = '-ml-6';
  const playableCount = round.playableIds.length;
  return (
    <section
      className="glass mx-auto mb-3 w-[calc(100%-1.5rem)] max-w-5xl rounded-3xl px-3 pb-4 pt-3"
      aria-label="Your hand"
    >
      <div className="mb-1 flex items-center justify-between px-3 text-xs">
        <span className="font-bold text-white/80">
          Your hand · {round.hand.length} card{round.hand.length === 1 ? '' : 's'}
        </span>
        {!disabled && playableCount > 0 && <Badge tone="green">{playableCount} playable</Badge>}
      </div>
      <div className="hide-scrollbar flex justify-start overflow-x-auto px-4 pt-7 pb-3 md:justify-center">
        {round.hand.length === 0 && <p className="py-6 text-sm text-white/50">No cards in hand.</p>}
        {round.hand.map((card, i) => {
          const isPlayable = !disabled && playable.has(card.id);
          return (
            <div key={card.id} className={`relative hover:z-10 focus-within:z-10 ${i === 0 ? '' : overlap}`}>
              <CardFace
                card={card}
                size="md"
                highlighted={isPlayable}
                dimmed={!isPlayable}
                onClick={() => onPlay(card)}
                title={isPlayable ? `Play ${describeCard(card)}` : describeCard(card)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------ Color picker ------------------------------ */

const COLOR_LABEL_BG: Record<Color, string> = {
  red: 'linear-gradient(145deg,#fb7185,#dc2626)',
  yellow: 'linear-gradient(145deg,#fde047,#f59e0b)',
  green: 'linear-gradient(145deg,#4ade80,#16a34a)',
  blue: 'linear-gradient(145deg,#60a5fa,#1d4ed8)',
};

function ColorPicker({ onPick, onCancel }: { onPick: (c: Color) => void; onCancel: () => void }) {
  return (
    <Modal label="Choose a color">
      <Panel className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/50">Wild card</p>
        <h2 className="mb-5 mt-1 text-2xl font-black">Choose a color</h2>
        <div className="grid grid-cols-2 gap-3">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onPick(color)}
              className="h-24 rounded-2xl text-lg font-black text-white shadow-xl ring-1 ring-white/30 transition hover:scale-[1.03] focus:outline-none focus:ring-4 focus:ring-white/50 active:scale-[0.98]"
              style={{ background: COLOR_LABEL_BG[color], textShadow: '0 1px 3px rgb(0 0 0 / 0.4)' }}
            >
              {color}
            </button>
          ))}
        </div>
        <Button variant="ghost" className="mt-5" onClick={onCancel}>
          Cancel
        </Button>
      </Panel>
    </Modal>
  );
}

/* ------------------------------- Round / game ----------------------------- */

function RoundOverlay({
  room,
  round,
  isHost,
  send,
  nameOf,
}: {
  room: RoomView;
  round: PublicRound;
  isHost: boolean;
  send: (message: ClientMessage) => void;
  nameOf: (id: string | null) => string;
}) {
  if (room.status !== 'roundOver' && room.status !== 'gameOver') return null;
  const standings = [...room.players].sort((a, b) => b.score - a.score);
  const gameOver = room.status === 'gameOver';
  const winnerName = nameOf(round.winnerId);
  const seatIndex = new Map(room.players.map((p, i) => [p.id, i]));

  return (
    <Modal label={gameOver ? 'Game over' : 'Round over'}>
      <Panel className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/50">
          {gameOver ? 'Game over' : 'Round over'}
        </p>
        <h2 className="text-gradient mt-2 text-4xl font-black">
          {gameOver ? `${nameOf(room.gameWinnerId)} wins!` : `${winnerName} went out!`}
        </h2>
        {!gameOver && room.lastRoundPoints !== null && (
          <p className="mt-2">
            <Badge tone="green">+{room.lastRoundPoints} points</Badge>
          </p>
        )}

        <ol className="mx-auto mt-6 flex flex-col gap-2 text-left">
          {standings.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2.5 ring-1 ring-white/5">
              <span className="w-5 text-sm font-black text-white/40">{i + 1}</span>
              <Avatar name={p.name} index={seatIndex.get(p.id) ?? 0} size="sm" />
              <span className="flex-1 truncate font-bold">{p.name}</span>
              <span className="font-black tabular-nums">{p.score}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-col items-center gap-2">
          {isHost ? (
            gameOver ? (
              <Button variant="primary" className="w-full py-3" onClick={() => send({ type: 'start', cardsPerPlayer: room.cardsPerPlayer })}>
                Play again
              </Button>
            ) : (
              <Button variant="primary" className="w-full py-3" onClick={() => send({ type: 'nextRound' })}>
                Next round
              </Button>
            )
          ) : (
            <p className="text-sm text-white/60">Waiting for the host to continue…</p>
          )}
        </div>
      </Panel>
    </Modal>
  );
}

/* --------------------------------- Log ------------------------------------ */

function Log({ entries }: { entries: string[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);
  return (
    <ol ref={ref} className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1" aria-live="polite">
      {entries.map((line, i) => (
        <li key={i} className="leading-snug text-white/65">
          {line}
        </li>
      ))}
    </ol>
  );
}

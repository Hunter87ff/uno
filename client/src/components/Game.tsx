import {
    type Card,
    CardType,
    ClientMessageType,
    ActionType,
    RoomStatus,
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

    const act = (action: Extract<ClientMessage, { type: ClientMessageType.Action }>['action']) =>
        send({ type: ClientMessageType.Action, action });

    function playCard(card: Card) {
        if (!isMyTurn || !playable.has(card.id)) return;
        if (isWild(card)) {
            setPickingFor(card);
            return;
        }
        act({ type: ActionType.Play, cardId: card.id, uno: unoArmed });
        setUnoArmed(false);
    }

    function chooseColor(color: Color) {
        if (!pickingFor) return;
        act({ type: ActionType.Play, cardId: pickingFor.id, color, uno: unoArmed });
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
                            onClick={() => send({ type: ClientMessageType.ResetRoom })}
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
                                    <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => act({ type: ActionType.CatchUno, target: seat.id })}>
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
                                onClick={canDraw ? () => act({ type: ActionType.Draw }) : undefined}
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
                    className={`glass max-w-xl rounded-2xl px-5 py-2.5 text-center text-sm font-semibold ${isMyTurn ? 'text-amber-100 ring-1 ring-amber-300/40' : 'text-white/80'
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
                                <Button variant="secondary" disabled={!canDraw} onClick={() => act({ type: ActionType.Draw })}>
                                    {round.pendingDraw > 0 ? `Draw ${round.pendingDraw}` : 'Draw card'}
                                </Button>
                            ) : (
                                <Button variant="secondary" disabled={!canPass} onClick={() => act({ type: ActionType.Pass })}>
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
                                if (!unoArmed) act({ type: ActionType.CallUno });
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

/* ----------------------------- Color picker ------------------------------ */

function ColorPicker({ onPick, onCancel }: { onPick: (color: Color) => void; onCancel: () => void }) {
    return (
        <Modal label="Choose a color">
            <Panel className="text-center">
                <h2 className="text-lg font-black text-white">Choose a color</h2>
                <p className="mt-1 text-xs text-white/60">Which color should continue play?</p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                    {COLORS.map((color) => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => onPick(color)}
                            className="flex h-20 items-center justify-center rounded-2xl text-base font-black capitalize text-white shadow-lg transition hover:scale-105 active:scale-95"
                            style={{ background: COLOR_FILL[color] }}
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

/* ----------------------------- Round overlay ----------------------------- */

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
    send: (m: ClientMessage) => void;
    nameOf: (id: string | null) => string;
}) {
    if (room.status !== RoomStatus.RoundOver && room.status !== RoomStatus.GameOver) return null;

    const gameOver = room.status === RoomStatus.GameOver;
    const winner = nameOf(gameOver ? room.gameWinnerId : round.winnerId);
    const sorted = [...room.players].sort((a, b) => b.score - a.score);

    return (
        <Modal label={gameOver ? 'Game over' : 'Round over'}>
            <Panel className="text-center">
                <span className="text-4xl" aria-hidden>
                    {gameOver ? '🏆' : '🎉'}
                </span>
                <h2 className="mt-2 text-2xl font-black text-white">
                    {gameOver ? `${winner} wins the game!` : `${winner} won the round!`}
                </h2>
                {room.lastRoundPoints !== null && !gameOver && (
                    <p className="mt-1">
                        <Badge tone="green">+{room.lastRoundPoints} points</Badge>
                    </p>
                )}

                <div className="my-5 divide-y divide-white/10 rounded-2xl bg-black/30 p-2 text-left">
                    {sorted.map((p, i) => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-xs text-white/40">#{i + 1}</span>
                                <Avatar name={p.name} index={i} size="sm" />
                                <span className="font-bold text-white/90">{p.name}</span>
                            </div>
                            <span className="font-black text-amber-300">{p.score} pts</span>
                        </div>
                    ))}
                </div>

                {isHost ? (
                    gameOver ? (
                        <Button
                            variant="primary"
                            className="w-full py-3"
                            onClick={() => send({ type: ClientMessageType.Start, cardsPerPlayer: room.cardsPerPlayer })}
                        >
                            Start new game
                        </Button>
                    ) : (
                        <Button variant="primary" className="w-full py-3" onClick={() => send({ type: ClientMessageType.NextRound })}>
                            Next round →
                        </Button>
                    )
                ) : (
                    <p className="text-xs text-white/60">Waiting for the host to continue…</p>
                )}
            </Panel>
        </Modal>
    );
}

/* --------------------------------- Log ----------------------------------- */

function Log({ entries }: { entries: string[] }) {
    const listRef = useRef<HTMLOListElement>(null);
    useEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [entries]);

    if (entries.length === 0) return <p className="mt-2 text-white/40">No plays yet.</p>;
    return (
        <ol ref={listRef} className="mt-2 max-h-36 space-y-1 overflow-y-auto font-mono text-[11px] text-white/70">
            {entries.map((entry, i) => (
                <li key={i}>{entry}</li>
            ))}
        </ol>
    );
}

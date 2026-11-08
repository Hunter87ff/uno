import {
    CARDS_PER_PLAYER,
    type ClientMessage,
    ClientMessageType,
    MIN_PLAYERS,
    type RoomView,
    type Rules,
} from '@uno/shared';
import { useState } from 'react';
import { Avatar, Badge, Button, Logo, Panel } from './ui';
import { RoomSettingsModal, type LayoutMode } from './RoomSettingsModal';

const MAX_PLAYERS_SHOWN = 10;

interface LobbyProps {
    room: RoomView;
    connected: boolean;
    send: (message: ClientMessage) => void;
    onLeave: () => void;
    layoutMode: LayoutMode;
    onChangeLayoutMode: (mode: LayoutMode) => void;
}

export function Lobby({ room, connected, send, onLeave, layoutMode, onChangeLayoutMode }: LobbyProps) {
    const [copied, setCopied] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const isHost = room.hostId === room.you;
    const playerCount = room.players.length;
    const canStart = isHost && playerCount >= MIN_PLAYERS;

    // Host picks how many cards each player gets; the server shuffles, deals and starts the game.
    const [cards, setCards] = useState(room.cardsPerPlayer);
    // With more players, fewer cards fit in the deck (one card is kept to start the pile).
    const maxCards = Math.min(CARDS_PER_PLAYER.max, Math.floor(107 / Math.max(playerCount, 1)));
    const dealCount = Math.min(cards, maxCards);
    const canDeal = canStart && dealCount >= CARDS_PER_PLAYER.min;

    const shareUrl = `${location.origin}/?room=${room.code}`;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard may be unavailable (insecure origin); the link is shown anyway.
        }
    };

    const updateRules = (partial: Partial<Rules>) => send({ type: ClientMessageType.Settings, rules: partial });

    // Count how many custom cards are enabled
    const activeCards = Object.entries(room.rules.cards ?? {}).filter(([, v]) => Boolean(v));

    // Show empty seats so the room looks like it is filling up.
    const emptySeats = Math.max(0, Math.min(4, MAX_PLAYERS_SHOWN) - playerCount);

    return (
        <div className="app-bg flex min-h-full flex-col">
            {/* Top bar */}
            <header className="flex items-center justify-between px-6 py-4">
                <Logo size="sm" />
                <div className="flex items-center gap-3">
                    <Button
                        variant="secondary"
                        className="px-3.5 py-1.5 text-xs font-bold ring-white/20 hover:bg-white/20"
                        onClick={() => setSettingsOpen(true)}
                    >
                        ⚙ Room Settings
                    </Button>
                    <Badge tone={connected ? 'green' : 'red'}>
                        <span className={`size-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        {connected ? 'Live' : 'Reconnecting…'}
                    </Badge>
                    <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onLeave}>
                        Leave room
                    </Button>
                </div>
            </header>

            <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pb-10">
                {/* Hero: room code */}
                <Panel className="relative overflow-hidden text-center">
                    <div
                        className="pointer-events-none absolute inset-0 opacity-60"
                        style={{
                            background:
                                'radial-gradient(circle at 20% 0%, rgb(239 68 68 / 0.25), transparent 45%), radial-gradient(circle at 80% 100%, rgb(59 130 246 / 0.25), transparent 45%)',
                        }}
                    />
                    <div className="relative flex flex-col items-center gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/50">Room code</p>
                        <p
                            className="text-gradient font-mono text-6xl font-black tracking-[0.2em] sm:text-7xl"
                            data-testid="room-code"
                        >
                            {room.code}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                            <Button variant="secondary" onClick={copy}>
                                {copied ? '✓ Copied' : '⧉ Copy invite link'}
                            </Button>
                            <span className="max-w-xs truncate rounded-xl bg-black/30 px-3 py-2 font-mono text-xs text-white/50 ring-1 ring-white/10">
                                {shareUrl}
                            </span>
                        </div>
                    </div>
                </Panel>

                <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                    {/* Players */}
                    <Panel>
                        <div className="mb-5 flex items-center justify-between">
                            <h2 className="text-lg font-black">Players</h2>
                            <Badge tone="gold">
                                {playerCount} / {MAX_PLAYERS_SHOWN}
                            </Badge>
                        </div>
                        <ul className="flex flex-col gap-2.5">
                            {room.players.map((p, i) => (
                                <li
                                    key={p.id}
                                    className="group flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/5 transition hover:bg-white/[0.07]"
                                >
                                    <Avatar name={p.name} index={i} />
                                    <div className="flex min-w-0 flex-1 flex-col">
                                        <span className="flex items-center gap-2">
                                            <span className="truncate font-bold">{p.name}</span>
                                            {p.id === room.you && <Badge>you</Badge>}
                                        </span>
                                        <span className="flex items-center gap-1.5 text-xs text-white/50">
                                            <span className={`size-1.5 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                                            {p.connected ? 'Online' : 'Offline'}
                                        </span>
                                    </div>
                                    {p.isHost && (
                                        <span className="flex items-center gap-1 rounded-full bg-amber-300/15 px-2.5 py-1 text-xs font-bold text-amber-200 ring-1 ring-amber-300/30">
                                            ♛ Host
                                        </span>
                                    )}
                                    {isHost && p.id !== room.you && (
                                        <Button
                                            variant="ghost"
                                            className="px-2 py-1 text-xs text-rose-300 opacity-70 hover:bg-rose-500/10 group-hover:opacity-100"
                                            onClick={() => send({ type: ClientMessageType.Kick, playerId: p.id })}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </li>
                            ))}
                            {Array.from({ length: emptySeats }).map((_, i) => (
                                <li
                                    key={`empty-${i}`}
                                    className="flex items-center gap-3 rounded-2xl border border-dashed border-white/10 px-3 py-2.5 text-sm text-white/35"
                                >
                                    <span className="flex size-11 items-center justify-center rounded-full border border-dashed border-white/15">
                                        +
                                    </span>
                                    Waiting for a player…
                                </li>
                            ))}
                        </ul>
                    </Panel>

                    <div className="flex flex-col gap-6">
                        {/* Room Rules Summary */}
                        <Panel>
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-black">Room Rules & Settings</h2>
                                <Button
                                    variant="secondary"
                                    className="px-3 py-1 text-xs"
                                    onClick={() => setSettingsOpen(true)}
                                >
                                    {isHost ? 'Edit Settings ⚙' : 'View Settings ⚙'}
                                </Button>
                            </div>
                            <div className="flex flex-col gap-3 text-xs">
                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03]">
                                    <span className="text-white/70">Play to Target</span>
                                    <span className="font-bold text-white">{room.rules.targetScore} points</span>
                                </div>
                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03]">
                                    <span className="text-white/70">Plus Card Stacking</span>
                                    <Badge tone={room.rules.stacking ? 'green' : undefined}>
                                        {room.rules.stacking ? 'Enabled (Same or Higher)' : 'Disabled'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03]">
                                    <span className="text-white/70">Turn Timer</span>
                                    <Badge tone={room.rules.turnTimer > 0 ? 'green' : undefined}>
                                        {room.rules.turnTimer > 0 ? `${room.rules.turnTimer} seconds` : 'Disabled'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03]">
                                    <span className="text-white/70">Elimination Limit</span>
                                    <Badge tone={room.rules.eliminationLimit !== null ? 'red' : undefined}>
                                        {room.rules.eliminationLimit !== null
                                            ? `Max ${room.rules.eliminationLimit} cards`
                                            : 'Disabled'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03]">
                                    <span className="text-white/70">Special Expansion Cards</span>
                                    <Badge tone={activeCards.length > 0 ? 'gold' : undefined}>
                                        {activeCards.length > 0 ? `${activeCards.length} Enabled` : 'Standard Deck'}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03]">
                                    <span className="text-white/70">Window Layout</span>
                                    <span className="font-bold capitalize text-white">{layoutMode} mode</span>
                                </div>
                            </div>
                        </Panel>

                        {/* Deal */}
                        <Panel className="relative overflow-hidden">
                            <h2 className="text-lg font-black">Deal</h2>
                            {isHost ? (
                                <div className="mt-4 flex flex-col gap-5">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-bold">Cards per player</p>
                                            <p className="text-xs text-white/50">
                                                {playerCount >= MIN_PLAYERS
                                                    ? `${CARDS_PER_PLAYER.min}–${maxCards} with ${playerCount} players`
                                                    : `Waiting for at least ${MIN_PLAYERS} players`}
                                            </p>
                                        </div>
                                        <div
                                            className="flex items-center gap-2 rounded-2xl bg-black/30 p-1.5 ring-1 ring-white/10"
                                            role="group"
                                            aria-label="Cards per player"
                                        >
                                            <Button
                                                variant="ghost"
                                                aria-label="Fewer cards"
                                                className="size-10 p-0 text-xl"
                                                disabled={cards <= CARDS_PER_PLAYER.min}
                                                onClick={() => setCards((c) => Math.max(CARDS_PER_PLAYER.min, c - 1))}
                                            >
                                                −
                                            </Button>
                                            <span
                                                className="w-10 text-center text-3xl font-black tabular-nums"
                                                data-testid="cards-per-player"
                                            >
                                                {dealCount}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                aria-label="More cards"
                                                className="size-10 p-0 text-xl"
                                                disabled={dealCount >= maxCards}
                                                onClick={() => setCards((c) => Math.min(maxCards, c + 1))}
                                            >
                                                +
                                            </Button>
                                        </div>
                                    </div>

                                    <FanPreview count={Math.min(dealCount, 7)} />

                                    <Button
                                        variant="primary"
                                        className="w-full py-4 text-base"
                                        disabled={!canDeal}
                                        onClick={() => send({ type: ClientMessageType.Start, cardsPerPlayer: dealCount })}
                                    >
                                        {canStart ? `🔀 Shuffle & deal ${dealCount} cards each` : `Need at least ${MIN_PLAYERS} players`}
                                    </Button>
                                </div>
                            ) : (
                                <div className="mt-4 flex flex-col items-center gap-4 text-center">
                                    <FanPreview count={Math.min(room.cardsPerPlayer, 7)} />
                                    <p className="text-sm text-white/65">
                                        Waiting for the host to shuffle and deal <strong className="text-white">{room.cardsPerPlayer}</strong>{' '}
                                        cards to each player.
                                    </p>
                                </div>
                            )}
                        </Panel>
                    </div>
                </div>
            </main>

            <RoomSettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                rules={room.rules}
                isHost={isHost}
                onUpdateRules={updateRules}
                layoutMode={layoutMode}
                onChangeLayoutMode={onChangeLayoutMode}
            />
        </div>
    );
}

/** Decorative fan of face-down cards that previews the deal. */
function FanPreview({ count }: { count: number }) {
    const n = Math.max(1, count);
    return (
        <div className="flex h-24 items-end justify-center" aria-hidden>
            {Array.from({ length: n }).map((_, i) => {
                const mid = (n - 1) / 2;
                const angle = (i - mid) * (n > 1 ? 7 : 0);
                const lift = Math.abs(i - mid) * 2;
                return (
                    <span
                        key={i}
                        className="-mx-2 block h-16 w-11 origin-bottom rounded-lg border-2 border-white shadow-lg shadow-black/40 transition-transform duration-300"
                        style={{
                            background:
                                'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.08) 0 5px, transparent 5px 10px), linear-gradient(145deg, #dc2626, #991b1b)',
                            transform: `rotate(${angle}deg) translateY(${lift}px)`,
                        }}
                    />
                );
            })}
        </div>
    );
}

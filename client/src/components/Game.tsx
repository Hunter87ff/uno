import {
	ActionType,
	type Card,
	CardType,
	type ClientMessage,
	ClientMessageType,
	type Color,
	COLORS,
	describeCard,
	isWild,
	type PublicRound,
	RoomStatus,
	type RoomView,
} from "@uno/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import { CardBack, CardFace, COLOR_FILL } from "./Card";
import type { LayoutMode } from "./RoomSettingsModal";
import { Avatar, Badge, Button, Modal, Panel } from "./ui";

interface GameProps {
	room: RoomView;
	connected: boolean;
	send: (message: ClientMessage) => void;
	onLeaveTable: () => void;
	layoutMode: LayoutMode;
	onChangeLayoutMode: (mode: LayoutMode) => void;
}

export function Game({
	room,
	connected,
	send,
	onLeaveTable,
	layoutMode,
	onChangeLayoutMode,
}: GameProps) {
	const round = room.round!;
	const me = room.you;
	const isHost = room.hostId === me;
	const isEliminated = round.eliminated?.includes(me) ?? false;
	const isMyTurn = round.currentId === me && !isEliminated;

	const names = useMemo(() => new Map(room.players.map((p) => [p.id, p.name])), [room.players]);
	const seatIndex = useMemo(() => new Map(room.players.map((p, i) => [p.id, i])), [room.players]);
	const nameOf = (id: string | null) => (id ? (names.get(id) ?? "Unknown") : "—");

	const [pickingFor, setPickingFor] = useState<Card | null>(null);
	const [snatchTargeting, setSnatchTargeting] = useState<Card | null>(null);
	const [selectedSnatchTarget, setSelectedSnatchTarget] = useState<string | null>(null);
	const [unoArmed, setUnoArmed] = useState(false);

	// Live Turn Timer countdown
	const [timeLeft, setTimeLeft] = useState<number | null>(null);
	useEffect(() => {
		if (!round.turnDeadline || round.winnerId) {
			setTimeLeft(null);
			return;
		}
		const tick = () => {
			const rem = Math.max(0, Math.ceil((round.turnDeadline! - Date.now()) / 1000));
			setTimeLeft(rem);
		};
		tick();
		const timer = setInterval(tick, 250);
		return () => clearInterval(timer);
	}, [round.turnDeadline, round.winnerId, round.currentId]);

	const playable = new Set(round.playableIds);
	const handCount = round.hand.length;
	const shieldInHand = round.hand.find((c) => c.type === CardType.Shield);

	const canDraw = isMyTurn && !round.drawnCardId;
	const canPass =
		isMyTurn && round.pendingDraw === 0 && (Boolean(round.drawnCardId) || round.extraPlays > 0);
	const canCatch = Boolean(round.unoAlert && round.unoAlert !== me);

	const act = (action: Extract<ClientMessage, { type: ClientMessageType.Action }>["action"]) =>
		send({ type: ClientMessageType.Action, action });

	function playCard(card: Card) {
		if (isEliminated) return;
		if (card.type === CardType.Shield) {
			act({ type: ActionType.PlayShield, cardId: card.id });
			return;
		}
		if (!isMyTurn || !playable.has(card.id)) return;

		// Snatch needs target selection first
		if (card.type === CardType.Snatch) {
			setSnatchTargeting(card);
			return;
		}

		// Wild cards need color selection
		if (isWild(card)) {
			setPickingFor(card);
			return;
		}

		act({ type: ActionType.Play, cardId: card.id, uno: unoArmed });
		setUnoArmed(false);
	}

	function chooseColor(color: Color) {
		if (!pickingFor) return;
		const target = selectedSnatchTarget ?? undefined;
		act({ type: ActionType.Play, cardId: pickingFor.id, color, uno: unoArmed, target });
		setPickingFor(null);
		setSelectedSnatchTarget(null);
		setUnoArmed(false);
	}

	function chooseSnatchTarget(targetId: string) {
		if (!snatchTargeting) return;
		const card = snatchTargeting;
		setSnatchTargeting(null);
		setSelectedSnatchTarget(targetId);
		// Snatch is also wild, so pick color next
		setPickingFor(card);
	}

	// Seats: opponents in turn order, starting after the viewer.
	const seats = useMemo(() => {
		const idx = round.order.findIndex((p) => p.id === me);
		if (idx === -1) return round.order;
		return [...round.order.slice(idx + 1), ...round.order.slice(0, idx)];
	}, [round.order, me]);

	const presence = new Map(room.players.map((p) => [p.id, p]));

	const turnText = (() => {
		if (round.winnerId) return "";
		if (isEliminated) return "You are spectating this round.";
		if (isMyTurn) {
			if (round.pendingDraw > 0)
				return `You must draw ${round.pendingDraw} cards (or stack a same/higher plus card).`;
			if (round.extraPlays > 0)
				return "⚡ Double Trouble active! Play your second card, or pass.";
			if (round.drawnCardId) return "Play the card you drew, or pass.";
			return playable.size > 0
				? "Your turn. Play a card, or draw."
				: "Your turn. No playable card, so draw.";
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
					{round.eliminationLimit !== null && (
						<Badge tone="red">Max {round.eliminationLimit} cards</Badge>
					)}
					{!connected && <Badge tone="red">Reconnecting…</Badge>}
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() =>
							onChangeLayoutMode(
								layoutMode === "horizontal" ? "vertical" : "horizontal",
							)
						}
						className="glass flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition hover:bg-white/10"
						title="Toggle table layout mode"
					>
						<span>{layoutMode === "horizontal" ? "🖥 Horizontal" : "📱 Vertical"}</span>
					</button>
					<span className="glass flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold capitalize">
						<span
							className="size-3.5 rounded-full ring-2 ring-white/50"
							style={{ background: activeFill }}
						/>
						{round.activeColor}
					</span>
					<span
						className="glass rounded-xl px-3 py-1.5 text-sm font-bold"
						title="Direction of play"
					>
						{round.direction === 1 ? "↻ Clockwise" : "↺ Counter-clockwise"}
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

			{/* Spectating Notice if Eliminated */}
			{isEliminated && (
				<div className="mx-auto max-w-xl px-4 pt-1">
					<div className="rounded-2xl border border-rose-500/40 bg-rose-950/60 px-4 py-2 text-center text-xs font-bold text-rose-200 shadow-lg shadow-rose-950/50 backdrop-blur-md">
						💀 You exceeded the maximum card limit and were eliminated from this round.
						You are spectating the match.
					</div>
				</div>
			)}

			{/* Opponents Section */}
			<section
				className={`flex gap-3 px-4 pt-2 ${
					layoutMode === "vertical"
						? "flex-nowrap justify-start overflow-x-auto pb-1 sm:justify-center"
						: "flex-wrap justify-center"
				}`}
				aria-label="Other players"
			>
				{seats.map((seat) => {
					const isTurn = round.currentId === seat.id;
					const info = presence.get(seat.id);
					const alert = round.unoAlert === seat.id;
					const shown = Math.min(seat.cardCount, 7);
					const isSeatEliminated = seat.eliminated || round.eliminated?.includes(seat.id);
					const isSeatShielded =
						seat.shielded || round.shieldedPlayers?.includes(seat.id);

					return (
						<div
							key={seat.id}
							className={`glass relative w-44 shrink-0 rounded-2xl p-3 transition ${
								isTurn ? "turn-glow ring-2 ring-amber-300/60" : ""
							} ${isSeatEliminated ? "opacity-40 grayscale" : ""}`}
						>
							<div className="flex items-center gap-2.5">
								<Avatar
									name={seat.name}
									index={seatIndex.get(seat.id) ?? 0}
									size="sm"
								/>
								<div className="min-w-0 flex-1">
									<p className="flex items-center gap-1.5 text-sm font-bold">
										<span className="truncate">{seat.name}</span>
										{!info?.connected && (
											<span
												className="size-1.5 shrink-0 rounded-full bg-slate-500"
												title="Offline"
											/>
										)}
									</p>
									<p className="text-xs text-white/50">
										{isSeatEliminated
											? "Eliminated"
											: `${seat.cardCount} cards`}
									</p>
								</div>
								{isTurn && !isSeatEliminated && (
									<div className="flex flex-col items-end">
										<Badge tone="gold">Turn</Badge>
										{timeLeft !== null && (
											<span
												className={`mt-1 font-mono text-[10px] font-black ${
													timeLeft <= 5
														? "animate-pulse text-rose-400"
														: timeLeft <= 10
															? "text-amber-300"
															: "text-emerald-400"
												}`}
											>
												{timeLeft}s
											</span>
										)}
									</div>
								)}
							</div>

							{/* Shield Badge */}
							{isSeatShielded && !isSeatEliminated && (
								<div className="mt-1 flex items-center gap-1 rounded-md bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 ring-1 ring-blue-400/40">
									<span>🛡 Shielded</span>
								</div>
							)}

							{/* Cards Fan */}
							<div className="mt-2 flex h-11 items-center justify-center -space-x-5">
								{isSeatEliminated ? (
									<span className="text-xs font-bold text-rose-300">
										Out of round
									</span>
								) : (
									Array.from({ length: shown }).map((_, i) => (
										<CardBack key={i} size="xs" />
									))
								)}
							</div>

							{/* UNO Alert & Catch button */}
							<div className="mt-1 flex min-h-7 items-center justify-center gap-2">
								{alert && !isSeatEliminated && (
									<span className="uno-pulse rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-black shadow-lg shadow-rose-600/40">
										UNO!
									</span>
								)}
								{alert && canCatch && !isEliminated && !isSeatEliminated && (
									<Button
										variant="danger"
										className="px-2.5 py-1 text-xs"
										onClick={() =>
											act({ type: ActionType.CatchUno, target: seat.id })
										}
									>
										Catch!
									</Button>
								)}
							</div>
						</div>
					);
				})}
			</section>

			{/* Table Area */}
			<main
				className={`flex flex-1 flex-col items-center justify-center gap-4 px-4 py-4 ${
					layoutMode === "vertical" ? "mx-auto w-full max-w-md" : ""
				}`}
			>
				<div
					className={`table-felt relative flex w-full items-center justify-center ${
						layoutMode === "vertical"
							? "aspect-[1.3/1] max-w-sm rounded-[36px]"
							: "aspect-[2.3/1] max-w-2xl rounded-[50%]"
					}`}
				>
					{/* Table emblem */}
					<span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[100px] font-black tracking-tighter text-white/[0.04] select-none sm:text-[120px]">
						UNO
					</span>

					<div className="relative flex items-center gap-6 sm:gap-10">
						{/* Draw Pile */}
						<div className="flex flex-col items-center gap-2">
							<CardBack
								size="lg"
								label={
									canDraw
										? round.pendingDraw > 0
											? `Draw ${round.pendingDraw}`
											: "Draw"
										: undefined
								}
								onClick={canDraw ? () => act({ type: ActionType.Draw }) : undefined}
								className={
									canDraw ? "ring-4 shadow-amber-400/40 ring-amber-300" : ""
								}
							/>
							<span className="text-xs font-semibold text-white/50">
								{round.drawPileCount} left
							</span>
						</div>

						{/* Discard Pile */}
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
									className="absolute -top-3 -right-3 size-8 rounded-full border-4 border-white shadow-lg"
									style={{ background: activeFill }}
									title={`Active color: ${round.activeColor}`}
								/>
							</div>
							<span className="text-xs font-semibold text-white/50">Discard</span>
						</div>
					</div>
				</div>

				{/* Turn Info & Countdown Banner */}
				<div
					className={`glass flex max-w-xl items-center justify-center gap-3 rounded-2xl px-5 py-2.5 text-center text-sm font-semibold ${
						isMyTurn ? "text-amber-100 ring-1 ring-amber-300/40" : "text-white/80"
					}`}
					role="status"
				>
					<span>{turnText}</span>
					{isMyTurn && timeLeft !== null && (
						<span
							className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-xs font-black shadow transition ${
								timeLeft <= 5
									? "animate-pulse bg-rose-600 text-white"
									: timeLeft <= 10
										? "bg-amber-500 text-white"
										: "bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/40"
							}`}
						>
							⏱ {timeLeft}s
						</span>
					)}
				</div>

				{/* Actions & Powerups */}
				<div className="flex min-h-11 flex-wrap items-center justify-center gap-2.5">
					{/* Shield button (usable anytime if in hand) */}
					{shieldInHand && (
						<Button
							variant="primary"
							className="bg-gradient-to-r from-blue-500 to-indigo-600 font-black text-white shadow-lg shadow-blue-500/30 hover:brightness-110"
							onClick={() =>
								act({ type: ActionType.PlayShield, cardId: shieldInHand.id })
							}
							title="Activate Shield anytime to protect from negative effects for one turn"
						>
							🛡 Activate Shield
						</Button>
					)}

					{isMyTurn && (
						<>
							{!round.drawnCardId ? (
								<Button
									variant="secondary"
									disabled={!canDraw}
									onClick={() => act({ type: ActionType.Draw })}
								>
									{round.pendingDraw > 0
										? `Draw ${round.pendingDraw}`
										: "Draw card"}
								</Button>
							) : (
								<Button
									variant="secondary"
									disabled={!canPass}
									onClick={() => act({ type: ActionType.Pass })}
								>
									Pass
								</Button>
							)}

							{round.extraPlays > 0 && !round.drawnCardId && (
								<Button
									variant="secondary"
									onClick={() => act({ type: ActionType.Pass })}
								>
									Finish Turn (Pass)
								</Button>
							)}
						</>
					)}

					{handCount <= 2 && !isEliminated && (
						<Button
							variant={unoArmed ? "danger" : "secondary"}
							className={unoArmed ? "uno-pulse" : ""}
							aria-pressed={unoArmed}
							onClick={() => {
								if (!unoArmed) act({ type: ActionType.CallUno });
								setUnoArmed((v) => !v);
							}}
							title="Press before playing your second-to-last card to call UNO"
						>
							{unoArmed ? "UNO called ✓" : "Call UNO"}
						</Button>
					)}
				</div>

				{/* Game Log */}
				<details className="glass w-full max-w-xl rounded-2xl px-4 py-2.5 text-xs text-white/70">
					<summary className="cursor-pointer font-bold text-white/80 select-none">
						Game log
					</summary>
					<Log entries={round.log} />
				</details>
			</main>

			{/* Hand tray */}
			<Hand round={round} onPlay={playCard} disabled={!isMyTurn || isEliminated} />

			{/* Modals */}
			{pickingFor && (
				<ColorPicker onPick={chooseColor} onCancel={() => setPickingFor(null)} />
			)}

			{snatchTargeting && (
				<SnatchTargetModal
					opponents={round.order.filter(
						(p) => p.id !== me && !round.eliminated?.includes(p.id) && p.cardCount > 0,
					)}
					onSelect={chooseSnatchTarget}
					onCancel={() => setSnatchTargeting(null)}
				/>
			)}

			<RoundOverlay
				room={room}
				round={round}
				isHost={room.hostId === me}
				send={send}
				nameOf={nameOf}
			/>
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
	const overlap = "-ml-6";
	const playableCount = round.playableIds.length;

	return (
		<section
			className="glass mx-auto mb-3 w-[calc(100%-1.5rem)] max-w-5xl rounded-3xl px-3 pt-3 pb-4"
			aria-label="Your hand"
		>
			<div className="mb-1 flex items-center justify-between px-3 text-xs">
				<span className="font-bold text-white/80">
					Your hand · {round.hand.length} card{round.hand.length === 1 ? "" : "s"}
				</span>
				{!disabled && playableCount > 0 && (
					<Badge tone="green">{playableCount} playable</Badge>
				)}
			</div>
			<div className="hide-scrollbar flex justify-start overflow-x-auto px-4 pt-7 pb-3 md:justify-center">
				{round.hand.length === 0 && (
					<p className="py-6 text-sm text-white/50">No cards in hand.</p>
				)}
				{round.hand.map((card, i) => {
					const isPlayable =
						(!disabled && playable.has(card.id)) || card.type === CardType.Shield;
					return (
						<div
							key={card.id}
							className={`relative focus-within:z-10 hover:z-10 ${i === 0 ? "" : overlap}`}
						>
							<CardFace
								card={card}
								size="md"
								highlighted={isPlayable}
								dimmed={!isPlayable}
								onClick={() => onPlay(card)}
								title={
									isPlayable ? `Play ${describeCard(card)}` : describeCard(card)
								}
							/>
						</div>
					);
				})}
			</div>
		</section>
	);
}

/* ----------------------------- Color picker ------------------------------ */

function ColorPicker({
	onPick,
	onCancel,
}: {
	onPick: (color: Color) => void;
	onCancel: () => void;
}) {
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
							className="flex h-20 items-center justify-center rounded-2xl text-base font-black text-white capitalize shadow-lg transition hover:scale-105 active:scale-95"
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

/* ------------------------- Snatch Target Selector ------------------------ */

function SnatchTargetModal({
	opponents,
	onSelect,
	onCancel,
}: {
	opponents: PublicRound["order"];
	onSelect: (targetId: string) => void;
	onCancel: () => void;
}) {
	return (
		<Modal label="Snatch a Card">
			<Panel className="text-center">
				<h2 className="flex items-center justify-center gap-2 text-lg font-black text-white">
					<span>🤏 Snatch a Card</span>
				</h2>
				<p className="mt-1 text-xs text-white/60">
					Choose an opponent to take a random card from:
				</p>
				<div className="mt-4 flex max-h-60 flex-col gap-2.5 overflow-y-auto">
					{opponents.length === 0 && (
						<p className="py-4 text-xs text-white/40">
							No eligible opponents to snatch from.
						</p>
					)}
					{opponents.map((p, i) => (
						<button
							key={p.id}
							type="button"
							onClick={() => onSelect(p.id)}
							className="group flex items-center justify-between rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 transition hover:bg-white/10"
						>
							<div className="flex items-center gap-3">
								<Avatar name={p.name} index={i} size="sm" />
								<span className="text-sm font-bold text-white">{p.name}</span>
							</div>
							<span className="font-mono text-xs font-bold text-amber-300">
								{p.cardCount} card{p.cardCount === 1 ? "" : "s"}
							</span>
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
	const sorted = [...room.players].sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		if (a.id === round.winnerId) return -1;
		if (b.id === round.winnerId) return 1;
		return 0;
	});

	return (
		<Modal label={gameOver ? "Game over" : "Round over"}>
			<Panel className="text-center">
				<span className="text-4xl" aria-hidden>
					{gameOver ? "🏆" : "🎉"}
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
						<div
							key={p.id}
							className="flex items-center justify-between px-3 py-2 text-sm"
						>
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
							onClick={() =>
								send({
									type: ClientMessageType.Start,
									cardsPerPlayer: room.cardsPerPlayer,
								})
							}
						>
							Start new game
						</Button>
					) : (
						<Button
							variant="primary"
							className="w-full py-3"
							onClick={() => send({ type: ClientMessageType.NextRound })}
						>
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
		<ol
			ref={listRef}
			className="mt-2 max-h-36 space-y-1 overflow-y-auto font-mono text-[11px] text-white/70"
		>
			{entries.map((entry, i) => (
				<li key={i}>{entry}</li>
			))}
		</ol>
	);
}

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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CardBack, CardFace, COLOR_FILL } from "./Card";
import type { LayoutMode } from "./RoomSettingsModal";
import { Avatar, Badge, Button, Modal, Panel } from "./ui";

const AVATAR_COLORS = [
	"#f59e0b", // Gold / Amber (hunter871)
	"#10b981", // Emerald Green (Hunter877)
	"#8b5cf6", // Purple / Violet (Shruti)
	"#3b82f6", // Blue / Sky (Aarav)
	"#ef4444", // Coral / Red (Ritwik)
	"#ec4899", // Pink / Magenta (Neha)
	"#06b6d4", // Cyan
	"#f97316", // Orange
	"#14b8a6", // Teal
	"#6366f1", // Indigo
];

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
	const [unoArmed, setUnoArmed] = useState(false);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [showLogModal, setShowLogModal] = useState(false);
	const [copiedCode, setCopiedCode] = useState(false);

	const copyCode = async () => {
		try {
			await navigator.clipboard.writeText(room.code);
			setCopiedCode(true);
			setTimeout(() => setCopiedCode(false), 1500);
		} catch {
			// Clipboard may be unavailable
		}
	};

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

	const canDraw = isMyTurn && !round.drawnCardId;
	const canPass =
		isMyTurn && round.pendingDraw === 0 && (Boolean(round.drawnCardId) || round.extraPlays > 0);
	const canCatch = Boolean(round.unoAlert && round.unoAlert !== me);

	const act = (action: Extract<ClientMessage, { type: ClientMessageType.Action }>["action"]) =>
		send({ type: ClientMessageType.Action, action });

	function playCard(card: Card) {
		if (isEliminated) return;
		if (!isMyTurn || !playable.has(card.id)) return;

		// Snatch needs target selection first
		if (card.type === CardType.Snatch) {
			setSnatchTargeting(card);
			return;
		}

		// Double Trouble, Swap Hands & Shield do not change color: play immediately
		if (
			card.type === CardType.DoubleTrouble ||
			card.type === CardType.SwapHands ||
			card.type === CardType.Shield
		) {
			act({ type: ActionType.Play, cardId: card.id, uno: unoArmed });
			setUnoArmed(false);
			return;
		}

		// Wild color-changing cards need color selection
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

	function chooseSnatchTarget(targetId: string) {
		if (!snatchTargeting) return;
		const card = snatchTargeting;
		setSnatchTargeting(null);
		act({ type: ActionType.Play, cardId: card.id, uno: unoArmed, target: targetId });
		setUnoArmed(false);
	}

	// Seats: opponents in turn order starting after viewer
	const seats = useMemo(() => {
		const idx = round.order.findIndex((p) => p.id === me);
		if (idx === -1) return round.order;
		return [...round.order.slice(idx + 1), ...round.order.slice(0, idx)];
	}, [round.order, me]);

	const presence = new Map(room.players.map((p) => [p.id, p]));

	// Desktop orbital arrangement of opponents around the green felt table
	const seatOrbit = useMemo(() => {
		const total = seats.length;
		if (total === 0) return { top: [], left: [], right: [], bottom: [] };
		if (total === 1) return { top: [seats[0]], left: [], right: [], bottom: [] };
		if (total === 2) return { top: [seats[0], seats[1]], left: [], right: [], bottom: [] };
		if (total === 3)
			return { top: [seats[1]], left: [seats[0]], right: [seats[2]], bottom: [] };
		if (total === 4)
			return {
				top: [seats[1], seats[2]],
				left: [seats[0]],
				right: [seats[3]],
				bottom: [],
			};
		if (total === 5)
			return {
				top: [seats[1], seats[2], seats[3]],
				left: [seats[0]],
				right: [seats[4]],
				bottom: [],
			};
		if (total === 6) {
			// Matches the 6-opponent screenshot:
			// Top: hunter871, Hunter877, Shruti
			// Left: Aarav
			// Right: Ritwik
			// Bottom: Neha
			return {
				top: [seats[0], seats[1], seats[2]],
				left: [seats[3]],
				right: [seats[4]],
				bottom: [seats[5]],
			};
		}
		// 7 or more opponents:
		const topCount = Math.min(3, total - 3);
		const leftCount = Math.floor((total - topCount - 1) / 2);
		const rightCount = Math.ceil((total - topCount - 1) / 2);
		return {
			top: seats.slice(0, topCount),
			left: seats.slice(topCount, topCount + leftCount),
			right: seats.slice(topCount + leftCount, topCount + leftCount + rightCount),
			bottom: seats.slice(topCount + leftCount + rightCount),
		};
	}, [seats]);

	// Mobile split: 2x2 grid on top (4 pods), 1x2 grid on bottom (2 pods)
	const mobileSeatsTop = useMemo(() => {
		const total = seats.length;
		const topCount = total >= 6 ? 4 : Math.ceil(total * 0.6);
		return seats.slice(0, topCount);
	}, [seats]);

	const mobileSeatsBottom = useMemo(() => {
		const total = seats.length;
		const topCount = total >= 6 ? 4 : Math.ceil(total * 0.6);
		return seats.slice(topCount);
	}, [seats]);

	const turnText = (() => {
		if (round.winnerId) return "";
		if (isEliminated) return "You are spectating this round.";
		if (isMyTurn) {
			if (round.pendingDraw > 0)
				return `Draw ${round.pendingDraw} cards (or stack a plus card)`;
			if (round.extraPlays > 0)
				return "⚡ Double Trouble active! Play your 2nd card or pass";
			if (round.drawnCardId) return "Play the card you drew, or pass";
			return playable.size > 0 ? "Your turn — play or draw" : "No playable card — draw";
		}
		return `Waiting for ${nameOf(round.currentId)}…`;
	})();

	const activeFill = COLOR_FILL[round.activeColor];

	return (
		<div className="game-canvas-bg relative flex min-h-screen flex-col justify-between overflow-x-hidden text-white select-none">
			{/* Background Ambient Glowing Neon Sweeps (matching reference image) */}
			<svg
				className="pointer-events-none fixed inset-0 size-full z-0 overflow-hidden"
				viewBox="0 0 1000 800"
				preserveAspectRatio="none"
				aria-hidden
			>
				<defs>
					<linearGradient id="bg-curve-left" x1="0%" y1="0%" x2="50%" y2="100%">
						<stop offset="0%" stopColor="#d946ef" stopOpacity="0.45" />
						<stop offset="50%" stopColor="#a855f7" stopOpacity="0.25" />
						<stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
					</linearGradient>
					<linearGradient id="bg-curve-right" x1="100%" y1="50%" x2="50%" y2="100%">
						<stop offset="0%" stopColor="#ec4899" stopOpacity="0.4" />
						<stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.25" />
						<stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
					</linearGradient>
				</defs>
				{/* Left sweeping glow lines */}
				<path
					d="M -10,140 C 60,300 20,540 -10,720"
					fill="none"
					stroke="url(#bg-curve-left)"
					strokeWidth="3.5"
					style={{ filter: "blur(6px)" }}
				/>
				<path
					d="M -10,140 C 60,300 20,540 -10,720"
					fill="none"
					stroke="url(#bg-curve-left)"
					strokeWidth="1.2"
				/>
				{/* Right sweeping glow lines */}
				<path
					d="M 1010,480 C 930,620 960,740 1010,820"
					fill="none"
					stroke="url(#bg-curve-right)"
					strokeWidth="3.5"
					style={{ filter: "blur(6px)" }}
				/>
				<path
					d="M 1010,480 C 930,620 960,740 1010,820"
					fill="none"
					stroke="url(#bg-curve-right)"
					strokeWidth="1.2"
				/>
			</svg>

			{/* Top Header Bar */}
			<header className="relative flex items-center justify-between px-4 py-3 sm:px-6 z-20">
				{/* Left: UNO Icon + Room Code + Target Score */}
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={copyCode}
						title="Click to copy room code"
						className="group flex items-center gap-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 transition cursor-pointer active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
					>
						<UnoHeaderLogo />
						<span className="font-black text-xl tracking-wide text-white">
							{room.code}
						</span>
						<span className="text-[10px] font-semibold tracking-wider uppercase text-white/50 group-hover:text-white/80 transition pl-0.5">
							{copiedCode ? "✓" : "⧉"}
						</span>
					</button>
					<span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-medium text-white/90 shadow-sm backdrop-blur-md">
						Play to {room.rules.targetScore}
					</span>
					{round.eliminationLimit !== null && (
						<span className="hidden sm:inline-flex rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
							Max {round.eliminationLimit} cards
						</span>
					)}
					{!connected && (
						<span className="rounded-full bg-rose-600/30 border border-rose-500/50 px-2.5 py-0.5 text-xs font-bold text-rose-200 animate-pulse">
							Reconnecting…
						</span>
					)}
				</div>

				{/* Right: Desktop Action Buttons (Restart & Leave) */}
				<div className="hidden md:flex items-center gap-3">
					{/* Host Restart Button */}
					{isHost && (
						<button
							type="button"
							onClick={() => send({ type: ClientMessageType.ResetRoom })}
							className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/90 transition shadow-sm cursor-pointer"
							title="Restart room back to lobby"
						>
							<svg
								className="size-3.5 text-white/70"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
							>
								<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
								<path d="M3 3v5h5" />
							</svg>
							<span>Restart</span>
						</button>
					)}

					{/* Leave Table Button */}
					<button
						type="button"
						onClick={onLeaveTable}
						className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/30 px-3.5 py-1.5 text-xs font-semibold text-rose-300 transition shadow-sm cursor-pointer"
						title="Leave game"
					>
						<svg
							className="size-3.5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
						>
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
							<polyline points="16 17 21 12 16 7" />
							<line x1="21" y1="12" x2="9" y2="12" />
						</svg>
						<span>Leave</span>
					</button>
				</div>

				{/* Right: Mobile Hamburger Menu Button */}
				<div className="flex md:hidden items-center gap-2">
					<button
						type="button"
						onClick={() => setMobileMenuOpen(true)}
						className="flex size-9 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition shadow-sm cursor-pointer"
						aria-label="Open menu"
					>
						<svg
							className="size-5"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2.5"
						>
							<line x1="3" y1="6" x2="21" y2="6" />
							<line x1="3" y1="12" x2="21" y2="12" />
							<line x1="3" y1="18" x2="21" y2="18" />
						</svg>
					</button>
				</div>
			</header>

			{/* Elimination Notice */}
			{isEliminated && (
				<div className="relative mx-auto max-w-md px-4 pt-1 z-10">
					<div className="rounded-2xl border border-rose-500/40 bg-rose-950/70 px-4 py-2 text-center text-xs font-bold text-rose-200 shadow-lg backdrop-blur-md">
						💀 Max card limit exceeded! You are spectating this round.
					</div>
				</div>
			)}

			{/* Main Table Arena */}
			<main className="relative flex-1 flex flex-col items-center justify-center px-3 py-2 z-10 w-full max-w-7xl mx-auto">
				{/* ----------------- MOBILE / STACKED VIEW (< 1024px or vertical mode) ----------------- */}
				<div
					className={`w-full flex-col items-center ${
						layoutMode === "vertical" ? "flex" : "flex lg:hidden"
					}`}
				>
					{/* Top Opponents 2-Column Grid */}
					{mobileSeatsTop.length > 0 && (
						<div className="grid grid-cols-2 gap-2.5 w-full max-w-md mb-2">
							{mobileSeatsTop.map((seat) => (
								<OpponentSeatPod
									key={seat.id}
									seat={seat}
									isTurn={round.currentId === seat.id}
									timeLeft={round.currentId === seat.id ? timeLeft : null}
									avatarColor={
										AVATAR_COLORS[
											(seatIndex.get(seat.id) ?? 0) % AVATAR_COLORS.length
										]
									}
									connected={presence.get(seat.id)?.connected ?? true}
									shielded={
										seat.shielded || round.shieldedPlayers?.includes(seat.id)
									}
									eliminated={
										seat.eliminated || round.eliminated?.includes(seat.id)
									}
									alert={round.unoAlert === seat.id}
									canCatch={canCatch && !isEliminated}
									onCatch={() =>
										act({ type: ActionType.CatchUno, target: seat.id })
									}
								/>
							))}
						</div>
					)}

					{/* Center Green Felt Table (Mobile) */}
					<div className="game-table-felt relative flex w-full max-w-[340px] aspect-[1.7/1] items-center justify-center rounded-[55px] px-4 my-2 select-none">
						<div className="relative flex items-center justify-center gap-7">
							{/* Draw Pile */}
							<div className="flex flex-col items-center gap-1">
								<CardBack
									size="md"
									label={
										canDraw
											? round.pendingDraw > 0
												? `Draw ${round.pendingDraw}`
												: "Draw"
											: undefined
									}
									onClick={
										canDraw ? () => act({ type: ActionType.Draw }) : undefined
									}
									className={
										canDraw
											? "ring-3 ring-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.6)] cursor-pointer"
											: ""
									}
								/>
								<span className="text-xs font-semibold text-white/80">
									{round.drawPileCount} left
								</span>
							</div>

							{/* Discard Pile */}
							<div className="flex flex-col items-center gap-1">
								<div className="relative">
									<span
										className="absolute -inset-2 rounded-xl opacity-50 blur-md"
										style={{ background: activeFill }}
										aria-hidden
									/>
									<div className="relative">
										<CardFace card={round.top} size="md" />
									</div>
									<span
										className="absolute -top-2 -right-2 size-5.5 rounded-full border-2 border-white shadow-md flex items-center justify-center"
										style={{ background: activeFill }}
										title={`Active color: ${round.activeColor}`}
									>
										<span className="size-1 rounded-full bg-white" />
									</span>
								</div>
								<span className="text-xs font-semibold text-white/80">
									Discard
								</span>
							</div>
						</div>
					</div>

					{/* Bottom Opponents 2-Column Grid */}
					{mobileSeatsBottom.length > 0 && (
						<div className="grid grid-cols-2 gap-2.5 w-full max-w-md mt-2">
							{mobileSeatsBottom.map((seat) => (
								<OpponentSeatPod
									key={seat.id}
									seat={seat}
									isTurn={round.currentId === seat.id}
									timeLeft={round.currentId === seat.id ? timeLeft : null}
									avatarColor={
										AVATAR_COLORS[
											(seatIndex.get(seat.id) ?? 0) % AVATAR_COLORS.length
										]
									}
									connected={presence.get(seat.id)?.connected ?? true}
									shielded={
										seat.shielded || round.shieldedPlayers?.includes(seat.id)
									}
									eliminated={
										seat.eliminated || round.eliminated?.includes(seat.id)
									}
									alert={round.unoAlert === seat.id}
									canCatch={canCatch && !isEliminated}
									onCatch={() =>
										act({ type: ActionType.CatchUno, target: seat.id })
									}
								/>
							))}
						</div>
					)}
				</div>

				{/* ----------------- DESKTOP ORBIT VIEW (>= 1024px & horizontal mode) ----------------- */}
				<div
					className={`w-full flex-col items-center ${
						layoutMode === "vertical" ? "hidden" : "hidden lg:flex"
					}`}
				>
					{/* Top Seats Row (3 pods) */}
					{seatOrbit.top.length > 0 && (
						<div className="flex items-center justify-center gap-4 mb-3">
							{seatOrbit.top.map((seat) => (
								<div key={seat.id} className="w-52">
									<OpponentSeatPod
										seat={seat}
										isTurn={round.currentId === seat.id}
										timeLeft={round.currentId === seat.id ? timeLeft : null}
										avatarColor={
											AVATAR_COLORS[
												(seatIndex.get(seat.id) ?? 0) % AVATAR_COLORS.length
											]
										}
										connected={presence.get(seat.id)?.connected ?? true}
										shielded={
											seat.shielded ||
											round.shieldedPlayers?.includes(seat.id)
										}
										eliminated={
											seat.eliminated || round.eliminated?.includes(seat.id)
										}
										alert={round.unoAlert === seat.id}
										canCatch={canCatch && !isEliminated}
										onCatch={() =>
											act({ type: ActionType.CatchUno, target: seat.id })
										}
									/>
								</div>
							))}
						</div>
					)}

					{/* Center Row: Left Seat + Emerald Felt Table + Right Seat */}
					<div className="flex items-center justify-center gap-6 w-full max-w-6xl">
						{/* Left Column Seat */}
						<div className="flex flex-col gap-3 w-52 shrink-0">
							{seatOrbit.left.map((seat) => (
								<OpponentSeatPod
									key={seat.id}
									seat={seat}
									isTurn={round.currentId === seat.id}
									timeLeft={round.currentId === seat.id ? timeLeft : null}
									avatarColor={
										AVATAR_COLORS[
											(seatIndex.get(seat.id) ?? 0) % AVATAR_COLORS.length
										]
									}
									connected={presence.get(seat.id)?.connected ?? true}
									shielded={
										seat.shielded || round.shieldedPlayers?.includes(seat.id)
									}
									eliminated={
										seat.eliminated || round.eliminated?.includes(seat.id)
									}
									alert={round.unoAlert === seat.id}
									canCatch={canCatch && !isEliminated}
									onCatch={() =>
										act({ type: ActionType.CatchUno, target: seat.id })
									}
								/>
							))}
						</div>

						{/* Oval Table Felt */}
						<div className="game-table-felt relative flex max-w-[560px] xl:max-w-[620px] aspect-[2.2/1] w-full items-center justify-center rounded-[50%] px-8 select-none">
							<div className="relative flex items-center justify-center gap-12 xl:gap-16">
								{/* Draw Pile */}
								<div className="flex flex-col items-center gap-1.5">
									<CardBack
										size="lg"
										label={
											canDraw
												? round.pendingDraw > 0
													? `Draw ${round.pendingDraw}`
													: "Draw"
												: undefined
										}
										onClick={
											canDraw
												? () => act({ type: ActionType.Draw })
												: undefined
										}
										className={
											canDraw
												? "ring-4 ring-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.6)] cursor-pointer"
												: ""
										}
									/>
									<span className="text-xs font-semibold text-white/80">
										{round.drawPileCount} left
									</span>
								</div>

								{/* Discard Pile */}
								<div className="flex flex-col items-center gap-1.5">
									<div className="relative">
										<span
											className="absolute -inset-2.5 rounded-2xl opacity-60 blur-lg"
											style={{ background: activeFill }}
											aria-hidden
										/>
										<div className="relative">
											<CardFace card={round.top} size="lg" />
										</div>
										<span
											className="absolute -top-3 -right-3 size-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
											style={{ background: activeFill }}
											title={`Active color: ${round.activeColor}`}
										>
											<span className="size-2 rounded-full bg-white shadow-sm" />
										</span>
									</div>
									<span className="text-xs font-semibold text-white/80">
										Discard
									</span>
								</div>
							</div>
						</div>

						{/* Right Column Seat */}
						<div className="flex flex-col gap-3 w-52 shrink-0">
							{seatOrbit.right.map((seat) => (
								<OpponentSeatPod
									key={seat.id}
									seat={seat}
									isTurn={round.currentId === seat.id}
									timeLeft={round.currentId === seat.id ? timeLeft : null}
									avatarColor={
										AVATAR_COLORS[
											(seatIndex.get(seat.id) ?? 0) % AVATAR_COLORS.length
										]
									}
									connected={presence.get(seat.id)?.connected ?? true}
									shielded={
										seat.shielded || round.shieldedPlayers?.includes(seat.id)
									}
									eliminated={
										seat.eliminated || round.eliminated?.includes(seat.id)
									}
									alert={round.unoAlert === seat.id}
									canCatch={canCatch && !isEliminated}
									onCatch={() =>
										act({ type: ActionType.CatchUno, target: seat.id })
									}
								/>
							))}
						</div>
					</div>

					{/* Bottom Seats Row (Neha) */}
					{seatOrbit.bottom.length > 0 && (
						<div className="flex items-center justify-center gap-4 mt-3">
							{seatOrbit.bottom.map((seat) => (
								<div key={seat.id} className="w-52">
									<OpponentSeatPod
										seat={seat}
										isTurn={round.currentId === seat.id}
										timeLeft={round.currentId === seat.id ? timeLeft : null}
										avatarColor={
											AVATAR_COLORS[
												(seatIndex.get(seat.id) ?? 0) % AVATAR_COLORS.length
											]
										}
										connected={presence.get(seat.id)?.connected ?? true}
										shielded={
											seat.shielded ||
											round.shieldedPlayers?.includes(seat.id)
										}
										eliminated={
											seat.eliminated || round.eliminated?.includes(seat.id)
										}
										alert={round.unoAlert === seat.id}
										canCatch={canCatch && !isEliminated}
										onCatch={() =>
											act({ type: ActionType.CatchUno, target: seat.id })
										}
									/>
								</div>
							))}
						</div>
					)}
				</div>
			</main>

			{/* Player's Hand Tray (Bottom Game Dock) */}
			<Hand
				round={round}
				onPlay={playCard}
				disabled={!isMyTurn || isEliminated}
				canDraw={canDraw}
				canPass={canPass}
				onDraw={() => act({ type: ActionType.Draw })}
				onPass={() => act({ type: ActionType.Pass })}
				isMyTurn={isMyTurn}
				timeLeft={timeLeft}
				turnText={turnText}
				unoArmed={unoArmed}
				onToggleUno={() => {
					if (!unoArmed) act({ type: ActionType.CallUno });
					setUnoArmed((v) => !v);
				}}
			/>

			{/* Mobile Drawer Menu Modal */}
			{mobileMenuOpen && (
				<Modal label="Game Menu">
					<Panel className="space-y-4">
						<div className="flex items-center justify-between border-b border-white/10 pb-3">
							<button
								type="button"
								onClick={copyCode}
								title="Click to copy room code"
								className="group flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-white/10 cursor-pointer"
							>
								<UnoHeaderLogo />
								<span className="font-black text-lg text-white">
									Room {room.code}
								</span>
								<span className="text-xs text-white/50 group-hover:text-white transition">
									{copiedCode ? "✓ Copied" : "⧉"}
								</span>
							</button>
							<button
								type="button"
								onClick={() => setMobileMenuOpen(false)}
								className="size-8 rounded-full bg-white/10 text-white/70 hover:text-white flex items-center justify-center cursor-pointer"
							>
								✕
							</button>
						</div>

						<div className="grid grid-cols-2 gap-2 text-xs">
							<div className="rounded-xl bg-white/5 p-2.5">
								<span className="text-white/50 block">Active Color</span>
								<div className="mt-1 flex items-center gap-1.5 font-bold capitalize">
									<span
										className="size-3 rounded-full"
										style={{ background: activeFill }}
									/>
									{round.activeColor}
								</div>
							</div>
							<div className="rounded-xl bg-white/5 p-2.5">
								<span className="text-white/50 block">Direction</span>
								<span className="mt-1 block font-bold">
									{round.direction === 1 ? "↻ Clockwise" : "↺ Counter-clockwise"}
								</span>
							</div>
							<div className="rounded-xl bg-white/5 p-2.5">
								<span className="text-white/50 block">Target Score</span>
								<span className="mt-1 block font-bold">
									{room.rules.targetScore} pts
								</span>
							</div>
							<div className="rounded-xl bg-white/5 p-2.5">
								<span className="text-white/50 block">Elimination</span>
								<span className="mt-1 block font-bold">
									{round.eliminationLimit !== null
										? `${round.eliminationLimit} cards`
										: "Off"}
								</span>
							</div>
						</div>

						<div className="flex flex-col gap-2 pt-2">
							<Button
								variant="secondary"
								onClick={() => {
									onChangeLayoutMode(
										layoutMode === "horizontal" ? "vertical" : "horizontal",
									);
									setMobileMenuOpen(false);
								}}
							>
								{layoutMode === "horizontal"
									? "📱 Switch to Stacked Layout"
									: "🖥 Switch to Orbit Layout"}
							</Button>

							<Button
								variant="secondary"
								onClick={() => {
									setShowLogModal(true);
									setMobileMenuOpen(false);
								}}
							>
								📜 View Game Log
							</Button>

							{isHost && (
								<Button
									variant="secondary"
									className="text-rose-300 ring-rose-500/30 hover:bg-rose-500/20"
									onClick={() => {
										send({ type: ClientMessageType.ResetRoom });
										setMobileMenuOpen(false);
									}}
								>
									Restart Room to Lobby
								</Button>
							)}

							<Button
								variant="danger"
								onClick={() => {
									setMobileMenuOpen(false);
									onLeaveTable();
								}}
							>
								Leave Table
							</Button>
						</div>
					</Panel>
				</Modal>
			)}

			{/* Game Log Modal */}
			{showLogModal && (
				<Modal label="Game Log">
					<Panel className="space-y-3 max-h-[80vh] flex flex-col">
						<div className="flex items-center justify-between border-b border-white/10 pb-2">
							<h3 className="font-bold text-white text-base">📜 Game Log</h3>
							<button
								type="button"
								onClick={() => setShowLogModal(false)}
								className="size-7 rounded-full bg-white/10 text-white/70 hover:text-white flex items-center justify-center text-xs cursor-pointer"
							>
								✕
							</button>
						</div>
						<div className="flex-1 overflow-y-auto min-h-48 max-h-96">
							<Log entries={round.log} />
						</div>
						<Button
							variant="ghost"
							className="w-full text-xs"
							onClick={() => setShowLogModal(false)}
						>
							Close
						</Button>
					</Panel>
				</Modal>
			)}

			{/* Wild Color Picker Modal */}
			{pickingFor && (
				<ColorPicker onPick={chooseColor} onCancel={() => setPickingFor(null)} />
			)}

			{/* Snatch Target Modal */}
			{snatchTargeting && (
				<SnatchTargetModal
					opponents={round.order.filter(
						(p) =>
							p.id !== me &&
							!round.eliminated?.includes(p.id) &&
							p.cardCount > 0,
					)}
					onSelect={chooseSnatchTarget}
					onCancel={() => setSnatchTargeting(null)}
				/>
			)}

			{/* Round / Game Over Scoreboard Overlay */}
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

/* --------------------------- UNO Header Logo ----------------------------- */

function UnoHeaderLogo() {
	return (
		<div
			className="relative flex size-8 shrink-0 items-center justify-center select-none"
			aria-hidden
		>
			{/* Back card (Yellow, tilted right) */}
			<div className="absolute h-6.5 w-4.5 rounded-[4px] border-[1.5px] border-white bg-amber-400 shadow-md shadow-black/50 rotate-[14deg] translate-x-1" />
			{/* Front card (Red, tilted left) */}
			<div className="absolute h-6.5 w-4.5 rounded-[4px] border-[1.5px] border-white bg-rose-600 shadow-lg shadow-black/60 -rotate-[10deg] -translate-x-1 flex items-center justify-center">
				<span className="text-[5px] font-black tracking-tighter text-amber-300">UNO</span>
			</div>
		</div>
	);
}

/* -------------------------- Opponent Card Fan ---------------------------- */

function OpponentCardFan({ count }: { count: number }) {
	const visibleCards = Math.max(3, Math.min(count, 8));
	const cardWidth = 20;
	const cardHeight = 30;
	const step = 5.5;
	const totalWidth = (visibleCards - 1) * step + cardWidth;
	const totalHeight = cardHeight + 4;

	return (
		<div className="flex items-center justify-center select-none" aria-hidden>
			<svg
				width={totalWidth}
				height={totalHeight}
				viewBox={`0 0 ${totalWidth} ${totalHeight}`}
				className="overflow-visible drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
			>
				<defs>
					<pattern
						id="fan-stripes"
						width="4"
						height="4"
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<line
							x1="0"
							y1="0"
							x2="0"
							y2="4"
							stroke="#ffffff"
							strokeWidth="0.8"
							opacity="0.18"
						/>
					</pattern>
				</defs>
				{Array.from({ length: visibleCards }).map((_, i) => {
					const isLast = i === visibleCards - 1;
					const x = i * step;
					const y = 2 + Math.abs(i - (visibleCards - 1) / 2) * 0.4;
					const rot = (i - (visibleCards - 1) / 2) * 2;
					return (
						<g
							key={i}
							transform={`translate(${x}, ${y}) rotate(${rot} ${cardWidth / 2} ${cardHeight / 2})`}
						>
							<rect
								x="0"
								y="0"
								width={cardWidth}
								height={cardHeight}
								rx="3"
								fill="#b91c1c"
								stroke="#ffffff"
								strokeWidth="1.2"
							/>
							<rect
								x="1"
								y="1"
								width={cardWidth - 2}
								height={cardHeight - 2}
								rx="2"
								fill="url(#fan-stripes)"
							/>
							{isLast && (
								<g
									transform={`translate(${cardWidth / 2}, ${cardHeight / 2}) rotate(-20)`}
								>
									<ellipse
										cx="0"
										cy="0"
										rx="8.5"
										ry="5"
										fill="#dc2626"
										stroke="#ffffff"
										strokeWidth="0.8"
									/>
									<text
										x="0"
										y="2"
										textAnchor="middle"
										fill="#facc15"
										fontSize="5.5"
										fontWeight="900"
										fontFamily="system-ui, -apple-system, sans-serif"
										letterSpacing="-0.3px"
									>
										UNO
									</text>
								</g>
							)}
						</g>
					);
				})}
			</svg>
		</div>
	);
}

/* ------------------------ Opponent Seat Pod ------------------------------ */

function OpponentSeatPod({
	seat,
	isTurn,
	timeLeft,
	avatarColor,
	connected,
	shielded,
	eliminated,
	alert,
	canCatch,
	onCatch,
}: {
	seat: PublicRound["order"][number];
	isTurn: boolean;
	timeLeft: number | null;
	avatarColor: string;
	connected: boolean;
	shielded?: boolean;
	eliminated?: boolean;
	alert?: boolean;
	canCatch?: boolean;
	onCatch: () => void;
}) {
	return (
		<div
			className={`game-glass-pod relative flex flex-col justify-between rounded-2xl p-2.5 sm:p-3 transition-all duration-300 ${
				isTurn ? "turn-active-glow ring-2 ring-amber-400" : ""
			} ${eliminated ? "opacity-35 grayscale" : ""}`}
		>
			{/* Top Row: Avatar + Name/Count + Turn Badge */}
			<div className="flex items-center justify-between gap-1.5">
				<div className="flex items-center gap-2 min-w-0">
					<span
						className="size-7 sm:size-8 shrink-0 flex items-center justify-center rounded-full font-black text-xs sm:text-sm text-white shadow-md ring-1 ring-white/20"
						style={{ background: avatarColor }}
					>
						{seat.name.charAt(0).toUpperCase()}
					</span>
					<div className="min-w-0 flex-1">
						<p className="flex items-center gap-1 text-xs sm:text-sm font-bold text-white truncate leading-tight">
							<span className="truncate">{seat.name}</span>
							{!connected && (
								<span
									className="size-1.5 shrink-0 rounded-full bg-slate-500"
									title="Offline"
								/>
							)}
						</p>
						<p className="text-[10px] sm:text-[11px] text-white/50 leading-tight">
							{eliminated ? "Eliminated" : `${seat.cardCount} cards`}
						</p>
					</div>
				</div>

				{/* Turn Badge + Timer */}
				{isTurn && !eliminated && (
					<div className="flex items-center gap-1 shrink-0">
						<span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] sm:text-xs font-black text-black shadow-sm shadow-amber-950/40">
							Turn
						</span>
						{timeLeft !== null && (
							<span className="font-mono text-[10px] font-black text-amber-300">
								{timeLeft}s
							</span>
						)}
					</div>
				)}
			</div>

			{/* Shield Indicator */}
			{shielded && !eliminated && (
				<div className="mt-1 flex items-center gap-1 rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-bold text-blue-300 ring-1 ring-blue-400/40">
					<span>🛡 Shielded</span>
				</div>
			)}

			{/* Mini Card Fan */}
			<div className="mt-2.5 flex items-center justify-center">
				{eliminated ? (
					<span className="text-[10px] font-semibold text-rose-300/80">
						Out of round
					</span>
				) : (
					<OpponentCardFan count={seat.cardCount} />
				)}
			</div>

			{/* UNO Alert & Catch Action */}
			{alert && !eliminated && (
				<div className="mt-1.5 flex items-center justify-center gap-1.5">
					<span className="uno-pulse rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white shadow-md shadow-rose-600/40">
						UNO!
					</span>
					{canCatch && (
						<button
							type="button"
							onClick={onCatch}
							className="rounded-md bg-rose-500 hover:bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white transition shadow cursor-pointer"
						>
							Catch!
						</button>
					)}
				</div>
			)}
		</div>
	);
}

/* --------------------------------- Hand ---------------------------------- */

function Hand({
	round,
	onPlay,
	disabled,
	canDraw,
	canPass,
	onDraw,
	onPass,
	isMyTurn,
	timeLeft,
	turnText,
	unoArmed,
	onToggleUno,
}: {
	round: PublicRound;
	onPlay: (card: Card) => void;
	disabled: boolean;
	canDraw: boolean;
	canPass: boolean;
	onDraw: () => void;
	onPass: () => void;
	isMyTurn: boolean;
	timeLeft: number | null;
	turnText: string;
	unoArmed: boolean;
	onToggleUno: () => void;
}) {
	const playable = new Set(round.playableIds);
	const playableCount = round.playableIds.length;
	const handCount = round.hand.length;
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [pageIndex, setPageIndex] = useState(0);
	const [pageCount, setPageCount] = useState(1);

	const checkPages = useCallback(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		const { scrollLeft, scrollWidth, clientWidth } = el;
		if (scrollWidth <= clientWidth + 10) {
			setPageCount(1);
			setPageIndex(0);
			return;
		}
		// On mobile screens, aim for ~4-6 dots
		const total = Math.min(6, Math.max(1, Math.ceil(scrollWidth / (clientWidth * 0.85))));
		const current = Math.min(
			total - 1,
			Math.max(0, Math.round(scrollLeft / (clientWidth * 0.75))),
		);
		setPageCount(total);
		setPageIndex(current);
	}, []);

	useEffect(() => {
		checkPages();
		const handleResize = () => checkPages();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [round.hand.length, checkPages]);

	const handleScroll = () => {
		checkPages();
	};

	const scrollDirection = (dir: -1 | 1) => {
		const el = scrollContainerRef.current;
		if (!el) return;
		const scrollDistance = el.clientWidth * 0.65 * dir;
		el.scrollBy({ left: scrollDistance, behavior: "smooth" });
	};

	const scrollToPage = (idx: number) => {
		const el = scrollContainerRef.current;
		if (!el) return;
		const target = (el.scrollWidth - el.clientWidth) * (idx / Math.max(1, pageCount - 1));
		el.scrollTo({ left: target, behavior: "smooth" });
	};

	return (
		<section
			className="game-dock relative mx-auto w-full max-w-5xl rounded-t-3xl sm:rounded-3xl p-3 sm:p-4 mb-0 sm:mb-3 transition-all z-20"
			aria-label="Your hand"
		>
			{/* Dock Header: Your hand • X cards on left, ✦ Y playable on right */}
			<div className="flex items-center justify-between px-2 sm:px-3 pb-2 text-xs">
				<div className="flex items-center gap-2">
					<span className="font-bold text-white/90 text-xs sm:text-sm">
						Your hand • {handCount} card{handCount === 1 ? "" : "s"}
					</span>
				</div>
				<div className="flex items-center gap-2">
					{!disabled && playableCount > 0 && (
						<span className="flex items-center gap-1.5 rounded-full bg-[#052e16] border border-[#22c55e]/50 px-3 py-0.5 sm:py-1 text-[11px] sm:text-xs font-bold text-[#4ade80] shadow-sm">
							<span className="text-[#4ade80]">✦</span>
							<span>{playableCount} playable</span>
						</span>
					)}
				</div>
			</div>

			{/* Quick Action Controls HUD (Turn info, Draw, Pass, UNO) */}
			{(isMyTurn || handCount <= 2) && (
				<div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 my-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
					<div className="flex items-center gap-2 text-white/80 min-w-0">
						{isMyTurn && (
							<span className="font-bold text-amber-200 truncate">{turnText}</span>
						)}
						{isMyTurn && timeLeft !== null && (
							<span
								className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-black shrink-0 ${
									timeLeft <= 5
										? "bg-rose-600 text-white animate-pulse"
										: timeLeft <= 10
											? "bg-amber-500 text-black"
											: "bg-emerald-500/30 text-emerald-300"
								}`}
							>
								⏱ {timeLeft}s
							</span>
						)}
					</div>
					<div className="flex items-center gap-1.5 ml-auto">
						{isMyTurn && canDraw && (
							<button
								type="button"
								onClick={onDraw}
								className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-xs shadow-md transition cursor-pointer"
							>
								{round.pendingDraw > 0 ? `Draw ${round.pendingDraw}` : "Draw Card"}
							</button>
						)}
						{isMyTurn && canPass && (
							<button
								type="button"
								onClick={onPass}
								className="px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold text-xs transition cursor-pointer"
							>
								Pass
							</button>
						)}
						{handCount <= 2 && !disabled && (
							<button
								type="button"
								onClick={onToggleUno}
								className={`px-3 py-1 rounded-lg font-black text-xs transition cursor-pointer ${
									unoArmed
										? "bg-rose-600 text-white ring-2 ring-rose-400 animate-pulse shadow-lg shadow-rose-600/50"
										: "bg-rose-500/30 text-rose-300 hover:bg-rose-500/50 border border-rose-500/40"
								}`}
							>
								{unoArmed ? "UNO Called ✓" : "Call UNO"}
							</button>
						)}
					</div>
				</div>
			)}

			{/* Card Rack with < and > arrow navigation */}
			<div className="relative flex items-center justify-between gap-1 sm:gap-2">
				{/* Left Arrow Button */}
				<button
					type="button"
					onClick={() => scrollDirection(-1)}
					className="size-7 sm:size-8 shrink-0 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-white transition shadow-md active:scale-95 cursor-pointer"
					aria-label="Scroll hand left"
				>
					<svg
						className="size-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
					>
						<polyline points="15 18 9 12 15 6" />
					</svg>
				</button>

				{/* Overlapping Hand Cards */}
				<div
					ref={scrollContainerRef}
					onScroll={handleScroll}
					className="hide-scrollbar flex-1 flex items-center overflow-x-auto px-4 pt-6 pb-2 select-none justify-start md:justify-center scroll-smooth"
				>
					{handCount === 0 && (
						<p className="py-6 text-sm text-white/50">No cards in hand.</p>
					)}
					{round.hand.map((card, i) => {
						const isPlayable = !disabled && playable.has(card.id);
						return (
							<div
								key={card.id}
								className={`relative shrink-0 transition-all duration-200 focus-within:z-20 hover:z-20 ${
									i === 0 ? "" : "-ml-5 sm:-ml-6 md:-ml-7"
								}`}
							>
								<CardFace
									card={card}
									size="md"
									highlighted={isPlayable}
									dimmed={!isPlayable}
									onClick={() => onPlay(card)}
									title={
										isPlayable
											? `Play ${describeCard(card)}`
											: describeCard(card)
									}
								/>
							</div>
						);
					})}
				</div>

				{/* Right Arrow Button */}
				<button
					type="button"
					onClick={() => scrollDirection(1)}
					className="size-7 sm:size-8 shrink-0 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-white transition shadow-md active:scale-95 cursor-pointer"
					aria-label="Scroll hand right"
				>
					<svg
						className="size-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
					>
						<polyline points="9 18 15 12 9 6" />
					</svg>
				</button>
			</div>

			{/* Pagination Dots (matching reference image) */}
			{pageCount > 1 && (
				<div className="flex items-center justify-center gap-1.5 pt-2">
					{Array.from({ length: pageCount }).map((_, i) => (
						<button
							key={i}
							type="button"
							onClick={() => scrollToPage(i)}
							className={`rounded-full transition-all cursor-pointer ${
								pageIndex === i
									? "size-2 bg-white scale-110 shadow-sm shadow-white"
									: "size-1.5 bg-white/30 hover:bg-white/60"
							}`}
							aria-label={`Go to hand page ${i + 1}`}
						/>
					))}
				</div>
			)}
		</section>
	);
}

/* ----------------------------- Color Picker ------------------------------ */

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
							className="flex h-20 items-center justify-center rounded-2xl text-base font-black text-white capitalize shadow-lg transition hover:scale-105 active:scale-95 cursor-pointer"
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
		<Modal label="Snatch Cards">
			<Panel className="text-center">
				<h2 className="flex items-center justify-center gap-2 text-lg font-black text-white">
					<span>🤏 Snatch - Swap Hands</span>
				</h2>
				<p className="mt-1 text-xs text-white/60">
					Choose an opponent to exchange your entire hand with:
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
							className="group flex items-center justify-between rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 transition hover:bg-white/10 cursor-pointer"
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

/* ----------------------------- Round Overlay ----------------------------- */

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
			className="mt-2 max-h-48 space-y-1 overflow-y-auto font-mono text-[11px] text-white/70"
		>
			{entries.map((entry, i) => (
				<li key={i}>{entry}</li>
			))}
		</ol>
	);
}

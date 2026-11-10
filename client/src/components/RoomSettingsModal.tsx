import { type CustomCardSettings, type Rules } from "@uno/shared";
import { useState } from "react";

import { Badge, Button, Modal, Panel } from "./ui";

export type LayoutMode = "horizontal" | "vertical";

const TARGET_OPTIONS = [200, 300, 500, 1000];
const TIMER_OPTIONS = [
	{ label: "Off", value: 0 },
	{ label: "15s", value: 15 },
	{ label: "30s (Default)", value: 30 },
	{ label: "45s", value: 45 },
	{ label: "60s", value: 60 },
];
const ELIMINATION_OPTIONS = [
	{ label: "Off", value: null },
	{ label: "15 Cards", value: 15 },
	{ label: "20 Cards", value: 20 },
	{ label: "25 Cards", value: 25 },
	{ label: "30 Cards", value: 30 },
];

interface RoomSettingsModalProps {
	open: boolean;
	onClose: () => void;
	rules: Rules;
	isHost: boolean;
	onUpdateRules: (rules: Partial<Rules>) => void;
	layoutMode: LayoutMode;
	onChangeLayoutMode: (mode: LayoutMode) => void;
}

export function RoomSettingsModal({
	open,
	onClose,
	rules,
	isHost,
	onUpdateRules,
	layoutMode,
	onChangeLayoutMode,
}: RoomSettingsModalProps) {
	const [tab, setTab] = useState<"rules" | "cards" | "display">("rules");

	if (!open) return null;

	const cards = rules.cards ?? {
		doubleTrouble: true,
		swapHands: true,
		snatch: true,
		shield: true,
		wild6: true,
		wild10: true,
	};

	const updateCard = (key: keyof CustomCardSettings, value: boolean) => {
		onUpdateRules({
			cards: {
				...cards,
				[key]: value,
			},
		});
	};

	return (
		<Modal label="Room Settings & Preferences">
			<Panel className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto p-6">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-white/10 pb-3">
					<div>
						<h2 className="flex items-center gap-2 text-xl font-black text-white">
							<span>⚙ Room Configuration</span>
							{isHost ? (
								<Badge tone="gold">Host Controls</Badge>
							) : (
								<Badge>Viewing Rules</Badge>
							)}
						</h2>
						<p className="mt-0.5 text-xs text-white/50">
							{isHost
								? "Customize match rules, timer pace, custom cards & your layout."
								: "Room rules are set by the host. You can customize your layout view."}
						</p>
					</div>
					<Button
						variant="ghost"
						className="size-8 p-0 text-lg"
						onClick={onClose}
						aria-label="Close settings"
					>
						✕
					</Button>
				</div>

				{/* Tabs */}
				<div className="my-4 flex gap-2 rounded-2xl bg-black/40 p-1 ring-1 ring-white/10">
					<button
						type="button"
						onClick={() => setTab("rules")}
						className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
							tab === "rules"
								? "bg-white/15 text-white shadow"
								: "text-white/60 hover:text-white"
						}`}
					>
						Rules & Timers
					</button>
					<button
						type="button"
						onClick={() => setTab("cards")}
						className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
							tab === "cards"
								? "bg-white/15 text-white shadow"
								: "text-white/60 hover:text-white"
						}`}
					>
						Special Cards
					</button>
					<button
						type="button"
						onClick={() => setTab("display")}
						className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
							tab === "display"
								? "bg-white/15 text-white shadow"
								: "text-white/60 hover:text-white"
						}`}
					>
						Preferences
					</button>
				</div>

				{/* Tab 1: Rules & Timers */}
				{tab === "rules" && (
					<div className="flex flex-col gap-5 pt-1">
						{/* Play To */}
						<div>
							<div className="mb-2 flex items-center justify-between">
								<span className="text-sm font-bold text-white">Target Score</span>
								<span className="font-mono text-xs font-bold text-amber-300">
									{rules.targetScore} points
								</span>
							</div>
							<div className="grid grid-cols-4 gap-2">
								{TARGET_OPTIONS.map((v) => {
									const active = rules.targetScore === v;
									return (
										<button
											key={v}
											type="button"
											disabled={!isHost}
											onClick={() => onUpdateRules({ targetScore: v })}
											className={`rounded-xl py-2 text-xs font-black transition disabled:cursor-default ${
												active
													? "bg-white text-slate-900 shadow-lg"
													: "bg-white/5 text-white/70 ring-1 ring-white/10 enabled:hover:bg-white/10"
											}`}
										>
											{v} pts
										</button>
									);
								})}
							</div>
						</div>

						{/* Stacking Rule */}
						<div className="rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/10">
							<SwitchRow
								label="Plus Card Stacking"
								description="Answer any plus card with a same or higher plus card (+2, +4, +6, +10) to pass the draw penalty on."
								checked={rules.stacking}
								disabled={!isHost}
								onChange={(val) => onUpdateRules({ stacking: val })}
							/>
						</div>

						{/* Turn Timer */}
						<div className="rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/10">
							<div className="mb-1 flex items-center justify-between">
								<p className="text-sm font-bold text-white">⏱ Turn Timer</p>
								<span className="font-mono text-xs font-bold text-emerald-400">
									{rules.turnTimer > 0 ? `${rules.turnTimer}s limit` : "No Timer"}
								</span>
							</div>
							<p className="mb-3 text-xs text-white/50">
								If a player does not play within the limit, they are forced to draw
								a card and pass.
							</p>
							<div className="grid grid-cols-5 gap-1.5">
								{TIMER_OPTIONS.map((opt) => {
									const active = rules.turnTimer === opt.value;
									return (
										<button
											key={opt.value}
											type="button"
											disabled={!isHost}
											onClick={() => onUpdateRules({ turnTimer: opt.value })}
											className={`rounded-xl px-1 py-2 text-center text-[11px] font-bold transition disabled:cursor-default ${
												active
													? "bg-emerald-500 font-black text-white shadow-lg shadow-emerald-500/30"
													: "bg-white/5 text-white/70 ring-1 ring-white/10 enabled:hover:bg-white/10"
											}`}
										>
											{opt.label}
										</button>
									);
								})}
							</div>
						</div>

						{/* Elimination Limit */}
						<div className="rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/10">
							<div className="mb-1 flex items-center justify-between">
								<p className="text-sm font-bold text-white">
									💀 Elimination Card Limit
								</p>
								<span className="font-mono text-xs font-bold text-rose-300">
									{rules.eliminationLimit !== null
										? `Max ${rules.eliminationLimit} cards`
										: "Off"}
								</span>
							</div>
							<p className="mb-3 text-xs text-white/50">
								If a player holds more than this limit, they are eliminated and
								spectate the rest of the round.
							</p>
							<div className="grid grid-cols-5 gap-1.5">
								{ELIMINATION_OPTIONS.map((opt) => {
									const active = rules.eliminationLimit === opt.value;
									return (
										<button
											key={opt.label}
											type="button"
											disabled={!isHost}
											onClick={() =>
												onUpdateRules({ eliminationLimit: opt.value })
											}
											className={`rounded-xl px-1 py-2 text-center text-[11px] font-bold transition disabled:cursor-default ${
												active
													? "bg-rose-500 font-black text-white shadow-lg shadow-rose-500/30"
													: "bg-white/5 text-white/70 ring-1 ring-white/10 enabled:hover:bg-white/10"
											}`}
										>
											{opt.label}
										</button>
									);
								})}
							</div>
						</div>
					</div>
				)}

				{/* Tab 2: Custom Expansion Cards */}
				{tab === "cards" && (
					<div className="flex flex-col gap-3.5 pt-1">
						<div className="rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/10">
							<SwitchRow
								badge="2×"
								label="Double Trouble"
								description="Allows a player to play two cards in a single turn."
								checked={cards.doubleTrouble}
								disabled={!isHost}
								onChange={(v) => updateCard("doubleTrouble", v)}
							/>
						</div>

						<div className="rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/10">
							<SwitchRow
								badge="🔄"
								label="Swap Hands"
								description="Every player swaps their hand with the next player in play direction."
								checked={cards.swapHands}
								disabled={!isHost}
								onChange={(v) => updateCard("swapHands", v)}
							/>
						</div>

						<div className="rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/10">
							<SwitchRow
								badge="🤏"
								label="Snatch"
								description="Allows a player to swap their entire hand of cards with a chosen opponent."
								checked={cards.snatch}
								disabled={!isHost}
								onChange={(v) => updateCard("snatch", v)}
							/>
						</div>

						<div className="rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/10">
							<SwitchRow
								badge="🛡"
								label="Shield (1 in deck)"
								description="Protects from negative effects (draw penalties, skips, snatch, catches) for one turn. Playable on your turn."
								checked={cards.shield}
								disabled={!isHost}
								onChange={(v) => updateCard("shield", v)}
							/>
						</div>

						<div className="rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/10">
							<SwitchRow
								badge="+6"
								label="Wild Draw Six (+6)"
								description="Wild card that forces the next player to draw 6 cards (stackable with same or higher plus cards)."
								checked={cards.wild6}
								disabled={!isHost}
								onChange={(v) => updateCard("wild6", v)}
							/>
						</div>

						<div className="rounded-2xl bg-white/[0.03] p-3.5 ring-1 ring-white/10">
							<SwitchRow
								badge="+10"
								label="Wild Draw Ten (+10)"
								description="Wild card that forces the next player to draw 10 cards (stackable with +10)."
								checked={cards.wild10}
								disabled={!isHost}
								onChange={(v) => updateCard("wild10", v)}
							/>
						</div>
					</div>
				)}

				{/* Tab 3: Display & Preferences */}
				{tab === "display" && (
					<div className="flex flex-col gap-5 pt-1">
						<div className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/10">
							<h3 className="mb-1 text-sm font-bold text-white">
								Game Window Orientation
							</h3>
							<p className="mb-4 text-xs text-white/50">
								Horizontal mode is standard for widescreen and desktops. Vertical
								mode arranges the felt table and opponents vertically for mobile or
								compact view.
							</p>
							<div className="grid grid-cols-2 gap-3">
								<button
									type="button"
									onClick={() => onChangeLayoutMode("horizontal")}
									className={`flex flex-col items-center gap-2.5 rounded-2xl border p-4 transition ${
										layoutMode === "horizontal"
											? "border-emerald-400 bg-emerald-500/15 text-white shadow-lg shadow-emerald-500/20"
											: "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
									}`}
								>
									<span className="text-2xl">🖥</span>
									<span className="text-sm font-black">Horizontal (Default)</span>
									<span className="text-center text-[11px] text-white/50">
										Opponents along top, wide table felt in center
									</span>
								</button>
								<button
									type="button"
									onClick={() => onChangeLayoutMode("vertical")}
									className={`flex flex-col items-center gap-2.5 rounded-2xl border p-4 transition ${
										layoutMode === "vertical"
											? "border-emerald-400 bg-emerald-500/15 text-white shadow-lg shadow-emerald-500/20"
											: "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
									}`}
								>
									<span className="text-2xl">📱</span>
									<span className="text-sm font-black">Vertical Mode</span>
									<span className="text-center text-[11px] text-white/50">
										Portrait-optimized table and opponents
									</span>
								</button>
							</div>
						</div>
					</div>
				)}

				{/* Footer */}
				<div className="mt-6 flex justify-end border-t border-white/10 pt-4">
					<Button variant="primary" className="px-6 py-2.5 text-sm" onClick={onClose}>
						Done
					</Button>
				</div>
			</Panel>
		</Modal>
	);
}

function SwitchRow({
	badge,
	label,
	description,
	checked,
	disabled,
	onChange,
}: {
	badge?: string;
	label: string;
	description: string;
	checked: boolean;
	disabled: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="flex items-start gap-3">
				{badge && (
					<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-black text-white ring-1 ring-white/15">
						{badge}
					</span>
				)}
				<div>
					<p className="text-sm font-bold text-white">{label}</p>
					<p className="text-xs leading-relaxed text-white/50">{description}</p>
				</div>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-label={label}
				disabled={disabled}
				onClick={() => onChange(!checked)}
				className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition disabled:cursor-default ${
					checked ? "bg-emerald-500 shadow-lg shadow-emerald-500/30" : "bg-white/15"
				}`}
			>
				<span
					className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
						checked ? "left-[22px]" : "left-0.5"
					}`}
				/>
			</button>
		</div>
	);
}

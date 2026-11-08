import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "warning";

const VARIANTS: Record<Variant, string> = {
	primary:
		"text-emerald-950 shadow-lg shadow-emerald-500/30 hover:brightness-110 active:scale-[0.98]",
	secondary: "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20 active:scale-[0.98]",
	danger: "text-white shadow-lg shadow-rose-600/30 hover:brightness-110 active:scale-[0.98]",
	ghost: "text-white/70 hover:bg-white/10 hover:text-white",
	warning:
		"text-amber-950 shadow-lg shadow-amber-400/30 hover:brightness-110 active:scale-[0.98]",
};

const GRADIENTS: Partial<Record<Variant, string>> = {
	primary: "linear-gradient(135deg, #4ade80, #22c55e 55%, #16a34a)",
	danger: "linear-gradient(135deg, #fb7185, #e11d48)",
	warning: "linear-gradient(135deg, #fde047, #facc15 55%, #f59e0b)",
};

export function Button({
	variant = "secondary",
	className = "",
	style,
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
	const gradient = GRADIENTS[variant];
	return (
		<button
			type="button"
			{...props}
			style={{ ...(gradient ? { background: gradient } : {}), ...style } as CSSProperties}
			className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold tracking-wide transition duration-150 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${VARIANTS[variant]} ${className}`}
		/>
	);
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
	return <div className={`glass rounded-3xl p-6 ${className}`}>{children}</div>;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
	return (
		<input
			{...props}
			className={`w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base text-white transition placeholder:text-white/30 focus:border-amber-300/70 focus:ring-4 focus:ring-amber-300/15 focus:outline-none ${className}`}
		/>
	);
}

export function Toast({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
	if (!message) return null;
	return (
		<div
			role="status"
			onClick={onDismiss}
			className="pop-in glass fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 cursor-pointer rounded-2xl px-5 py-3 text-center text-sm font-semibold text-white"
		>
			{message}
		</div>
	);
}

export function Modal({ children, label }: { children: ReactNode; label: string }) {
	return (
		<div
			className="fixed inset-0 z-40 flex items-center justify-center bg-[#05040f]/70 p-4 backdrop-blur-md"
			role="dialog"
			aria-modal="true"
			aria-label={label}
		>
			<div className="pop-in w-full max-w-md">{children}</div>
		</div>
	);
}

/** Four-tile wordmark echoing the card colours. */
export function Logo({ size = "lg" }: { size?: "sm" | "lg" }) {
	const tile = size === "lg" ? "h-16 w-14 text-4xl rounded-2xl" : "h-8 w-7 text-base rounded-lg";
	const tiles: [string, string][] = [
		["U", "linear-gradient(145deg,#fb7185,#dc2626)"],
		["N", "linear-gradient(145deg,#fde047,#f59e0b)"],
		["O", "linear-gradient(145deg,#4ade80,#15803d)"],
		["!", "linear-gradient(145deg,#60a5fa,#1d4ed8)"],
	];
	return (
		<div className="flex items-center justify-center gap-1.5 select-none" aria-label="UNO">
			{tiles.map(([ch, bg], i) => (
				<span
					key={ch}
					className={`${tile} flex items-center justify-center font-black text-white shadow-xl ring-1 shadow-black/40 ring-white/25`}
					style={{ background: bg, transform: `rotate(${[-8, -3, 3, 8][i]}deg)` }}
				>
					{ch === "!" ? "✦" : ch}
				</span>
			))}
		</div>
	);
}

/** Round avatar showing the first letter of a player's name on a colour picked from their seat. */
const AVATAR_BG = [
	"#e11d48",
	"#eab308",
	"#16a34a",
	"#2563eb",
	"#9333ea",
	"#f97316",
	"#0891b2",
	"#db2777",
	"#65a30d",
	"#4f46e5",
];

export function Avatar({
	name,
	index,
	size = "md",
}: {
	name: string;
	index: number;
	size?: "sm" | "md" | "lg";
}) {
	const dims = { sm: "size-8 text-xs", md: "size-11 text-base", lg: "size-14 text-xl" }[size];
	return (
		<span
			className={`${dims} flex shrink-0 items-center justify-center rounded-full font-black text-white shadow-lg ring-2 ring-white/20`}
			style={{
				background: `linear-gradient(145deg, ${AVATAR_BG[index % AVATAR_BG.length]}, #0f0a24)`,
			}}
			aria-hidden
		>
			{name.charAt(0).toUpperCase()}
		</span>
	);
}

export function Badge({
	children,
	tone = "neutral",
}: {
	children: ReactNode;
	tone?: "neutral" | "gold" | "green" | "red";
}) {
	const tones = {
		neutral: "bg-white/10 text-white/80 ring-white/10",
		gold: "bg-amber-300/20 text-amber-200 ring-amber-300/30",
		green: "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30",
		red: "bg-rose-500/20 text-rose-200 ring-rose-400/30",
	} as const;
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${tones[tone]}`}
		>
			{children}
		</span>
	);
}

import {
    type Card as CardModel,
    CardType,
    Color,
    SpecialColor,
    describeCard,
    isWild,
} from '@uno/shared';
import type { ReactNode } from 'react';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

/** Card artwork is pure CSS/SVG, so the game needs no image assets. */
const FILL: Record<Color, string> = {
    [Color.Red]: '#e03a2f',
    [Color.Yellow]: '#f7c400',
    [Color.Green]: '#1aa34a',
    [Color.Blue]: '#1f6fd6',
};

/** Darker tints for number glyphs so they stay legible on the white oval. */
const INK: Record<Color, string> = {
    [Color.Red]: '#c0281e',
    [Color.Yellow]: '#c99700',
    [Color.Green]: '#11803a',
    [Color.Blue]: '#1656b0',
};

const PINWHEEL = 'conic-gradient(#e03a2f 0 25%, #f7c400 0 50%, #1aa34a 0 75%, #1f6fd6 0)';

const SIZE: Record<CardSize, { box: string; text: string; corner: string; icon: string; w4Icon: string }> = {
    xs: { box: 'h-10 w-7 rounded-md border', text: 'text-xs', corner: 'text-[8px]', icon: 'size-4', w4Icon: 'size-6' },
    sm: { box: 'h-16 w-11 rounded-lg border-2', text: 'text-lg', corner: 'text-[10px]', icon: 'size-6', w4Icon: 'size-9' },
    md: { box: 'h-24 w-16 rounded-xl border-[3px]', text: 'text-2xl', corner: 'text-xs', icon: 'size-9', w4Icon: 'size-14' },
    lg: { box: 'h-32 w-[88px] rounded-2xl border-4', text: 'text-3xl', corner: 'text-sm', icon: 'size-12', w4Icon: 'size-18' },
};

/* ------------------------------ Icons (SVG) ------------------------------ */

function SkipIcon({ color, className }: { color: string; className: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
            <circle cx="12" cy="12" r="8" fill="none" stroke={color} strokeWidth="3.2" />
            <line x1="6" y1="18" x2="18" y2="6" stroke={color} strokeWidth="3.2" strokeLinecap="round" />
        </svg>
    );
}

function ReverseIcon({ color, className }: { color: string; className: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden>
            <path
                d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"
                fill="none"
                stroke={color}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/** 
 * Iconic 4 overlapping colored mini-cards for Wild Draw Four (+4),
 * layered with drop shadows, white inner frames, and a bold +4 callout badge.
 */
function WildFourIcon({ className }: { className: string }) {
    return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
            <defs>
                <filter id="w4-shadow" x="-20%" y="-20%" width="150%" height="150%">
                    <feDropShadow dx="0.8" dy="1.2" stdDeviation="1" floodColor="#000" floodOpacity="0.45" />
                </filter>
            </defs>
            {/* 4 overlapping mini cards fanning out in order: Red (bottom-left), Blue (top-left), Yellow (bottom-right), Green (top-right/front) */}
            <g filter="url(#w4-shadow)">
                {/* Red card (bottom-left) */}
                <rect x="7" y="15" width="15" height="23" rx="2.5" fill="#e03a2f" stroke="#ffffff" strokeWidth="1.2" />
                <rect x="9" y="17" width="11" height="19" rx="1.5" fill="none" stroke="#ffffff" strokeWidth="0.6" strokeOpacity="0.75" />
            </g>
            <g filter="url(#w4-shadow)">
                {/* Blue card (top-left) */}
                <rect x="13" y="7" width="15" height="23" rx="2.5" fill="#1f6fd6" stroke="#ffffff" strokeWidth="1.2" />
                <rect x="15" y="9" width="11" height="19" rx="1.5" fill="none" stroke="#ffffff" strokeWidth="0.6" strokeOpacity="0.75" />
            </g>
            <g filter="url(#w4-shadow)">
                {/* Yellow card (bottom-right) */}
                <rect x="21" y="18" width="15" height="23" rx="2.5" fill="#f7c400" stroke="#ffffff" strokeWidth="1.2" />
                <rect x="23" y="20" width="11" height="19" rx="1.5" fill="none" stroke="#ffffff" strokeWidth="0.6" strokeOpacity="0.75" />
            </g>
            <g filter="url(#w4-shadow)">
                {/* Green card (top-right, in front) */}
                <rect x="26" y="10" width="15" height="23" rx="2.5" fill="#1aa34a" stroke="#ffffff" strokeWidth="1.2" />
                <rect x="28" y="12" width="11" height="19" rx="1.5" fill="none" stroke="#ffffff" strokeWidth="0.6" strokeOpacity="0.75" />
            </g>
            {/* Center +4 badge overlay */}
            <g filter="url(#w4-shadow)">
                <ellipse cx="24" cy="24" rx="12" ry="8" fill="#111116" stroke="#ffffff" strokeWidth="1" />
                <text
                    x="24"
                    y="27.5"
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="11"
                    fontWeight="900"
                    fontFamily="system-ui, -apple-system, sans-serif"
                    letterSpacing="-0.5px"
                >
                    +4
                </text>
            </g>
        </svg>
    );
}

const CORNER: Record<CardModel['type'], (c: CardModel) => string> = {
    [CardType.Number]: (c) => String(c.value),
    [CardType.Skip]: () => '⊘',
    [CardType.Reverse]: () => '⇄',
    [CardType.Draw2]: () => '+2',
    [CardType.Wild]: () => 'W',
    [CardType.Wild4]: () => '+4',
};

/* -------------------------------- Card face ------------------------------ */

interface CardFaceProps {
    card: CardModel;
    size?: CardSize;
    /** Color of the card's glyphs; ignored for wild cards. */
    onClick?: () => void;
    highlighted?: boolean;
    dimmed?: boolean;
    className?: string;
    title?: string;
}

export function CardFace({
    card,
    size = 'md',
    onClick,
    highlighted = false,
    dimmed = false,
    className = '',
    title,
}: CardFaceProps) {
    const s = SIZE[size];
    const wild = isWild(card);
    const color = card.color === SpecialColor.Wild ? null : (card.color as Color);
    const background = color ? FILL[color] : '#17171c';

    let center: ReactNode;
    if (card.type === CardType.Number) {
        center = <span className={`font-black leading-none ${s.text}`} style={{ color: INK[color!] }}>{card.value}</span>;
    } else if (card.type === CardType.Skip) {
        center = <SkipIcon color={INK[color!]} className={s.icon} />;
    } else if (card.type === CardType.Reverse) {
        center = <ReverseIcon color={INK[color!]} className={s.icon} />;
    } else if (card.type === CardType.Draw2) {
        center = <span className={`font-black leading-none ${s.text}`} style={{ color: INK[color!] }}>+2</span>;
    } else {
        center = (
            <span
                className="block size-[68%] rounded-full shadow-inner"
                style={{ background: PINWHEEL }}
                aria-hidden
            />
        );
    }

    const label = CORNER[card.type](card);
    const body = (
        <>
            {/* Tilted oval background; the glyph inside stays upright. */}
            <span className="absolute inset-x-[10%] inset-y-[12%] rotate-[18deg] rounded-[50%] bg-white" />
            <span className="absolute inset-x-[10%] inset-y-[12%] flex items-center justify-center">
                {card.type === CardType.Wild4 ? (
                    <WildFourIcon className={s.w4Icon} />
                ) : (
                    center
                )}
            </span>
            <span
                className={`absolute left-[6%] top-[4%] font-black leading-none text-white drop-shadow ${s.corner}`}
            >
                {label}
            </span>
            <span
                className={`absolute bottom-[4%] right-[6%] rotate-180 font-black leading-none text-white drop-shadow ${s.corner}`}
            >
                {label}
            </span>
        </>
    );

    const classes = [
        'relative shrink-0 overflow-hidden border-white shadow-lg shadow-black/40 transition-transform duration-150',
        SIZE[size].box,
        onClick ? 'cursor-pointer' : 'cursor-default',
        highlighted ? '-translate-y-3 ring-4 ring-amber-300' : '',
        dimmed ? 'opacity-45 saturate-50' : '',
        onClick && !dimmed ? 'hover:-translate-y-2' : '',
        className,
    ].join(' ');

    const style = { background: wild ? '#17171c' : background };

    if (!onClick) {
        return (
            <div className={classes} style={style} title={title ?? describeCard(card)} role="img" aria-label={describeCard(card)}>
                {wild && <span className="absolute inset-0 opacity-30" style={{ background: PINWHEEL }} />}
                {body}
            </div>
        );
    }
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={dimmed}
            className={classes}
            style={style}
            title={title ?? describeCard(card)}
            aria-label={describeCard(card)}
        >
            {body}
        </button>
    );
}

/* -------------------------------- Card back ------------------------------ */

export function CardBack({
    size = 'md',
    onClick,
    className = '',
    label,
}: {
    size?: CardSize;
    onClick?: () => void;
    className?: string;
    label?: string;
}) {
    const s = SIZE[size];
    const classes = [
        'relative shrink-0 overflow-hidden border-white shadow-lg shadow-black/40',
        s.box,
        onClick ? 'cursor-pointer transition-transform hover:-translate-y-1 hover:scale-[1.03]' : '',
        className,
    ].join(' ');
    const inner = (
        <>
            <span
                className="absolute inset-0"
                style={{
                    background:
                        'repeating-linear-gradient(45deg, rgb(255 255 255 / 0.08) 0 6px, transparent 6px 12px), #b3261e',
                }}
            />
            <span className="absolute inset-[10%] flex -rotate-[18deg] items-center justify-center rounded-[50%] border-2 border-white/80 bg-[#c62828]">
                <span className={`font-black tracking-tight text-amber-300 ${s.text}`}>UNO</span>
            </span>
            {label && (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[9px] font-semibold text-white">
                    {label}
                </span>
            )}
        </>
    );
    if (!onClick) return <div className={classes} aria-label="Card back">{inner}</div>;
    return (
        <button type="button" onClick={onClick} className={classes} aria-label={label ?? 'Draw a card'}>
            {inner}
        </button>
    );
}

export const COLOR_FILL = FILL;

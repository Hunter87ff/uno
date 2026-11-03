import { type Card as CardModel, type Color, describeCard, isWild } from '@uno/shared';
import type { ReactNode } from 'react';

/** Card artwork is pure CSS/SVG, so the game needs no image assets. */
const FILL: Record<Color, string> = {
  red: '#e03a2f',
  yellow: '#f7c400',
  green: '#1aa34a',
  blue: '#1f6fd6',
};

/** Darker tints for number glyphs so they stay legible on the white oval. */
const INK: Record<Color, string> = {
  red: '#c0281e',
  yellow: '#c99700',
  green: '#11803a',
  blue: '#1656b0',
};

const PINWHEEL = 'conic-gradient(#e03a2f 0 25%, #f7c400 0 50%, #1aa34a 0 75%, #1f6fd6 0)';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Record<CardSize, { box: string; text: string; corner: string; icon: string }> = {
  xs: { box: 'h-10 w-7 rounded-md border', text: 'text-xs', corner: 'text-[8px]', icon: 'size-4' },
  sm: { box: 'h-16 w-11 rounded-lg border-2', text: 'text-lg', corner: 'text-[10px]', icon: 'size-6' },
  md: { box: 'h-24 w-16 rounded-xl border-[3px]', text: 'text-2xl', corner: 'text-xs', icon: 'size-9' },
  lg: { box: 'h-32 w-[88px] rounded-2xl border-4', text: 'text-3xl', corner: 'text-sm', icon: 'size-12' },
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

const CORNER: Record<CardModel['type'], (c: CardModel) => string> = {
  number: (c) => String(c.value),
  skip: () => '⊘',
  reverse: () => '⇄',
  draw2: () => '+2',
  wild: () => 'W',
  wild4: () => '+4',
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
  const color = card.color === 'wild' ? null : card.color;
  const background = color ? FILL[color] : '#17171c';

  let center: ReactNode;
  if (card.type === 'number') {
    center = <span className={`font-black leading-none ${s.text}`} style={{ color: INK[color!] }}>{card.value}</span>;
  } else if (card.type === 'skip') {
    center = <SkipIcon color={INK[color!]} className={s.icon} />;
  } else if (card.type === 'reverse') {
    center = <ReverseIcon color={INK[color!]} className={s.icon} />;
  } else if (card.type === 'draw2') {
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
        {card.type === 'wild4' ? (
          <span className="rounded bg-black/80 px-1 font-black leading-tight text-white" style={{ fontSize: 'clamp(9px, 0.55em, 16px)' }}>
            +4
          </span>
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

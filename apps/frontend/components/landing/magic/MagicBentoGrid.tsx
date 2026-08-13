'use client';

/**
 * MagicBentoGrid — MIT port of magicui.design/r/bento-grid.
 *
 * Pure CSS Grid + semantic template areas. The four tiles are pre-named:
 * facilities / curb / confidence / sources. Tones drive the fallback gradient
 * until a `<MediaPlaceholder>` photo loads.
 *
 * No new npm dependency. Honors `prefers-reduced-motion` via parent CSS.
 */

import type { CSSProperties, ReactNode } from 'react';

type Tone = 'facilities' | 'curb' | 'confidence' | 'sources';

const TONE_TO_GRADIENT: Record<Tone, string> = {
  facilities:
    'radial-gradient(60% 60% at 25% 25%, oklch(0.72 0.16 252 / 0.30), transparent 70%),' +
    'linear-gradient(160deg, oklch(0.18 0.014 252) 0%, oklch(0.22 0.018 252) 60%, oklch(0.16 0.012 252) 100%)',
  curb:
    'radial-gradient(70% 50% at 70% 30%, oklch(0.72 0.16 156 / 0.22), transparent 70%),' +
    'linear-gradient(140deg, oklch(0.18 0.014 252) 0%, oklch(0.20 0.016 252) 100%)',
  confidence:
    'radial-gradient(60% 50% at 50% 70%, oklch(0.74 0.15 78 / 0.18), transparent 70%),' +
    'linear-gradient(160deg, oklch(0.20 0.014 252) 0%, oklch(0.16 0.012 252) 100%)',
  sources:
    'radial-gradient(80% 60% at 30% 80%, oklch(0.72 0.16 252 / 0.18), transparent 70%),' +
    'linear-gradient(150deg, oklch(0.16 0.012 252) 0%, oklch(0.22 0.016 252) 100%)',
};

type MagicBentoTileProps = {
  tone: Tone;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  cta?: ReactNode;
  /** Optional media slot (MediaPlaceholder etc.). */
  media?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function MagicBentoTile({
  tone,
  eyebrow,
  title,
  description,
  cta,
  media,
  className,
  style,
}: MagicBentoTileProps) {
  const tileStyle: CSSProperties = {
    background: TONE_TO_GRADIENT[tone],
    ...style,
  };
  const composed = [
    'magic-bento__tile',
    `magic-bento__tile--${tone}`,
    className || '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article className={composed} style={tileStyle}>
      {media ? <div className="magic-bento__tile-media">{media}</div> : null}
      <div className="magic-bento__tile-body">
        {eyebrow ? <div className="magic-bento__tile-eyebrow">{eyebrow}</div> : null}
        <h3 className="magic-bento__tile-title">{title}</h3>
        {description ? <p className="magic-bento__tile-desc">{description}</p> : null}
        {cta ? <div className="magic-bento__tile-cta">{cta}</div> : null}
      </div>
    </article>
  );
}

type MagicBentoGridProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function MagicBentoGrid({ children, className, style }: MagicBentoGridProps) {
  return (
    <div
      className={['magic-bento', className || ''].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </div>
  );
}

export default MagicBentoGrid;

'use client';

/**
 * MagicBorderBeam — MIT port of magicui.design/r/border-beam.
 *
 * A conic-gradient ring that spins around the parent element to give
 * premium cards a glowing outline. CSS-only via ::after with mask-composite.
 * Pauses on `prefers-reduced-motion`.
 */

import type { CSSProperties, ReactNode } from 'react';

type MagicBorderBeamProps = {
  children: ReactNode;
  /** Optional class forwarded to the wrapper. */
  className?: string;
  /** Spinner duration in seconds. Default 4.8s. */
  speed?: number;
  style?: CSSProperties;
};

export function MagicBorderBeam({
  children,
  className,
  speed = 4.8,
  style,
}: MagicBorderBeamProps) {
  const composed = [
    'magic-beam',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');
  const composedStyle: CSSProperties = {
    // CSS var consumed by the .magic-beam::after keyframe
    ['--magic-beam-duration' as string]: `${speed}s`,
    ...style,
  };
  return (
    <div className={composed} style={composedStyle}>
      {children}
    </div>
  );
}

export default MagicBorderBeam;

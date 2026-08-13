'use client';

/**
 * MagicMarquee — MIT port of magicui.design/r/marquee.
 *
 * Renders a horizontal scroll strip; the content is duplicated so the keyframe
 * can loop seamlessly. CSS-only animation (transform + opacity). Pauses on
 * hover and on `prefers-reduced-motion`.
 */

import { Children, type ReactNode } from 'react';

type MagicMarqueeProps = {
  children: ReactNode;
  /** Seconds for one full loop; longer = slower. Defaults to 36s. */
  speed?: number;
  /** Pause animation when hovered. Defaults to true. */
  pauseOnHover?: boolean;
  className?: string;
};

export function MagicMarquee({
  children,
  speed = 36,
  pauseOnHover = true,
  className,
}: MagicMarqueeProps) {
  const items = Children.toArray(children);
  const style = { animationDuration: `${speed}s` } as React.CSSProperties;
  const trackClass = [
    'magic-marquee__track',
    pauseOnHover ? 'magic-marquee--pausable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={['magic-marquee', className || ''].filter(Boolean).join(' ')}
      aria-label="Marquee of cities and operators"
    >
      <div className={trackClass} style={style}>
        {items.map((node, i) => (
          <span key={`a-${i}`} className="magic-marquee__item">
            {node}
          </span>
        ))}
        {items.map((node, i) => (
          <span key={`b-${i}`} className="magic-marquee__item" aria-hidden="true">
            {node}
          </span>
        ))}
      </div>
    </div>
  );
}

export default MagicMarquee;

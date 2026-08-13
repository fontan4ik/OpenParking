'use client';

/**
 * MagicNumberTicker — MIT port of magicui.design/r/number-ticker.
 *
 * Animates from 0 → target on first viewport intersection. Honors
 * `prefers-reduced-motion: reduce` (final value displayed immediately).
 * Supports K / M / % suffix.
 */

import { useEffect, useRef, useState } from 'react';

type MagicNumberTickerProps = {
  value: number;
  /** Optional unit suffix (e.g. "K", "%", "+"). */
  suffix?: string;
  /** Animation duration in ms. Default 900. */
  duration?: number;
  /** Decimal digits. Default 0. */
  decimals?: number;
  className?: string;
};

function formatNumber(value: number, decimals: number): string {
  if (decimals > 0) return value.toFixed(decimals);
  return Math.round(value).toLocaleString('en-US');
}

export function MagicNumberTicker({
  value,
  suffix,
  duration = 900,
  decimals = 0,
  className,
}: MagicNumberTickerProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplay(value);
      return;
    }
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setDisplay(value);
      return;
    }
    let cancelled = false;
    let started = false;
    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || started) continue;
          started = true;
          observer.disconnect();
          const startTs = performance.now();
          const tick = (now: number) => {
            if (cancelled) return;
            const t = Math.min(1, (now - startTs) / duration);
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            setDisplay(value * eased);
            if (t < 1) raf = requestAnimationFrame(tick);
            else setDisplay(value);
          };
          raf = requestAnimationFrame(tick);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span
      ref={ref}
      className={['magic-number', className || ''].filter(Boolean).join(' ')}
      aria-live="polite"
    >
      {formatNumber(display, decimals)}
      {suffix ? <span className="magic-number__suffix">{suffix}</span> : null}
    </span>
  );
}

export default MagicNumberTicker;

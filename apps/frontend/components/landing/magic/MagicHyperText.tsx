'use client';

/**
 * MagicHyperText — MIT port of magicui.design/r/hyper-text.
 *
 * Character scramble animation that resolves to the final text. Triggered
 * once on mount; respects `prefers-reduced-motion` (renders the final text
 * immediately, no scramble, no cursor blink).
 */

import { useEffect, useRef, useState } from 'react';

const SCRAMBLE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';

function scramble(input: string, progress: number): string {
  const out = input.split('');
  for (let i = 0; i < out.length; i += 1) {
    if (input[i] === ' ') {
      out[i] = ' ';
      continue;
    }
    const revealAt = (i / out.length) * 0.7;
    if (progress >= revealAt + 0.3) {
      out[i] = input[i];
    } else if (progress >= revealAt) {
      out[i] = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    } else {
      out[i] = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }
  }
  return out.join('');
}

type MagicHyperTextProps = {
  text: string;
  /** Animation duration in ms. Default 900. */
  duration?: number;
  className?: string;
  as?: 'span' | 'h1' | 'h2' | 'h3';
};

export function MagicHyperText({
  text,
  duration = 900,
  className,
  as = 'span',
}: MagicHyperTextProps) {
  const [display, setDisplay] = useState(text);
  const [paused, setPaused] = useState(false);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setDisplay(text);
      setPaused(true);
      return;
    }
    let cancelled = false;
    const startTs = performance.now();
    const tick = (now: number) => {
      if (cancelled) return;
      const t = Math.min(1, (now - startTs) / duration);
      setDisplay(scramble(text, t));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(text);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf.current);
    };
  }, [text, duration]);

  const Tag = as;
  const cls = [
    'magic-hyper',
    paused ? 'magic-hyper--paused' : '',
    className || '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Tag className={cls} aria-label={text}>
      <span aria-hidden="true">{display}</span>
      <span className="magic-hyper__cursor" aria-hidden="true" />
    </Tag>
  );
}

export default MagicHyperText;

'use client';

/**
 * Layer toggle group — pill bar of mutually-exclusive map display modes.
 * Replaces the legacy <select>. Honors prefers-reduced-motion.
 */

import type { CSSProperties } from 'react';

export type LayerOption = {
  value: string;
  label: string;
  /** Optional tone key for the active state. */
  tone?: 'accent' | 'free' | 'priced' | 'unknown';
};

type LayerTogglesProps = {
  options: LayerOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  style?: CSSProperties;
};

export function LayerToggles({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  style,
}: LayerTogglesProps) {
  const composed = ['layer-toggles', className || '']
    .filter(Boolean)
    .join(' ');
  return (
    <div role="group" aria-label={ariaLabel} className={composed} style={style}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className="layer-toggles__btn"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export default LayerToggles;

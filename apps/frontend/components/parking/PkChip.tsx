/**
 * Parking status chip — reuses the global --pk-* OKLCH tokens.
 * Mount via <PkChip status="priced" label="…" /> etc.
 */

import type { CSSProperties } from 'react';

export type PkStatus =
  | 'conflict'
  | 'priced'
  | 'free'
  | 'unpriced'
  | 'unknown'
  | 'stale'
  | 'live'
  | 'default';

type PkChipProps = {
  status: PkStatus;
  label: string;
  className?: string;
  style?: CSSProperties;
};

export function PkChip({ status, label, className, style }: PkChipProps) {
  const composed = ['pk-chip', `pk-chip--${status}`, className || '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={composed} style={style} aria-label={`${label} status`}>
      <span className="pk-chip__dot" aria-hidden="true" />
      <span className="pk-chip__label">{label}</span>
    </span>
  );
}

export default PkChip;

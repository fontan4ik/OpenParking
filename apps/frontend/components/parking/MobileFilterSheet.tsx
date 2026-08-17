'use client';

/**
 * MobileFilterSheet — slides up a filter drawer on small viewports.
 * Hidden on >=768px via .bottom-sheet CSS rule.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

type MobileFilterSheetProps = {
  title: string;
  children: ReactNode;
  /** Optional badge content (count of active filters etc.). */
  badge?: ReactNode;
};

export function MobileFilterSheet({ title, children, badge }: MobileFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="bottom-sheet__trigger"
        aria-expanded={open}
        aria-controls="mobile-filter-sheet"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{title}</span>
        {badge ? <span className="bottom-sheet__badge">{badge}</span> : null}
      </button>
      <div
        ref={ref}
        id="mobile-filter-sheet"
        className={['bottom-sheet', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        role="dialog"
        aria-label={title}
        aria-hidden={!open}
        inert={!open ? true : undefined}
      >
        <button
          type="button"
          className="bottom-sheet__handle"
          aria-label="Close filters"
          onClick={() => setOpen(false)}
        />
        <div className="bottom-sheet__inner">{children}</div>
      </div>
    </>
  );
}

export default MobileFilterSheet;

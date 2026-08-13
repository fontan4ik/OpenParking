/**
 * OpenParking brand mark — a 3×3 grid of dots inside a rounded square.
 *
 * Theme adaptation:
 *   - The square is filled with the parent element's `color` (set via CSS to
 *     `var(--landing-accent)`), so it follows the active theme automatically
 *     (light theme: #1F4FFF, dark theme: #5B8BFF) without any JS.
 *   - The dots stay white with a 3-step opacity hierarchy (corner / edge /
 *     center) so the icon reads consistently on either accent shade.
 *
 * The grid is intentionally spread to the full square (8px gaps on a 32px
 * viewBox) — see the design prompt in design/aether-brief.md for the
 * rationale.
 *
 * The component is `aria-hidden` because the wordmark "OpenParking" is
 * always rendered next to it in the brand link.
 */
import type { CSSProperties } from 'react';

type BrandMarkProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

export function BrandMark({ size = 32, className, style, title }: BrandMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      style={style}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {/* Square: inherits color from CSS so it tracks the active theme. */}
      <rect
        x="0"
        y="0"
        width="32"
        height="32"
        rx="7"
        ry="7"
        fill="currentColor"
      />
      {/* 3×3 dot grid, spread to the full square. */}
      <g fill="#ffffff">
        {/* Corner dots (smallest, dimmest) */}
        <circle cx="7" cy="7" r="1.7" opacity="0.38" />
        <circle cx="25" cy="7" r="1.7" opacity="0.38" />
        <circle cx="7" cy="25" r="1.7" opacity="0.38" />
        <circle cx="25" cy="25" r="1.7" opacity="0.38" />
        {/* Edge dots (medium) */}
        <circle cx="16" cy="7" r="2.3" opacity="0.68" />
        <circle cx="7" cy="16" r="2.3" opacity="0.68" />
        <circle cx="25" cy="16" r="2.3" opacity="0.68" />
        <circle cx="16" cy="25" r="2.3" opacity="0.68" />
        {/* Center dot (largest, full opacity) */}
        <circle cx="16" cy="16" r="4.4" />
      </g>
    </svg>
  );
}

export default BrandMark;

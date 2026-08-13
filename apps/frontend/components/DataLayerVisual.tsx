'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * DataLayerVisual — replaces the heavy mp4 hero with a lightweight SVG
 * composition that visually represents OpenParking's actual data product.
 *
 * Anatomy:
 *   1. Subtle city grid backdrop (streets, blocks) — theme-aware opacity.
 *   2. Concentric scan rings radiating from a focal cluster.
 *   3. Three primary clusters that "breathe" with phase offsets.
 *   4. Individual parking points (known price / free / unknown) clustered
 *      around each primary cluster, with one slowly drifting between groups.
 *   5. Curb line segments threading between clusters.
 *   6. Cursor parallax (8px max), prefers-reduced-motion respected.
 *
 * The visual is purely declarative SVG + CSS. No canvas, no WebGL, no video.
 */

type ClusterSpec = {
  id: string;
  cx: number;
  cy: number;
  count: number;
  radius: number;
  /** Hue family: blue=priced, emerald=free, amber=unknown/review. */
  tone: 'blue' | 'emerald' | 'amber';
};

type PointSpec = {
  cx: number;
  cy: number;
  r: number;
  tone: 'blue' | 'emerald' | 'amber';
  delay: number;
};

type CurbSpec = {
  d: string;
  delay: number;
};

const CLUSTERS: ClusterSpec[] = [
  { id: 'a', cx: 235, cy: 168, count: 87, radius: 84, tone: 'blue' },
  { id: 'b', cx: 555, cy: 235, count: 154, radius: 96, tone: 'emerald' },
  { id: 'c', cx: 415, cy: 430, count: 32, radius: 68, tone: 'amber' },
];

const POINTS: PointSpec[] = [
  { cx: 178, cy: 110, r: 2.4, tone: 'blue', delay: 0 },
  { cx: 290, cy: 95, r: 2, tone: 'emerald', delay: 0.4 },
  { cx: 215, cy: 195, r: 2.6, tone: 'blue', delay: 0.8 },
  { cx: 308, cy: 215, r: 1.8, tone: 'amber', delay: 1.2 },
  { cx: 165, cy: 230, r: 2.2, tone: 'emerald', delay: 0.6 },
  { cx: 350, cy: 132, r: 1.6, tone: 'blue', delay: 1.6 },
  { cx: 480, cy: 175, r: 2.4, tone: 'blue', delay: 0.2 },
  { cx: 612, cy: 178, r: 2, tone: 'emerald', delay: 0.9 },
  { cx: 600, cy: 305, r: 2.6, tone: 'amber', delay: 1.4 },
  { cx: 670, cy: 260, r: 1.6, tone: 'blue', delay: 0.5 },
  { cx: 530, cy: 305, r: 2.2, tone: 'emerald', delay: 1.1 },
  { cx: 460, cy: 360, r: 1.8, tone: 'blue', delay: 0.7 },
  { cx: 365, cy: 380, r: 2.4, tone: 'amber', delay: 1.3 },
  { cx: 470, cy: 478, r: 2, tone: 'emerald', delay: 0.3 },
  { cx: 388, cy: 500, r: 2.2, tone: 'blue', delay: 1.5 },
  { cx: 305, cy: 460, r: 1.6, tone: 'blue', delay: 0.9 },
  { cx: 545, cy: 425, r: 1.8, tone: 'emerald', delay: 0.1 },
  { cx: 252, cy: 320, r: 2, tone: 'blue', delay: 1.7 },
  { cx: 200, cy: 380, r: 1.6, tone: 'amber', delay: 0.6 },
];

const CURBS: CurbSpec[] = [
  { d: 'M 80 260 Q 220 290 360 270 T 700 240', delay: 0 },
  { d: 'M 110 410 Q 240 380 380 420 T 720 380', delay: 0.8 },
  { d: 'M 160 90 Q 300 60 460 90 T 700 70', delay: 1.6 },
];

const PARALLAX_MAX_PX = 12;

export function DataLayerVisual({
  className = '',
  title,
  caption,
  eyebrow,
}: {
  className?: string;
  title?: string;
  caption?: string;
  eyebrow?: string;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const node = stageRef.current;
    if (!node) return;

    let frame = 0;
    const handleMove = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setParallax({
          x: Math.max(-1, Math.min(1, nx)) * -PARALLAX_MAX_PX,
          y: Math.max(-1, Math.min(1, ny)) * -PARALLAX_MAX_PX,
        });
      });
    };
    const handleLeave = () => {
      cancelAnimationFrame(frame);
      setParallax({ x: 0, y: 0 });
    };

    node.addEventListener('pointermove', handleMove);
    node.addEventListener('pointerleave', handleLeave);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener('pointermove', handleMove);
      node.removeEventListener('pointerleave', handleLeave);
    };
  }, [reducedMotion]);

  const parallaxTransform = reducedMotion
    ? undefined
    : `translate3d(${parallax.x.toFixed(2)}px, ${parallax.y.toFixed(2)}px, 0)`;

  return (
    <div
      ref={stageRef}
      className={`data-layer ${className}`.trim()}
      role="img"
      aria-label={caption ?? title ?? 'OpenParking data layer'}
    >
      <div className="data-layer__frame" style={{ transform: parallaxTransform }}>
        <svg
          className="data-layer__svg"
          viewBox="0 0 800 600"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id="dl-cluster-blue" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--dl-cluster-blue-1)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--dl-cluster-blue-2)" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="dl-cluster-emerald" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--dl-cluster-emerald-1)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--dl-cluster-emerald-2)" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="dl-cluster-amber" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--dl-cluster-amber-1)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--dl-cluster-amber-2)" stopOpacity="0.7" />
            </linearGradient>
            <radialGradient id="dl-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--dl-glow-inner)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--dl-glow-inner)" stopOpacity="0" />
            </radialGradient>
            <pattern id="dl-grid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="var(--dl-grid-stroke)"
                strokeWidth="0.6"
              />
            </pattern>
            <filter id="dl-soft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          {/* city grid backdrop */}
          <rect x="0" y="0" width="800" height="600" fill="url(#dl-grid)" opacity="0.5" />

          {/* wide ambient glow */}
          <ellipse
            cx="400"
            cy="290"
            rx="380"
            ry="240"
            fill="url(#dl-glow)"
            className="data-layer__halo"
          />

          {/* scan line */}
          <line
            x1="0"
            y1="0"
            x2="800"
            y2="0"
            className="data-layer__scan"
            stroke="var(--dl-scan-stroke)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          {/* curb segments */}
          {CURBS.map((curb) => (
            <path
              key={curb.d}
              d={curb.d}
              fill="none"
              stroke="var(--dl-curb-stroke)"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeDasharray="2 5"
              className="data-layer__curb"
              style={{ animationDelay: `${curb.delay}s` }}
            />
          ))}

          {/* scan rings emanating from each cluster */}
          {CLUSTERS.map((cluster, i) => (
            <g key={`rings-${cluster.id}`} className="data-layer__rings">
              <circle
                cx={cluster.cx}
                cy={cluster.cy}
                r={cluster.radius}
                fill="none"
                stroke="var(--dl-ring-stroke)"
                strokeWidth="1"
                style={{ animationDelay: `${i * 0.6}s` }}
              />
              <circle
                cx={cluster.cx}
                cy={cluster.cy}
                r={cluster.radius * 1.4}
                fill="none"
                stroke="var(--dl-ring-stroke)"
                strokeWidth="1"
                style={{ animationDelay: `${i * 0.6 + 0.3}s` }}
              />
              <circle
                cx={cluster.cx}
                cy={cluster.cy}
                r={cluster.radius * 1.9}
                fill="none"
                stroke="var(--dl-ring-stroke)"
                strokeWidth="1"
                style={{ animationDelay: `${i * 0.6 + 0.6}s` }}
              />
            </g>
          ))}

          {/* primary clusters */}
          {CLUSTERS.map((cluster) => (
            <g
              key={cluster.id}
              className="data-layer__cluster"
              style={{ transformOrigin: `${cluster.cx}px ${cluster.cy}px` }}
            >
              <circle
                cx={cluster.cx}
                cy={cluster.cy}
                r={cluster.radius}
                fill={`url(#dl-cluster-${cluster.tone})`}
                className="data-layer__cluster-fill"
                filter="url(#dl-soft)"
                opacity="0.55"
              />
              <circle
                cx={cluster.cx}
                cy={cluster.cy}
                r={cluster.radius * 0.62}
                fill="none"
                stroke="var(--dl-cluster-ring)"
                strokeWidth="1"
                opacity="0.65"
              />
              <circle
                cx={cluster.cx}
                cy={cluster.cy}
                r={cluster.radius * 0.36}
                fill="var(--dl-cluster-core)"
                opacity="0.92"
              />
              <text
                x={cluster.cx}
                y={cluster.cy + 4}
                textAnchor="middle"
                className="data-layer__cluster-count"
              >
                {cluster.count}
              </text>
            </g>
          ))}

          {/* individual points */}
          {POINTS.map((point, i) => (
            <circle
              key={i}
              cx={point.cx}
              cy={point.cy}
              r={point.r}
              fill={`var(--dl-point-${point.tone})`}
              className="data-layer__point"
              style={{ animationDelay: `${point.delay}s` }}
            />
          ))}
        </svg>

        {(eyebrow || title || caption) && (
          <div className="data-layer__overlay" aria-hidden="true">
            {eyebrow && <span className="data-layer__eyebrow">{eyebrow}</span>}
            {title && <span className="data-layer__title">{title}</span>}
            {caption && <span className="data-layer__caption">{caption}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

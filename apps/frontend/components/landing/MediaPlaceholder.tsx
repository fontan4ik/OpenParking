'use client';

import { useState, type CSSProperties, type ImgHTMLAttributes } from 'react';

/**
 * MediaPlaceholder — a contract-correct photo slot.
 *
 * Renders a real JPEG asset from `asset-prompts.md` when the user has supplied
 * it. Until then it renders a tonal
 * fallback gradient with the correct aspect ratio and focal point, so
 * the page is never broken or replaced by an SVG stand-in.
 *
 * Every photo slot is defined in `design/asset-prompts.md`. The same
 * filenames, focal points, and overlay rules feed this component.
 *
 * Behavior contract:
 *   - The wrapper reserves space with the asset's intrinsic aspect ratio
 *     so there is no layout shift while the photo loads.
 *   - The fallback gradient sits BEHIND the `<img>` and matches the
 *     dominant dark-canvas color so no flash of the wrong tone.
 *   - If the asset 404s (delivery still pending in the repo), the `<img>`
 *     is removed and only the gradient shows — the user never sees broken
 *     media, and the console stays quiet.
 *   - `loading="lazy"` by default, `eager` + `fetchpriority="high"`
 *     for above-the-fold slots (the hero plate).
 *   - `prefers-reduced-motion` does not change this asset — it is a
 *     still, not a video. The video is a separate slot (ASSET-011).
 */

export type MediaAsset = {
  /** Filename without extension. */
  base: string;
  /** Subdirectory under `public/media/`. */
  folder: 'landing' | 'cities';
  /** Master aspect ratio, expressed as `width / height`. */
  aspect: number;
  /** Object-position keyword, e.g. 'center 60%' for a card crop. */
  objectPosition?: string;
  /** Alt text for the image. */
  alt: string;
  /** Decorative tone label used to render the fallback gradient. */
  tone?: 'miami-dusk' | 'miami-aerial' | 'street-curb' | 'kiosk' | 'sf-street' | 'valet';
};

type MediaPlaceholderProps = {
  asset: MediaAsset;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  className?: string;
  style?: CSSProperties;
  /** Optional CSS class for the wrapper that hosts the photo. */
  wrapperClassName?: string;
  /** Optional CSS variable override for the fallback gradient tone. */
  fallbackTone?: string;
  /** When true the wrapper stretches to its parent instead of enforcing
   *  the asset's intrinsic aspect ratio. Use inside bento tiles and other
   *  size-controlled slots where the parent sets width/height. */
  fillParent?: boolean;
} & Pick<ImgHTMLAttributes<HTMLImageElement>, 'sizes' | 'decoding'>;

const TONE_TO_GRADIENT: Record<NonNullable<MediaAsset['tone']>, string> = {
  'miami-dusk':
    'radial-gradient(70% 50% at 30% 30%, rgba(91, 139, 255, 0.22), transparent 60%),' +
    'radial-gradient(60% 40% at 80% 80%, rgba(255, 192, 98, 0.16), transparent 60%),' +
    'linear-gradient(160deg, #0c1322 0%, #11192c 60%, #0a1020 100%)',
  'miami-aerial':
    'radial-gradient(80% 60% at 50% 30%, rgba(125, 211, 252, 0.18), transparent 60%),' +
    'linear-gradient(180deg, #0c1828 0%, #0e1a2c 100%)',
  'street-curb':
    'linear-gradient(140deg, #1c2230 0%, #131925 60%, #0c111a 100%)',
  'kiosk':
    'linear-gradient(150deg, #1a2030 0%, #121828 60%, #0a0e18 100%)',
  'sf-street':
    'linear-gradient(135deg, #1a2230 0%, #141a26 60%, #0c111a 100%)',
  valet:
    'linear-gradient(150deg, #1a1c2a 0%, #11131e 60%, #0a0c14 100%)',
};

const FALLBACK_TONE_DEFAULT =
  'linear-gradient(180deg, #0c1220 0%, #0a1020 100%)';

export function MediaPlaceholder({
  asset,
  loading = 'lazy',
  fetchPriority = 'auto',
  className,
  style,
  wrapperClassName,
  fallbackTone,
  sizes,
  decoding = 'async',
  fillParent = false,
}: MediaPlaceholderProps) {
  const basePath = `/media/${asset.folder}/${asset.base}`;
  const aspectRatio = asset.aspect;
  const aspectStyle: CSSProperties = fillParent
    ? { width: '100%', height: '100%' }
    : { aspectRatio: String(aspectRatio) };
  const objectPosition = asset.objectPosition ?? 'center 50%';
  const toneKey = asset.tone ?? null;
  const gradient = (toneKey && TONE_TO_GRADIENT[toneKey]) || fallbackTone || FALLBACK_TONE_DEFAULT;

  // When the asset file is not on disk yet (the landing image set is still
  // being authored), the browser logs a 404 every time it scrolls a card
  // into view. Track the load failure and drop the `<img>` so the
  // gradient fallback is the only thing rendered.
  const [assetMissing, setAssetMissing] = useState(false);

  return (
    <div
      className={wrapperClassName}
      style={{
        position: 'relative',
        background: gradient,
        overflow: 'hidden',
        ...aspectStyle,
        ...style,
      }}
      data-asset={asset.base}
      data-asset-folder={asset.folder}
      data-asset-tone={toneKey ?? 'default'}
      data-asset-state={assetMissing ? 'fallback' : 'photo'}
      data-fill={fillParent ? 'parent' : 'aspect'}
    >
      {assetMissing ? null : (
        <img
          src={`${basePath}.jpg`}
          alt={asset.alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding={decoding}
          sizes={sizes}
          className={className}
          onError={() => setAssetMissing(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition,
            display: 'block',
          }}
        />
      )}
    </div>
  );
}

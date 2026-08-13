# OpenParking hero GLB scene spec

## Intent

The hero uses the supplied BMW M3 GLB as a real, bounded 3D product moment.
Pointer movement rotates the car slightly around its vertical axis; it does not
control an unrestricted turntable. The copy remains the primary action surface.

## Layers and camera

- Neutral landing canvas, no photographic background or glass veil.
- Project-owned web GLB is centered from measured bounds, with a perspective camera,
  three-point light rig, environment reflection, and a soft contact shadow.
- Pointer mapping: x => bounded yaw ±0.46 rad, y => pitch ±0.08 rad, damped in
  `useFrame`; drag adds a bounded yaw offset.
- Mobile: the real model remains the only vehicle layer, with a right-side crop;
  touch drag works through pointer capture and never covers the CTA.

## Performance and fallbacks

- Source: `ASSETS/bmw_m3_sedan_topaz_blue_car.glb`; byte-identical web copy was
  optimized with Meshopt into `apps/frontend/public/media/landing/bmw_m3_sedan_topaz_blue_car.web.glb`.
- Original: 49,939,492 bytes / SHA-256 `291a93889a1d06987a77da2c37269c037eab9c6c518d5ea7b12a378b1c95130b`.
- Optimized web copy: 6.84 MB, preserving materials and silhouette; no geometry
  simplification, texture downsampling, joining, or flattening was applied.
- R3F/drei existing project dependencies; no new dependency.
- DPR capped at 1.35; `useGLTF.preload`; Suspense fallback; explicit Canvas and
  error-boundary fallback copy. `data-media-state` is loading until the first
  presented frame, then ready; fallback status is absent in ready state.
- `prefers-reduced-motion` disables pointer animation and floating motion while
  leaving a still GLB visible.
- If WebGL or the model fails, preserve the hero copy and CTA without claiming
  the 3D scene is available.

## Rejected approaches

- Legacy SVG, sprite sheet, video substitutions, and procedural RoundedBox car:
  removed; they were not the supplied real 3D vehicle.
- Perpetual border beam and translucent copy panels: removed because they
  compete with the message and add motion without product meaning.

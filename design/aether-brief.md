# OpenParking Premium Redesign — Implementation Brief

> **Status:** supplied BMW GLB integration pass in progress; diagnostics complete; implementation being verified.
> **Date:** 2026-08-10
> **Scope:** unified visual story for `/` (landing) and `/map` (driver map).
> **Author role:** Aether (frontend design + implementation contract).
> **Locked design system:** `../DESIGN.md` (Atlas focus) — extended, not replaced.

---

## 0. What changed in this pass (2026-08-10)

- **True supplied REAL_3D car on landing** — `components/landing/Car3D.tsx` renders the supplied BMW M3 GLB with React Three Fiber and drei. The project-owned Meshopt copy is loaded only after the vehicle scene exists; pointer movement, drag, touch, readiness, error, and reduced-motion behavior are explicit.
- **Dark palette harmonized** — dark canvas deepened to a cool graphite-blue with a single accent ramp; parking colors re-tuned in OKLCH so they sit on both light and dark canvases without clashing; status chips stay legible at AAA over the new canvas.
- **Parking semantic colors unified** — single source of truth `--pk-conflict/--pk-priced/--pk-free/--pk-unpriced/--pk-unknown/--pk-stale`. MapLibre `statusColorExpression` in `components/ParkingMap.tsx` now reads these via a small JS bridge (computed once on theme change), so the map and the UI never drift.
- **Map interaction polish** — collapsible layer toggles group, animated status chips, mobile bottom-sheet filter, route panel with start/destination polling.
- **Landing surfaces** — existing bento/photos remain available below the fold, while the hero removes the marquee, border beam, hyper-text, and all vehicle substitutes so the BMW remains the single signature moment.
- **Asset brief corrected** — `design/asset-prompts.md` now asks the user only for generator-appropriate raster/video media. ASSET-013 is a canonical still followed by an attached-reference image-to-video arc; ambient gradients and icons stay deterministic code assets.

---

## 1. Product story and primary user action

OpenParking is a **map-first parking intelligence workspace** for the United States. The redesign turns the landing and the driver map into a single visual narrative:

> *Browse the country at a glance → zoom into a city → pick a place to park → drive there with confidence in the source.*

Three audiences share the same UI, so the visual story must speak to all of them at once without re-styling for each:

| Audience | Primary action | Page where it lives |
| --- | --- | --- |
| Driver comparing options | "Find me a place to park near X with a known price" | `/` → `/map` (search + compare) |
| Contributor / reviewer | "Is this record correct? Can I prove it?" | `/map` (detail panel) + `/admin` |
| Operator / data steward | "Where are we missing coverage or fresh prices?" | `/admin` and `/map` quality mode |

The redesigned landing must make this journey **legible in one scroll**: the same camera that shows the country in the hero ends up inside the South Beach map of `/map`. Two pages, one zoom, no visual break.

---

## 2. Visual thesis

| Adjectives (we want) | Anti-goals (we never want) |
| --- | --- |
| **Editorial** — confident typography, generous negative space, restrained color | Purple-on-white SaaS defaults, generic Tailwind shadcn, card-grid bento with no information logic |
| **Honest** — data quality before decoration, unknown is a label, not a flaw | "Beautiful" numbers that aren't real, dressed-up missing prices, map layers that pretend to be a single source |
| **Atmospheric** — soft cool graphite, single light direction, glass only where it pays for itself | Constant glow, perpetual marquees, animated blobs, micro-interactions on every element |
| **Cinematic** — single hero signature moment, real depth, scale zoom story | Pure-illustration hero, generic 3D blob, float-on-scroll sections without content |

The existing **`DESIGN.md` Atlas focus** is the right thesis. The premium push is **scale + a single signature moment** — the South Beach photo plate + a depth-rendered hero car that gives the page a real focal point. The car lives in the hero only; everywhere else is still typography and data.

---

## 2.5 The signature visual moment — supplied REAL_3D BMW hero car

A single **depth-styled car** sits on the right third of the hero, in front of the Miami photo plate. Implementation:

- **Asset** — `ASSETS/bmw_m3_sedan_topaz_blue_car.glb`, optimized to `public/media/landing/bmw_m3_sedan_topaz_blue_car.web.glb` with Meshopt.
- **Interaction** — local pointer x gives a bounded front-follow yaw; drag and touch add bounded yaw. CTA sits in a separate DOM layer and remains clickable.
- **Lighting** — neutral three-point rig plus `Environment` and contact shadow; no image, SVG, sprite, or video is layered behind the model.
- **Reduced motion** — still GLB remains visible and pointer/drag rotation is disabled.
- **Readiness** — `data-media-state="loading|ready|error"`; ready is set only from the first `useFrame` after the GLB scene is mounted.

The car is the **only** decorative element on the page. Every other surface stays in the existing editorial + data-honest register.

---

## 2.6 Refined dark theme palette (was: `#060912` / `#5b8bff`)

Goal: a single ramp that holds the photo plate, the magic-bento cards, the map overlay, and the parking status chips without any of them feeling chalked on. All values in OKLCH so light/dark variants stay perceptually balanced.

| Token | Dark value | Light value | Use |
| --- | --- | --- | --- |
| `--canvas-0` | `oklch(0.16 0.012 252)` | `oklch(0.985 0.003 252)` | App background |
| `--canvas-1` | `oklch(0.20 0.014 252)` | `oklch(0.965 0.005 252)` | Section background |
| `--canvas-2` | `oklch(0.25 0.016 252)` | `oklch(0.935 0.008 252)` | Card / panel |
| `--canvas-3` | `oklch(0.30 0.018 252)` | `oklch(0.905 0.010 252)` | Hover / pressed |
| `--ink-strong` | `oklch(0.97 0.004 252)` | `oklch(0.22 0.014 252)` | Body text |
| `--ink-mute` | `oklch(0.78 0.010 252)` | `oklch(0.42 0.014 252)` | Secondary text |
| `--ink-faint` | `oklch(0.60 0.012 252)` | `oklch(0.58 0.012 252)` | Tertiary / labels |
| `--border-subtle` | `oklch(1 0 0 / 0.07)` | `oklch(0.20 0.014 252 / 0.10)` | Hairlines |
| `--border-strong` | `oklch(1 0 0 / 0.14)` | `oklch(0.20 0.014 252 / 0.20)` | Selected / focus rings |
| `--accent` | `oklch(0.72 0.16 252)` | `oklch(0.58 0.18 256)` | Action blue (CTAs, links) |
| `--accent-soft` | `oklch(0.72 0.16 252 / 0.18)` | `oklch(0.58 0.18 256 / 0.16)` | Selected fill |
| `--ring` | `oklch(0.72 0.16 252 / 0.55)` | `oklch(0.58 0.18 256 / 0.55)` | Focus ring |

These replace the legacy `--landing-canvas/--landing-ink/--landing-accent` variables in the Landing v2 namespace; the legacy tokens are kept as aliases for one release and then removed.

---

## 2.7 Parking semantic colors (single source of truth)

Every status chip, legend swatch, map circle, and detail-panel pill pulls from this ramp:

| Token | Light value | Dark value | Maps to ParkingMap statusColorExpression |
| --- | --- | --- | --- |
| `--pk-conflict` | `oklch(0.60 0.20 27)` | `oklch(0.66 0.21 27)` | conflict, stale (was `#ef4444`) |
| `--pk-priced` | `oklch(0.56 0.16 256)` | `oklch(0.66 0.16 256)` | known_priced (was `#3b82f6`) |
| `--pk-free` | `oklch(0.56 0.16 156)` | `oklch(0.72 0.16 156)` | known_free (was `#10b981`) |
| `--pk-unpriced` | `oklch(0.55 0.012 256)` | `oklch(0.62 0.012 256)` | known_unpriced (was `#64748b`) |
| `--pk-unknown` | `oklch(0.66 0.15 78)` | `oklch(0.74 0.15 78)` | paid_unknown, variable, needs_review (was `#f59e0b`) |
| `--pk-default` | `oklch(0.62 0.012 256)` | `oklch(0.70 0.012 256)` | Map default (was `#94a3b8`) |

The ramp sits perceptually balanced under both canvases, with the green + amber staying a hair brighter in dark mode so they read against the deeper `--canvas-0`. Red is anchored by chroma so it never looks pink on dark.

The map engine in `components/ParkingMap.tsx` reads these tokens once on theme change via a tiny `getCssVar()` bridge and rebuilds the `statusColorExpression` array. No hex strings in the map code any more.

---

## 2.8 Magic UI ports — components reused from the open registry

These are MIT-licensed ports of published Magic UI components. No new npm dependency. Each lives in `components/landing/magic/` and ships with a built-in reduced-motion fallback.

| Port | Source | Use on the landing | Built with |
| --- | --- | --- | --- |
| `MagicBentoGrid` | `magicui.design/r/bento-grid` | "What you can find" / "What we map" feature sections | CSS grid + bento grid template areas + corner accents |
| `MagicMarquee` | `magicui.design/r/marquee` | Cities strip + operator logos scroller | CSS `@keyframes` marquee + duplicated content |
| `MagicNumberTicker` | `magicui.design/r/number-ticker` | The four live coverage counters | rAF count-up, easing, `IntersectionObserver` first-fire |
| `MagicHyperText` | `magicui.design/r/hyper-text` | Hero headline accent ("Find a place to park → Find a place to park") | Character scramble via `useEffect` interval; respects reduced motion |
| `MagicBorderBeam` | `magicui.design/r/border-beam` | CTA + premium stat card glow | Animated `conic-gradient` border ring on a single element |

The bento grid template areas at desktop / tablet / mobile are:

```
desktop:
  "facilities facilities curb          curb      "
  "facilities facilities curb          curb      "
  "confidence  confidence confidence  sources  "

tablet:
  "facilities curb"
  "confidence sources"

mobile:
  "facilities"
  "curb"
  "confidence"
  "sources"
```

Each tile is keyed by `tone` to drive both the fallback gradient (before a photo loads) and the photo's `object-position`.

---

## 3. Existing inventory (read-only audit results)

### 3.1 Routes

| Route | File | Role | Notes |
| --- | --- | --- | --- |
| `/` | `apps/frontend/app/page.tsx` | Marketing landing | Already on "Landing v2" class system; uses Bricolage/Manrope/JetBrains Mono |
| `/map` | `apps/frontend/app/map/page.tsx` | Driver map + sidebar | Light default; admin mode is opt-in via `useAdminMode()` |
| `/admin` | `apps/frontend/app/admin/...` | Internal review workspace | Mobile-first, separate shell |
| `/api/stats`, `/api/facilities`, `/api/geojson/[layer]`, `/api/parking-index`, `/api/observations`, `/api/route`, `/api/geocode/forward` | `app/api/...` | Public API | **Compatibility contract — must not break** |

### 3.2 Components

| Component | File | Reuse? | Notes |
| --- | --- | --- | --- |
| `DataLayerVisual` | `components/DataLayerVisual.tsx` | **Legacy, no longer used in the hero** | Was the SVG data-illustration; removed from the landing per 2026-08-06 directive. File kept for reference, not imported by `page.tsx`. |
| `HeroComposition` (+ `HeroGlassStatCard`) | `components/landing/HeroComposition.tsx` | **New hero primitive** | Editorial full-bleed hero: real photo plate + loop video luminosity blend + overlay + copy + floating glass stat card. Props: `{ asset, loopVideoSrc?, stats, content }`. |
| `ThemeSwitch` (animated) | inside `app/page.tsx` + `app/map/page.tsx` | **Keep** | Duplicated; extract is a separate refactor, do not bundle with the visual redesign. |
| `Reveal` (IntersectionObserver) | `app/page.tsx` | **Keep, extend** | Currently only fade+rise; needs directional variants for new sections. |
| `LanguageProvider`, `FlagIcon` | `components/LanguageProvider.tsx`, `components/FlagIcon.tsx` | **Keep** | EN/RU already wired. |
| `ParkingMap` (55 KB) | `components/ParkingMap.tsx` | **Do not refactor** | Accepted debt in `DESIGN.md`; visual iteration must not mix with the map engine refactor. |
| `ParkingAssistant` | `components/ParkingAssistant.tsx` | **Keep** | Driver task surface, separate from the redesign. |
| `AdminModeContext` | `components/AdminModeContext.tsx` | **Keep** | Admin context is used by both `/map` and the toolbar. |

### 3.3 Design tokens (locked, do not change)

`DESIGN.md` and `app/globals.css` already lock these — the redesign consumes them, it does not invent new ones.

| Group | Status |
| --- | --- |
| Colors (canvas, surface, panel, glass, action blue, free emerald, uncertain amber, conflict red, curb cyan) | Locked, theme-aware |
| Spacing (`--space-1` … `--space-8`, 4 → 40px) | Locked |
| Radii (8/12/16) | Locked |
| Shadow (subtle card + accent glow) | Locked |
| Typography (Bricolage Grotesque display, Manrope body, JetBrains Mono data) | Locked and already loaded |
| Motion (micro 120–160 ms, standard 180–260 ms, map emphasis 350–700 ms) | Locked |
| Color rules (blue = action, green = verified free, amber = review, red = conflict) | Locked |

The Landing v2 namespace in `globals.css` (lines 8445–9651) adds landing-specific tokens (`--landing-canvas`, `--landing-ink`, `--landing-accent`, `--landing-cyan`, etc.) and follows the same semantic rules — the redesign extends this namespace, it does not fork it.

### 3.4 Existing media (already on disk)

| File | Size | Status | Recommendation |
| --- | --- | --- | --- |
| `public/brand/openparking-mark.svg` | 3.4 KB | **Keep** | Mark, 42×42 used in header and footer. |
| `public/brand/openparking-lockup.svg` | 3.2 KB | **Keep** | Wordmark variant for light backgrounds. |
| `public/brand/openparking-lockup-on-light.svg` | 3.3 KB | **Keep** | Wordmark on light. |
| `public/brand/openparking-mark-animated.svg` | 5.5 KB | **Keep, optional use** | Has a subtle SMIL pulse — usable in the footer mark if we want a "live" hint. |
| `public/hero/openparking-hero-light.mp4` | 2.5 MB | **Replace** | Currently unused (`landing-hero-video` styles exist but `app/page.tsx` no longer references `<video>`). See "Hero media decision" below. |
| `public/hero/openparking-hero-dark.mp4` | 2.6 MB | **Replace** | Same as above. |
| `public/animations/hero-map.json` | 204 KB | **Audit then keep or replace** | Lottie animation; size suggests it may be a vehicle/landmark flyover. Needs an editor pass — if it is on-brand, reuse; otherwise treat as legacy. |
| `public/icon.png`, `public/logo.png` | 411 KB, 411 KB | **Keep as fallback** | Used for OG images and where the favicon can only be PNG. |

### 3.5 Live data scope (sets the visual story)

| City | Records | Layer shape | Story potential |
| --- | --- | --- | --- |
| Miami | 621 facilities, 532 lot/zone polygons, 0 curb lines (yet) | Mixed point + polygon | Default hero. South Beach, Ocean Drive, Collins Ave are cinematic locations. |
| San Francisco | 33,511 meter facilities, 2,889 curb segments, 403 OSM zones | Dense point + line | Best "scale" story — a high-density metered street grid. |
| NYC, LA, Seattle, Chicago | Research only | None | Use as "research tracks" panel, do not claim coverage. |

**Data honesty rule (from `DESIGN.md` and `AGENTS.md`):** unknown price, missing payment, low confidence, and regulatory zones are explicit text states, never inferred from color. Every new hero image, badge, or large number must come from `/api/stats` or `lib/sources.ts` — no decoration that implies a number we don't have.

---

## 4. Required additions to the design contract (read-only outline)

These extend `DESIGN.md`; the actual update to `DESIGN.md` happens in the implementation pass.

### 4.1 Section sequence for `/`

The existing landing already has 6 sections + footer. The premium version reuses them but reorganizes around the **scale zoom** story:

| # | Section | Job | Visual job | Locked tokens / components |
| --- | --- | --- | --- | --- |
| 0 | Sticky header | Brand + locale + theme + "Open app" | Translucent, blurs on scroll | `.landing-header` (sticky already) |
| 1 | **Hero** | Hook | "From country to curb" — editorial title + real South Beach photo plate + loop video luminosity blend + floating glass stat card | `.hero-composition`, `.hero-editorial`, `.hero-glass-card`, `Reveal` |
| 2 | **Live coverage** | Prove | 4 real numbers with provenance — same as today, but with a parallax image plate | `.landing-metric-grid` (4 cols desktop, 2 tablet, 1 mobile) |
| 3 | **What we map** | Explain | 3 cards (Facilities / Curb / Confidence) — replace abstract icons with photographs + captions | `.landing-features__grid` |
| 4 | **How it works** | How | 3 sticky steps with scroll-linked progress (existing copy, new visual treatment) | `.landing-how__list` |
| 5 | **Sources we trust** | Prove | 4 source cards with thumbnails of the actual upstream (Miami ArcGIS, OSM, SFMTA, Overture) | `.landing-sources__grid` |
| 6 | **Cities** | Convert | Sticky city preview map: hover Miami → camera flies to South Beach, hover SF → camera flies to SoMa | `.landing-cities__grid` + new sticky map |
| 7 | **CTA** | Convert | Single premium "Open the live map" panel reusing `.landing-primary` | New `.landing-cta` |
| 8 | Footer | Navigate | Existing structure, tighten spacing | `.landing-footer` |

### 4.2 The signature visual moment

**"Scale zoom"** — the same neighborhood appears twice: once as the cinematic hero photo (South Beach, ASSET-001) with the floating glass stat card, once as the live MapLibre canvas on `/map`. The Cities section makes the connection literal: a small sticky map preview whose camera flies to the hovered city's center, then the "Open the live map" CTA hands off to `/map?city=miami` with the matching center/zoom/bearing pre-loaded.

This is the only "decorative" motion the page earns. Everything else is functional (reveal, hover, focus).

### 4.3 Multi-layer scroll animation grammar

CSS-only + IntersectionObserver (no Framer Motion, GSAP, or Lottie runtime — none are in `package.json`). The Landing v2 CSS already has the bones.

| Layer | Trigger | Motion | Easing | Reduced motion |
| --- | --- | --- | --- | --- |
| Section reveal | IntersectionObserver, threshold 0.12 | `opacity 0→1` + `translateY(14px → 0)` | `cubic-bezier(.2,.8,.2,1)` 600 ms | opacity 1, no transform |
| Hero parallax (decorative plate) | `scroll` (rAF-throttled) | `translateY(-6vh → +6vh)` max 12 px | linear | none |
| Sticky map preview camera fly-in | mouseenter/focus on city card | MapLibre `flyTo`, 900 ms | MapLibre default | snap, no animation |
| Metric counter tick | first time the section enters viewport | `requestAnimationFrame` count-up 900 ms | linear, no overshoot | skip |
| Source card image hover | `:hover` | `transform: scale(1.03)` (GPU-only) 280 ms | `cubic-bezier(.2,.8,.2,1)` | none |
| CTA arrow nudge | `:hover` | `translateX(3px)` (already in v2) | `var(--landing-easing)` 240 ms | none |

GPU-only property rule: animate `transform` and `opacity` only. No `box-shadow`, `background-position`, `filter` blur, or layout properties on scroll.

### 4.4 Media integration points (the actual places to drop photos and short video)

| Place | Format | Dimensions / duration | Purpose | Asset file (see `asset-prompts.md`) |
| --- | --- | --- | --- | --- |
| Hero background plate | WebP still (ASSET-001) + optional short loop (ASSET-011) | 1920×1200, 6–8 s loop | Cinematic "Miami at dusk" backdrop, parallax tied to scroll, luminosity blend over the plate | ASSET-001 / ASSET-011 |
| Hero foreground | Editorial copy + floating glass stat card | n/a | `HeroGlassStatCard` — 4 metrics in a double-bezel glass shell | custom |
| Live coverage section (right of metrics) | WebP still | 1200×800 | Aerial of South Beach parking lots — visual proof of the numbers | ASSET-002 |
| "What we map" card 1 (Facilities) | WebP still | 800×1000 portrait | Miami street-level parking photo with curb meters | ASSET-003 |
| "What we map" card 2 (Curb) | WebP still | 800×1000 portrait | South Beach street curb segment photo | ASSET-004 |
| "What we map" card 3 (Confidence) | WebP still | 800×1000 portrait | ParkMobile / PayByPhone kiosk close-up (operator reality) | ASSET-005 |
| Sources card 1 (Miami-Dade / City of Miami Beach) | WebP still | 600×400 | Miami Beach ArcGIS layer sample or branded screenshot | ASSET-006 |
| Sources card 2 (OSM / Geofabrik) | WebP still | 600×400 | OSM map fragment showing a street with parking tags | ASSET-007 |
| Sources card 3 (SFMTA benchmark) | WebP still | 600×400 | San Francisco SoMa street map fragment with meter pins | ASSET-008 |
| Sources card 4 (Overture / operators) | WebP still | 600×400 | Operator app screenshot or branded operator photo | ASSET-009 |
| Cities sticky preview map | Live MapLibre | n/a | Real `/map` instance inside a 460-px card; not a static asset | (no asset) |
| CTA panel | WebP still | 1920×900 | Hero continuation: a Miami curb at golden hour, gradient mask left→right | ASSET-010 |
| Hero short loop (premium alternative) | MP4 / WebM | 1920×1080, 6–8 s, H.264 + VP9, < 4 MB | Slow drone shot of Miami Beach with parking lots, no text overlay | ASSET-011 |
| City fly-in transition | MP4 / WebM | 1280×720, 2 s | Cross-fade between the static hero and the live map view | ASSET-012 |

Every photo and video slot above has a placeholder in the new CSS (final filenames, aspect ratio, focal point, fallback gradient, and loading behavior). The `asset-prompts.md` file is the source of truth for generator inputs.

### 4.5 Component-source map

| Surface | Reuse | Adapt | Build new |
| --- | --- | --- | --- |
| Header (locale + theme + CTA) | Existing in `app/page.tsx` | Theme switcher stays; raise to sticky on scroll | — |
| Hero data illustration | `HeroComposition` | Layers photo plate + loop video + overlay + editorial content + glass stat card | `HeroComposition` |
| Live numbers | Existing `.landing-metric` | Add a real `IntersectionObserver` count-up for the val (currently static) | `<CountUp>` (8 lines) |
| Cards (features, sources) | Existing markup | Replace SVG icons with `<picture>` tags using the new ASSET-* WebP files | `<MediaCard>` (lightweight wrapper) |
| Sticky city preview | — | — | New `<CityPreviewMap>` (60-80 lines, mounts a small MapLibre instance with the same style + center as `/map`) |
| CTA panel | Existing `.landing-primary` | Add a photographic backdrop | New `.landing-cta` styles |
| Footer | Existing markup | Reduce to 2-column on mobile (already 2) | — |

No Tailwind, no new animation library, no shadcn, no Lottie runtime, no WebGL. The new code is plain React, plain CSS, plain SVG, and one small MapLibre instance for the city preview.

### 4.6 Responsive acceptance criteria

| Breakpoint | Width | Acceptance |
| --- | --- | --- |
| Desktop XL | ≥ 1280 px | Two-column hero, 4-col metric grid, 3-col feature grid, 2×2 sources, 3-col city grid, side-by-side CTA |
| Desktop L | 1024–1279 px | Same as XL, 2-col metric grid begins to soften |
| Tablet | 768–1023 px | Hero stacks (visual below text), 2-col metric, 2-col feature, 2-col sources, 2-col city, single CTA |
| Mobile L | 480–767 px | Single column for everything, sticky header stays translucent, hero visual drops to 360 px tall |
| Mobile S | ≤ 479 px | 360 px hero visual, 1-col cities, full-bleed CTA |

Touch targets: never below 44 px on mobile, 36 px is acceptable only for compact secondary controls. Headings are never below 11 px; actionable text never below 12 px.

### 4.7 Accessibility constraints (already in `DESIGN.md`, re-stated for the new media)

- All hero photographs must have `alt` text that names what's there ("Aerial view of South Beach parking lots at dusk") and a fallback gradient identical to the photo's dominant color so screen reader and no-JS users see the same composition.
- The short hero loop must have `aria-hidden="true"` and a `prefers-reduced-motion` guard that swaps the video element for the still photo.
- The sticky city preview map must announce city name + status with `aria-label` and stay keyboard reachable.
- Every photo is a 3:1 or 4:1 focal composition — center-weighted subjects only, so the visual still works at 320 px wide.
- `prefers-reduced-motion: reduce` must disable parallax, the city fly-in, the cluster pulse, and the curb stroke animation. The current `Landing v2` reduced-motion block already covers most of this; the redesign extends it.
- WCAG 2.2 AA: 4.5:1 body, 3:1 large text and controls. Theme switches must not invert the perception of the photographs (the `dl-*` color tokens already account for this).

### 4.8 What stays out of scope for this redesign (deliberately)

- Replacing the global CSS or migrating to Tailwind / shadcn. (Per accepted debt in `DESIGN.md`.)
- Refactoring `ParkingMap.tsx` into smaller modules. (Visual iteration is not the right vehicle for that work.)
- Touching `/admin` and the admin shell.
- Renaming the `parkingusa` / `ParkingUSA` legacy identifiers in API contracts.
- Generating MapLibre vector tiles or touching the tile-server path.
- Adding a new public API route.
- Adding user accounts, auth, or sessions.

---

## 5. Implementation pass plan (for the next phase, not done now)

When the user gives the green light, the work proceeds in this order so that each pass is verifiable on its own:

1. **Visual contract update** — write the additions from §4 into `DESIGN.md` (sections 9–12: media placements, scale zoom, scroll grammar, city preview).
2. **Asset production** — generate the 12 ASSET-* files via the prompts in `asset-prompts.md`, place them in `public/media/landing/` and `public/media/cities/`, and update `next.config.js` if AVIF/WebP is needed.
3. **Landing v2 evolution** — extend the existing `Landing v2` CSS block in `app/globals.css` (do not fork it). Add the new section CSS (`.landing-cta`, `.city-preview-map`, `.media-card`, the parallax plate, the count-up).
4. **New components** — `<HeroComposition>`, `<CountUp>`, `<MediaCard>`, `<CityPreviewMap>`. Each ≤ 100 LOC, exported from `apps/frontend/components/landing/`.
5. **i18n** — add new translation keys to both `en` and `ru` blocks of `lib/i18n.ts`. No English-only copy.
6. **Map ↔ landing handoff** — `app/page.tsx` city card `Link` becomes `<Link href={\`/map?city=${id}&lng=...&lat=...&zoom=...\`}>` and `app/map/page.tsx` reads those params on mount.
7. **Verification** — `npm run build`; visual review at 1280×720 and 390×844 in EN and RU; `prefers-reduced-motion: reduce` check; `prefers-color-scheme` check.

---

## 6. Open questions for the next pass (recorded, not blocking)

| # | Question | Default if no answer |
| --- | --- | --- |
| Q1 | Should the hero replace `DataLayerVisual` entirely with a short video, or keep the SVG and add a photo plate behind it? | **RESOLVED 2026-08-06**: remove the SVG entirely. Hero = real South Beach photo plate (ASSET-001) + loop video luminosity blend (ASSET-011) + floating double-bezel glass stat card (4 metrics). SVG stays only for icons/masks. |
| Q2 | Should the sticky city preview be a real MapLibre instance or a pre-rendered tile snapshot? | Real MapLibre instance, lazy-mounted on first city card hover to keep the initial JS bundle small. |
| Q3 | Should `HeroComposition` ship its own parallax JavaScript or use the new CSS `animation-timeline: scroll()` feature? | JS for now, behind a `prefers-reduced-motion` guard; revisit when browser support is wider. |
| Q4 | Should the 4 metric numbers animate from 0 on first scroll-in, or appear instantly? | Animate from 0 once; honor reduced motion. |
| Q5 | Should the source cards link to the public API or stay as documentation pointers? | Link to the existing public `data-brief` doc; the API endpoint is documented in the footer. |

---

## 7. Verification matrix (what to run when implementation begins)

```powershell
npm run build
npm test
```

Manual checks:

- `/` at 1280×720, EN, dark — hero photo plate visible, glass stat card floating over the right third, no jank on scroll.
- `/` at 390×844, EN, light — single column, sticky header, hero plate masked correctly.
- `/` at 1280×720, RU — copy fits, kicker text is not clipped, `prefers-color-scheme` looks balanced.
- `/map?city=miami` with the new `lng/lat/zoom` params from the landing city card — camera matches the landing preview.
- `prefers-reduced-motion: reduce` — parallax and pulse animations stop, hero still photo is shown, fly-in snaps.
- Lighthouse (mobile, throttled) — Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95. Target the LCP photo at < 2.5 s on a slow 4G profile.

---

## 8. Files to add or change when implementation starts (read-only manifest, no edits yet)

| Path | Action | Why |
| --- | --- | --- |
| `DESIGN.md` | Edit (add §9–§12) | Persist the new media placements and motion grammar |
| `app/globals.css` | Edit (extend Landing v2 block) | Add new section styles without forking the system |
| `app/page.tsx` | Edit | Wire new components, no behavior change |
| `lib/i18n.ts` | Edit (append new keys) | EN + RU coverage |
| `app/map/page.tsx` | Edit (one useEffect) | Read `city/lng/lat/zoom` from URL |
| `components/landing/HeroComposition.tsx` | Create | Layered hero: photo plate + SVG + parallax |
| `components/landing/CountUp.tsx` | Create | rAF count-up honoring reduced motion |
| `components/landing/MediaCard.tsx` | Create | `<picture>` wrapper with focal-point aware cropping |
| `components/landing/CityPreviewMap.tsx` | Create | Lazy-mounted small MapLibre instance |
| `public/media/landing/*.{webp,avif,mp4}` | Create | 12 ASSET-* files from `asset-prompts.md` |
| `tests/landing/*.test.tsx` | Create | Snapshot the new section composition, assert no EN-only copy |

---

End of brief. The companion file `asset-prompts.md` lists the 12 required media assets with generator-ready prompts, dimensions, and integration notes.

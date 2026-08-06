# OpenParking Design System

## 1. Atmosphere & Identity

OpenParking is a calm geospatial command surface: the map is always the primary
object, while controls feel like precise instruments placed above it. The
signature is **Atlas focus**: parking density begins as quiet blue clusters and
resolves into semantic points, curb lines, and zones as the user moves closer.
Surfaces use cool graphite, restrained translucency, and one consistent light
direction. Data quality is communicated before decoration.

Primary users are drivers comparing nearby options, contributors checking an
uncertain record, and reviewers inspecting conflicts. The design must remain
usable in bright outdoor light, one-handed mobile use, keyboard navigation,
200% zoom, slow-loading map states, and English or Russian copy.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Canvas | `--bg-primary` | `#f4f7fb` | `#070b13` | App and loading background |
| Surface | `--bg-secondary` | `#edf2f7` | `#0d1420` | Secondary regions |
| Panel | `--bg-card` | `rgba(255,255,255,.94)` | `rgba(15,23,34,.94)` | Sidebar, sheets, cards |
| Panel hover | `--bg-card-hover` | `#f2f6fb` | `#172233` | Interactive hover |
| Glass | `--bg-glass` | `rgba(255,255,255,.82)` | `rgba(10,17,28,.82)` | Floating map controls |
| Text primary | `--text-primary` | `#132033` | `#f4f7fb` | Headings and body |
| Text secondary | `--text-secondary` | `#52647a` | `#a8b6c8` | Supporting copy |
| Text muted | `--text-muted` | `#718197` | `#74849a` | Metadata and disabled text |
| Border subtle | `--border-subtle` | `rgba(61,83,110,.12)` | `rgba(159,177,199,.12)` | Internal separation |
| Border medium | `--border-medium` | `rgba(61,83,110,.22)` | `rgba(159,177,199,.22)` | Control outlines |
| Action / known price | `--accent-blue` | `#1769e0` | `#63a2ff` | Primary actions, priced parking |
| Free | `--accent-emerald` | `#087f63` | `#34d399` | Known free parking |
| Uncertain | `--accent-amber` | `#b75f09` | `#fbbf24` | Unknown amount, review |
| Conflict | `--accent-red` | `#c83b3b` | `#fb7185` | Conflicts and stale facts |
| Curb | `--accent-cyan` | `#087e9b` | `#22d3ee` | Route and curb emphasis |

Rules:

- Blue is reserved for actions, focus, selected state, and known priced data.
- Green means explicitly known free, never merely inexpensive.
- Amber means uncertainty or review, not decoration.
- Red means conflict, stale data, or destructive action.
- Regulatory zones must not look like verified parking offers.
- MapLibre paint values mirror these semantic roles even though WebGL styles
  cannot consume CSS custom properties directly.

## 3. Typography

### Scale

| Level | Size | Weight | Line height | Usage |
| --- | --- | --- | --- | --- |
| Display | `clamp(2.75rem, 6.4vw, 5.5rem)` | 800 | 0.98 | Landing statement |
| Display narrow | `clamp(1.875rem, 3.6vw, 2.75rem)` | 700 | 1.05 | Section eyebrow headings |
| H1 | `1.5rem` | 800 | 1.15 | Panel/product title |
| H2 | `1.125rem` | 750 | 1.25 | Sheet section title |
| H3 | `0.875rem` | 750 | 1.3 | Card title |
| Body | `0.875rem` | 500 | 1.5 | Controls and descriptions |
| Body small | `0.75rem` | 600 | 1.4 | Metadata |
| Caption | `0.6875rem` | 700 | 1.35 | Labels and hints |
| Overline | `0.625rem` | 800 | 1.2 | Step labels |

Font stack:

- Display (landing hero + section headlines): `Bricolage Grotesque`, `Manrope`,
  `Segoe UI`, sans-serif. Optical sizing + variable weight let the same
  family feel editorial in display and crisp in headings.
- Body / UI: `Manrope`, `Segoe UI`, sans-serif. Same as before for
  backwards compatibility on the map and detail panels.
- Data / mono: `JetBrains Mono`, `Fira Code`, monospace with tabular
  figures. Used for stats, source ids, and confidence numerics.
- Maximum two families in production rendering. Body text is never below
  11px; actionable text is never below 12px.

## 4. Spacing & Layout

The base unit is 4px. Existing spacing tokens are `--space-1` through
`--space-8` (4, 8, 12, 16, 20, 24, 32, 40px).

- Desktop shell: context panel `clamp(336px, 28vw, 392px)` plus fluid map.
- Desktop rail/panel is bounded to `100dvh`; the facility list owns vertical
  scroll. The document never scrolls.
- Map controls float inside safe insets and must not cover search, assistant,
  route, attribution, or selection sheets.
- Mobile at 900px and below: full map plus one draggable bottom sheet. The
  sheet owns content scroll and keeps a visible grab handle.
- Detail view: right sheet on desktop, bottom sheet on mobile.
- Chip rows may scroll horizontally on mobile; primary content must not create
  horizontal page scrolling.
- Touch targets are at least 44px where space permits and never below 36px for
  compact secondary controls.

## 5. Components

### Map shell

- **Structure**: bounded app grid, context panel, fluid MapLibre canvas.
- **States**: loading, partial-layer error, unsupported city, ready, route.
- **Accessibility**: map overlays remain keyboard reachable; status text uses
  `status` or `alert`; canvas controls have names and visible focus.
- **Motion**: map camera motion is meaningful and uses MapLibre easing.
- **Scroll owner**: context panel list on desktop; bottom-sheet body on mobile.

### Search command

- **Structure**: label, destination input, clear action, optional suggestions,
  category shortcuts.
- **States**: idle, focused, searching, results, empty, unavailable, error.
- **Accessibility**: combobox/listbox semantics and keyboard selection remain.
- **Motion**: suggestion panel uses opacity/transform only.

### Filter chip and segmented control

- **Variants**: default, selected, reliable, uncertain, conflict.
- **States**: default, hover, active, focus, disabled.
- **Accessibility**: `aria-pressed` for toggles; selected state never relies on
  color alone.
- **Motion**: 140ms state transition, no looping decoration.

### Facility card

- **Structure**: name/type, price, operator/location, trust/source/freshness.
- **States**: default, hover, focus, selected, unknown price, review, conflict.
- **Accessibility**: full card is one button with a complete accessible name.
- **Motion**: translate no more than 2px on hover; active returns to plane.

### Map cluster

- **Structure**: concentric circle plus abbreviated count.
- **Variants**: small, medium, dense based on point count.
- **States**: default, hover, focus through map keyboard navigation where
  MapLibre provides it.
- **Interaction**: click zooms to MapLibre expansion zoom. Clusters disappear
  after zoom 14; individual points retain semantic colors.
- **Accessibility**: cluster count is text, not color-only meaning.

### Detail sheet

- **Structure**: sticky header, trust/price summary, primary route action,
  progressive disclosures for terms, location, evidence, links, contribution.
- **States**: open, closing, route unavailable, links unavailable, submitting,
  success, error.
- **Accessibility**: dialog label, visible close control, logical focus order,
  no information hidden only behind hover.
- **Scroll owner**: detail body.

### Floating map controls

- **Structure**: compact basemap segmented control plus optional 3D toggle.
- **States**: default, selected, hover, focus, disabled while map initializes.
- **Motion**: controls do not animate layout; 3D camera easing communicates the
  view change.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | 120-160ms | `ease-out` | Press, hover, selected state |
| Standard | 180-260ms | `cubic-bezier(.2,.8,.2,1)` | Panels, disclosures |
| Map emphasis | 350-700ms | MapLibre easing | Cluster zoom, route, 3D |

- Animate only `transform`, `opacity`, and compositor-safe filter effects.
- Motion must explain a state change or spatial relationship.
- `prefers-reduced-motion` disables decorative movement and shortens panel
  transitions; map movement requested by the user remains functional.
- No perpetual glow, marquee, beam, or cursor-following effect in the task UI.

## 7. Depth & Surface

Strategy: **mixed, restrained**.

- Fixed context panels use tonal separation and one structural border.
- Floating controls use translucent tint, subtle backdrop blur, a rim border,
  and one cool-tinted shadow. Blur alone is not a material.
- Facility cards are separated primarily by tone and spacing; selected cards
  may add an accent border.
- Radius hierarchy: 8px controls, 12px cards, 16px sheets. Pills are reserved
  for compact statuses, segmented controls, and icon buttons.
- One light direction: highlights top-left, shadows down/right.

## 8. Accessibility Constraints & Accepted Debt

Constraints:

- Target WCAG 2.2 AA: 4.5:1 body text, 3:1 large text and controls.
- Every interactive element has a visible keyboard focus state.
- English and Russian copy must survive long-label stress without clipping.
- The shell must remain operable at 200% zoom and at 390x844.
- Unknown price, missing payment, low confidence, and regulatory zones are
  explicit text states, never inferred from color.
- Reduced motion, system color scheme, and browser text scaling are respected.

Accepted debt:

| Item | Location | Why accepted | Exit |
| --- | --- | --- | --- |
| Existing map/detail monoliths exceed preferred module size | `app/map/page.tsx`, `components/ParkingMap.tsx` | Structural extraction is separate from this visual iteration to avoid mixing behavior refactors with map changes | Extract by search, results, route, and detail responsibility before adding major new flows |
| Current dialog does not yet implement a focus trap | map detail sheet | Requires a dedicated accessible dialog primitive or focused behavior task | Resolve during component-system migration |
| Vanilla CSS remains the component system | `app/globals.css` | Adding Tailwind/shadcn now would create two competing styling stacks | Migrate only through a dedicated, tested design-system phase |

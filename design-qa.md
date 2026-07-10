**Source Visual Truth**

- `/Users/vladimirgrebennikov/Desktop/Снимок экрана 2026-07-10 в 08.19.32.png`

**Implementation Evidence**

- Screenshot: `/Users/vladimirgrebennikov/Code/OpenParking/artifacts/miami-curb-lines-after.png`
- Shared-axis screenshot: `/Users/vladimirgrebennikov/Code/OpenParking/artifacts/miami-curb-lines-shared-axis.png`
- Combined comparison: `/Users/vladimirgrebennikov/Code/OpenParking/artifacts/miami-curb-lines-comparison.png`
- Viewport: 1280 x 720
- State: Miami, South Beach, approximately 1st-8th Street, curb lines/zones/spaces visible.

**Full-View Comparison Evidence**

- The source showed adjacent curb segments changing direction noticeably along Washington Avenue.
- The implementation shows each curb segment as one two-point straight line, aligned with its nearby longitudinal street segment.
- Layer controls, map tiles, labels, points, zones, and the existing sidebar remain rendered without overlap introduced by this change.

**Focused Region Comparison Evidence**

- Washington Avenue and the east-west streets around 5th-8th Street were inspected at street zoom.
- Vertical curb segments remain straight and parallel to the avenue; horizontal segments remain straight and parallel to cross streets.
- No focused typography or asset comparison was needed because this change does not alter UI text, fonts, icons, imagery, spacing, colors, or controls.

**Findings**

- No remaining P0/P1/P2 geometry mismatch in the inspected South Beach region.
- Fonts/typography: unchanged.
- Spacing/layout rhythm: unchanged.
- Colors/tokens: unchanged; existing blue curb styling remains visible.
- Image/asset quality: unchanged; OSM raster/vector map rendering is clear at the inspected zoom.
- Copy/content: unchanged.

**Comparison History**

- P1 iteration 1: Generated curb rows could differ from road direction by up to 18 degrees and could select a crossing road near intersections.
- Fix iteration 1: Every generated row is reduced to two endpoints and rotated to the selected road-segment orientation. Road selection now scores midpoint distance plus angular difference.
- P1 iteration 2: Adjacent two-point lines could still form a visual curve because different OSM ways supplied slightly different angles and the source-point midpoints produced lateral steps.
- Fix iteration 2: Straight sections of the same named street now share one weighted street axis and one normalized curb-side offset. Real bends over 12 degrees retain local road geometry and all moved lines pass the existing building/parking-area checks again.
- Post-fix evidence: The audit checks 904 generated Miami curb candidates, accepts 159, and leaves 745 in field review. `Parking Spaces 10807` and its seven accepted Washington Avenue neighbors between 7th and 9th Street all use angle 78.92 degrees and the same side-axis. Browser rendering reports no console errors.
- P1 iteration 3: Long rows could still bridge a cross street or alley while remaining parallel to their matched street. `Parking Spaces 10863` crossed Alton Court along 8th Street, and long Alton Road rows covered more than one intersection interval.
- Fix iteration 3: Point rows now split at gaps over 18 meters. Final geometry QA suppresses any remaining line that intersects a road centerline at an angle over 30 degrees.
- Post-fix evidence: `Parking Spaces 10863` is no longer published as one 61-meter line. Valid pieces remain on either side as `10870`, `10867`, and `10865`; the former long Alton Road row is split into `7255` and `7260`. The audit checks 1,010 short candidates, accepts 177, and leaves 833 in review.
- P1 iteration 4: The partial OSM cache hid roads/buildings, and the first named-street implementation used an entire street-wide axis. On curved Collins Avenue this could move official parking evidence roughly 190 meters.
- Fix iteration 4: All 16 OSM tiles are now cached (`complete: true`, no failed tiles), named-street axes use only road geometry within 300 meters, and automatic alignment is capped at a 15-meter midpoint shift. Lines that still fail distance/intersection checks remain review-only or suppressed.
- Final evidence: The live Miami API publishes 897 two-point curb lines: 780 accepted and 117 review-only, with zero malformed geometries. The complete reference contains 7,122 road lines and 15,012 building polygons.

**Implementation Checklist**

- [x] Enforce exactly two coordinates for displayed Miami curb lines.
- [x] Align generated lines to road orientation before geometry QA.
- [x] Preserve building and parking-area intersection suppression.
- [x] Run tests, typecheck, production build, and browser visual QA.

final result: passed

# Implementation Plan: System Agent Files And Advanced Roadmap

**Branch**: `001-system-agent-roadmap` | **Date**: 2026-06-10 | **Spec**: `specs/001-system-agent-roadmap/spec.md`

**Input**: Feature specification from `specs/001-system-agent-roadmap/spec.md`

## Summary

Create a consistent set of agent-facing system files for ParkingUSA and add an advanced checkbox roadmap. `AGENTS.md` remains authoritative, companion files are thin tool-specific entry points, and `ROADMAP.md` becomes the working cross-phase delivery checklist. No application runtime behavior changes are included.

## Technical Context

**Language/Version**: Markdown documentation for a Next.js 15 / React 19 / TypeScript 5.7 project.

**Primary Dependencies**: Documentation only. Existing project dependencies include Next.js, React, MapLibre GL JS, Prisma, PostGIS direction, `osmtogeojson`, Vitest, Martin/Tippecanoe external paths.

**Storage**: Filesystem documentation. No database changes.

**Testing**: Markdown structure checks via repository search. `npm run build` is not required for documentation-only changes.

**Target Platform**: Windows development workspace at `C:\AI\ParkingUSA`, with cross-agent Markdown compatibility.

**Project Type**: Full-stack web/data platform documentation and planning feature.

**Performance Goals**: Not applicable to runtime. Documentation should provide fast onboarding and reduce agent ambiguity.

**Constraints**:

- Keep `AGENTS.md` authoritative.
- Do not modify `Referenss/`.
- Keep docs in English.
- Preserve reference-first and provenance-first rules.
- Avoid introducing implementation commitments that bypass `Referenss/`.

**Scale/Scope**: Root system files, Spec Kit constitution, one advanced roadmap, and one Spec Kit planning directory.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
| --- | --- | --- |
| Reference-first engineering | PASS | Roadmap and agent files explicitly require inspecting `Referenss/`. |
| Provenance is product behavior | PASS | Roadmap carries source, confidence, freshness, and geometry provenance checks. |
| API compatibility first | PASS | Roadmap preserves `/api/stats`, `/api/facilities`, and `/api/geojson/[layer]`. |
| Idempotent ingestion | PASS | Roadmap includes duplicate-import gates and SF baseline count checks. |
| Scalable map path | PASS | Roadmap includes Martin/Tippecanoe vector tile phases. |

Post-design re-check: PASS. The design artifacts are documentation-only and reinforce the constitution.

## Project Structure

### Documentation (this feature)

```text
specs/001-system-agent-roadmap/
+-- spec.md
+-- plan.md
+-- research.md
+-- data-model.md
+-- quickstart.md
+-- contracts/
    +-- agent-roadmap-contract.md
```

### Repository Documentation

```text
AGENTS.md
CODEX.md
CLAUDE.md
GEMINI.md
ROADMAP.md
README.md
ARCHITECTURE.md
REFERENCE_REPOS.md
THIRD_PARTY_NOTICES.md
.github/
+-- copilot-instructions.md
.cursor/
+-- rules/
    +-- parkingusa.mdc
.specify/
+-- memory/
    +-- constitution.md
```

**Structure Decision**: Keep `AGENTS.md` as the single authoritative instruction file. Add companion files only as compatibility entry points. Put detailed roadmap content in root `ROADMAP.md` and Spec Kit planning evidence in `specs/001-system-agent-roadmap/`.

## Phase 0: Research

See `specs/001-system-agent-roadmap/research.md`.

## Phase 1: Design And Contracts

Design artifacts:

- `specs/001-system-agent-roadmap/data-model.md`
- `specs/001-system-agent-roadmap/contracts/agent-roadmap-contract.md`
- `specs/001-system-agent-roadmap/quickstart.md`

Agent context update:

- `AGENTS.md` points to `ROADMAP.md` and `specs/001-system-agent-roadmap/plan.md` between the Spec Kit markers.

## Complexity Tracking

No constitution violations. No runtime complexity added.

# Feature Specification: System Agent Files And Advanced Roadmap

**Feature Branch**: `001-system-agent-roadmap`  
**Created**: 2026-06-10  
**Status**: Draft  
**Input**: User request: "Make the system files you use, like AGENTS.md. Use speckit-plan to make an advanced roadmap with checkboxes."

## User Scenarios

### Scenario 1 - Agent Context Is Discoverable

An AI coding agent opens the repository and can quickly find project rules, reference-first constraints, validation commands, and the current roadmap without needing prior conversation context.

### Scenario 2 - Tool-Specific Agent Files Are Compatible

Codex, Claude, Gemini, Copilot, and Cursor-style agents can each find an entry file that points back to the authoritative project instructions.

### Scenario 3 - Roadmap Is Actionable

The project owner can use the roadmap as a checklist for planning, implementation, and verification across backend, ingestion, OSM, vector tiles, research, frontend, multi-city expansion, and operations.

## Requirements

- **FR-001**: `AGENTS.md` must remain the authoritative project instruction file.
- **FR-002**: Companion agent files must point back to `AGENTS.md` rather than diverging.
- **FR-003**: The roadmap must use checkboxes and define phase-level gates.
- **FR-004**: The roadmap must preserve ParkingUSA reference-first and provenance requirements.
- **FR-005**: Spec Kit plan artifacts must exist under `specs/001-system-agent-roadmap/`.
- **FR-006**: The current agent context in `AGENTS.md` must point to the active plan/roadmap.
- **FR-007**: Documentation must be in English and use technical wording.

## Non-Goals

- No application runtime code changes.
- No database schema or migration changes.
- No import behavior changes.
- No frontend UI changes.

## Acceptance Criteria

- [ ] Root agent files exist for the requested tool families.
- [ ] `ROADMAP.md` exists and contains advanced checkbox phases.
- [ ] `specs/001-system-agent-roadmap/plan.md` is filled in.
- [ ] Spec Kit Phase 0/1 artifacts exist where useful.
- [ ] `AGENTS.md` links to the active roadmap/plan.
- [ ] Markdown files contain no unresolved template placeholders.

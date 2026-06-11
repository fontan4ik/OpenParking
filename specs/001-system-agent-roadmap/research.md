# Research: System Agent Files And Advanced Roadmap

## Decision: Keep `AGENTS.md` Authoritative

**Rationale**: `AGENTS.md` is already the project-level instruction file and is explicitly recognized in the current workspace context. Companion files should reduce tool friction without creating competing policies.

**Alternatives considered**:

- Duplicate full instructions in every agent file: rejected because it creates drift.
- Replace `AGENTS.md` with tool-specific files: rejected because `AGENTS.md` is the shared cross-agent source of truth.

## Decision: Add Tool-Specific Thin Entry Points

**Rationale**: Different AI tools discover different filenames. Thin files for Codex, Claude, Gemini, Copilot, and Cursor improve compatibility while pointing back to `AGENTS.md`.

**Alternatives considered**:

- Root-only `AGENTS.md`: simpler, but less discoverable for tool-specific agents.
- Large tool-specific playbooks: rejected because `AGENTS.md` should remain authoritative.

## Decision: Root `ROADMAP.md` Plus Spec Kit Plan

**Rationale**: The user requested an advanced roadmap with checkboxes. A root `ROADMAP.md` is easy to use day to day, while `specs/001-system-agent-roadmap/plan.md` preserves Spec Kit planning structure and traceability.

**Alternatives considered**:

- Put roadmap only in `specs/`: rejected because it is less visible.
- Put roadmap only in `README.md`: rejected because it would make the README too long and less focused.

## Decision: Replace Placeholder Constitution

**Rationale**: `speckit-plan` loads `.specify/memory/constitution.md`. Leaving placeholder principles would weaken future planning gates. A ParkingUSA-specific constitution makes future plans enforce reuse-first, provenance, API compatibility, idempotency, and scalable map constraints.

**Alternatives considered**:

- Leave template in place: rejected because it contains unresolved placeholders.
- Move constitution into `AGENTS.md`: rejected because Spec Kit expects the `.specify` constitution path.

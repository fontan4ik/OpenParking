# Data Model: System Agent Files And Advanced Roadmap

This feature is documentation-only. The model below describes documentation artifacts, not database tables.

## Entity: AgentInstructionFile

Fields:

- `path`: repository-relative path.
- `audience`: target tool or agent family.
- `authority`: whether the file is authoritative or a companion entry point.
- `must_reference`: required upstream instruction file.
- `core_rules`: reusable rules the file must contain or reference.

Validation rules:

- Companion files must point to `AGENTS.md`.
- Companion files must not redefine conflicting policy.
- Files must be in English.

## Entity: RoadmapPhase

Fields:

- `phase_id`: ordered phase label.
- `title`: phase name.
- `status_items`: checkbox tasks.
- `gate_checks`: commands or manual verification steps.
- `definition_of_done`: phase acceptance notes.

Validation rules:

- Each major product layer must have actionable checklist items.
- Runtime-related phases must include verification gates.
- Ingestion phases must include provenance and idempotency checks.

## Entity: SpecKitPlanArtifact

Fields:

- `spec_path`
- `plan_path`
- `research_path`
- `data_model_path`
- `quickstart_path`
- `contracts_path`

Validation rules:

- Plan artifacts must not contain unresolved template placeholders.
- `AGENTS.md` must point to the active plan or roadmap between Spec Kit markers.

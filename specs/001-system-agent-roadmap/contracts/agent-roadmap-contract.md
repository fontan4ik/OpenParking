# Contract: Agent System Files And Roadmap

## Agent File Contract

Every companion agent file must:

- be Markdown or tool-native Markdown config;
- state that `AGENTS.md` is authoritative;
- include the reference-first rule;
- include the provenance/data quality rule;
- include relevant validation commands;
- avoid conflicting instructions.

Required companion files:

- `CODEX.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/parkingusa.mdc`

## Roadmap Contract

`ROADMAP.md` must:

- use Markdown checkboxes;
- include status legend;
- cover documentation, backend, ingestion, OSM, vector tiles, research, frontend, multi-city expansion, heuristics, and operations;
- include gate checks for implementation phases;
- preserve San Francisco baseline counts;
- keep MapLibre, PostGIS/Prisma, Martin, Tippecanoe, `osmtogeojson`, `osm2pgsql`, and `osm-tag-updater` direction.

## Spec Kit Contract

`specs/001-system-agent-roadmap/plan.md` must:

- identify the branch as `001-system-agent-roadmap`;
- contain a filled Technical Context section;
- include Constitution Check results;
- list generated artifacts;
- link the design artifacts by path.

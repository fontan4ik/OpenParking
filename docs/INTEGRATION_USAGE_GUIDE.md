# ParkingUSA Integration Usage Guide

This guide shows how to use the installed Codex, oh-my-codex, Spec Kit, Tavily, and researcher tooling for ParkingUSA.

## 1. Daily Project Commands

Always start from the project root:

```powershell
cd C:\AI\ParkingUSA
```

Run the app:

```powershell
npm run dev
```

Build before considering app changes done:

```powershell
npm run build
```

Check the installed agent/tooling health:

```powershell
omx doctor
specify check
codex mcp list
```

## 2. Codex Research Runner

Use this when you want ParkingUSA source discovery, dataset evaluation, city parking research, or ingestion notes.

Basic shape:

```powershell
npm run research:codex -- "<research task>"
```

Example:

```powershell
npm run research:codex -- "Find official parking meter, curb regulation, garage, and lot datasets for Boston, MA. Prefer city/state/open-data sources. Return URLs, formats, freshness, license hints, and how each maps to ParkingUSA DataSource and SourceObservation records."
```

The output is saved into:

```text
C:\AI\ParkingUSA\data\research\codex-research-YYYYMMDD-HHmmss.md
```

Good prompt structure:

```text
Find [official data type] for [city/state].
Prefer [official portals/APIs].
Return:
- direct source URLs
- data format/API type
- update frequency or data_as_of
- license/terms notes
- suggested DataSource fields
- suggested SourceObservation fields
- confidence/freshness risks
```

Strong ParkingUSA examples:

```powershell
npm run research:codex -- "Research official curb regulation and parking meter sources for Seattle, WA. Include Socrata/ArcGIS/CKAN/API endpoints if present, not just landing pages."
```

```powershell
npm run research:codex -- "Compare NYC, Boston, Chicago, Seattle, and San Francisco parking data availability. Rank cities by readiness for ParkingUSA ingestion and explain required import workers."
```

```powershell
npm run research:codex -- "Find official documentation for San Francisco parking meter fields in the SFGov dataset 8vzz-qzz9. Explain which fields map to facility id, price/rate, schedule/rules, geometry, data_as_of, and raw_properties."
```

Use this runner instead of setting `OPENAI_API_KEY`. It uses Codex auth/runtime. Tavily is connected through the copied opencode key and Codex MCP config.

## 3. Spec Kit Workflow

Use Spec Kit when a feature needs a structured spec before implementation.

Recommended command flow:

```powershell
specify
```

Then ask Codex to use the local Spec Kit skills. Good command style:

```text
Use speckit-specify for ParkingUSA: define a feature to ingest official city parking meter datasets into PostGIS while preserving source_name, source_id, raw_properties, confidence, last_verified_at, and data_as_of.
```

Next steps:

```text
Use speckit-plan for that ParkingUSA feature. Check Referenss/ first and prefer existing import patterns.
```

```text
Use speckit-tasks for that plan. Split tasks into schema, importer, idempotency, tests, and build verification.
```

```text
Use speckit-implement for the first task only. Keep /api/stats, /api/facilities, and /api/geojson/[layer] compatible.
```

Useful Spec Kit skills installed in this repo:

```text
speckit-specify
speckit-plan
speckit-tasks
speckit-implement
speckit-clarify
speckit-analyze
speckit-checklist
speckit-agent-context-update
```

## 4. oh-my-codex Commands

Use OMX for deeper analysis, review, and multi-step work.

Health check:

```powershell
omx doctor
```

Simple Codex execution through OMX:

```powershell
omx exec --skip-git-repo-check -C C:\AI\ParkingUSA "Analyze the current ParkingUSA data import scripts and list the highest-risk ingestion gaps."
```

Good prompt style for OMX:

```text
Analyze C:\AI\ParkingUSA. Focus on data ingestion and provenance. Read AGENTS.md first. Do not modify files. Return ranked findings with file references.
```

For code review:

```text
Run a code review of ParkingUSA import and normalization code. Prioritize duplicate imports, provenance loss, geometry issues, and tests.
```

For planning:

```text
Plan the next ParkingUSA milestone: PostGIS-backed official city source ingestion. Respect AGENTS.md and reuse Referenss before new code.
```

Note: on Windows, `omx doctor` may warn about the Explore Harness requiring POSIX shell wrappers. That warning is expected; the core OMX/Codex path is working.

## 5. Researcher Repositories

Installed under:

```text
C:\AI\ResearchTools\open_deep_research
C:\AI\ResearchTools\gpt-researcher
```

Current recommendation:

```text
Primary architecture reference: open_deep_research
Secondary report/UI/reference tool: gpt-researcher
Production entry point today: npm run research:codex
```

Why:

```text
ParkingUSA needs structured source discovery, provenance, confidence, freshness, and ingestion decisions. open_deep_research is a better architectural fit for a LangGraph-style worker. gpt-researcher is useful for report-like research, but it is less directly aligned with deterministic ingestion pipelines.
```

The Python repos have `TAVILY_API_KEY` configured in their `.env` files and `OPENAI_API_KEY` intentionally blank. Do not paste Codex OAuth/session tokens into `OPENAI_API_KEY`.

## 6. ParkingUSA Data/Import Commands

Existing scripts:

```powershell
npm run import:sf
npm run import:osm:sf
npm run import:osm:sf:db
npm run import:osm:pbf:dry-run
npm run normalize:street-parking
npm run normalize:street-parking:db
npm run derive:heuristics
npm run derive:heuristics:db
npm run tiles:dry-run
npm run tiles:build
npm run test:street-parking
```

Before changing import logic:

```text
Ask Codex/OMX to inspect Referenss/parking, Referenss/osm-tag-updater, Referenss/osmtogeojson, Referenss/osm2pgsql, Referenss/martin, and Referenss/tippecanoe for reusable patterns.
```

After changing import logic:

```powershell
npm run build
npm run test:street-parking
```

For data import changes, verify idempotency and keep the San Francisco baseline unless intentionally changing ingestion:

```text
33,511 meter facilities
2,889 curb segments
403 OSM zones
```

## 7. Best Prompt Templates

Research prompt:

```text
Research official parking data sources for [CITY, STATE].
Use official city/state/open-data/API sources first.
Return direct URLs, API endpoints, formats, update frequency, license/terms notes, field mapping, confidence, freshness, and suggested ParkingUSA DataSource/SourceObservation records.
```

Implementation prompt:

```text
Implement [FEATURE] in C:\AI\ParkingUSA.
Read AGENTS.md first.
Before writing new parsing/import logic, inspect Referenss/.
Preserve source_name, source_id, raw_properties, confidence, last_verified_at, and data_as_of.
Keep /api/stats, /api/facilities, and /api/geojson/[layer] compatible.
Run npm run build when done.
```

Review prompt:

```text
Review the ParkingUSA changes for ingestion correctness.
Prioritize duplicate imports, lost provenance, stale data_as_of, geometry quality, broken GeoJSON compatibility, and missing tests.
Give file/line findings first.
```

Spec prompt:

```text
Use Spec Kit to define a ParkingUSA feature for [FEATURE].
The spec must include data quality, provenance, idempotent import behavior, API compatibility, and tests.
```

## 8. Typical Workflow

For a new city:

```powershell
npm run research:codex -- "Find official parking meter, curb, garage, and lot data sources for Portland, OR. Include API endpoints, formats, freshness, and ingestion recommendations for ParkingUSA."
```

Then:

```text
Use speckit-specify to turn the Portland research note into a ParkingUSA ingestion feature spec.
```

Then:

```text
Use speckit-plan and speckit-tasks. Reuse Referenss before new code.
```

Then:

```text
Implement only the first ingestion task, keep existing APIs compatible, and run npm run build.
```

For an existing importer bug:

```text
Analyze C:\AI\ParkingUSA import scripts. Find why repeated import may create duplicates. Read AGENTS.md and relevant Referenss first. Do not edit until you identify the exact files and risk.
```

Then:

```text
Fix the duplicate import issue. Add or update a focused test. Run npm run build and the relevant import/test command.
```


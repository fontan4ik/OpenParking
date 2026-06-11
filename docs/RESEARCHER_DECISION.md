# ParkingUSA researcher decision

Date: 2026-06-09

## Verdict

Use `langchain-ai/open_deep_research` as the primary research engine for ParkingUSA.

Keep `assafelovic/gpt-researcher` installed as a secondary report/UI/reference tool, but do not make it the core enrichment engine.

The reason is simple: ParkingUSA needs a source-discovery and evidence-extraction worker, not mainly a polished report writer. The winning path is a LangGraph/MCP pipeline that can be constrained to city portals, ArcGIS/Socrata/CKAN APIs, PDFs, operator pages, and internal database tools, then return structured facts with provenance, confidence, and freshness.

## Local install status

Installed/cloned tools:

- `C:\AI\ResearchTools\oh-my-codex`
- `C:\AI\ResearchTools\spec-kit`
- `C:\AI\ResearchTools\open_deep_research`
- `C:\AI\ResearchTools\gpt-researcher`

Global CLIs:

- `oh-my-codex@0.18.11`
- `specify-cli@0.10.0`

Verified Python environments:

- `C:\AI\ResearchTools\open_deep_research\.venv` imports `open_deep_research.deep_researcher`, `mcp`, and `langchain_mcp_adapters`.
- `C:\AI\ResearchTools\gpt-researcher\.venv` imports `GPTResearcher`, `mcp`, and `langchain_mcp_adapters`.

## API key policy

`OPENAI_API_KEY` is intentionally left blank in the researcher `.env` files. ParkingUSA should not copy Codex OAuth/session tokens out of `C:\Users\jilig\.codex\auth.json` and pretend they are OpenAI SDK API keys.

For Codex-backed research, use the local Codex CLI runner:

```powershell
npm run research:codex -- "Find official parking meter and curb regulation data sources for Boston, MA"
```

This path uses the authenticated Codex runtime instead of the OpenAI SDK. Tavily is connected separately:

- Tavily API key was copied from the active opencode Tavily MCP config into:
  - `C:\AI\ResearchTools\open_deep_research\.env`
  - `C:\AI\ResearchTools\gpt-researcher\.env`
- Tavily MCP was also added to Codex as `tavily-search`.

## Comparison

| Criterion | open_deep_research | gpt-researcher |
|---|---|---|
| Best fit | Custom research graph / MCP worker | Ready-made reports, UI, exports |
| Architecture | LangGraph supervisor/researcher graph with explicit tools | GPTResearcher class, FastAPI app, frontend, report pipeline |
| License | MIT | Apache-2.0 |
| Local status | Installed cleanly after increasing `UV_HTTP_TIMEOUT` | Installed after retry and editable install; dependency tree is heavier |
| MCP path | First-class in current implementation | Supported, but took extra dependency repair on Windows |
| Search path | Tavily, OpenAI/Anthropic native web search, MCP tools | Tavily and many retrievers, local docs, MCP, browser scraping |
| Output bias | Research findings and final report | Human-readable report product |
| ParkingUSA risk | Needs wrapper work for structured JSON persistence | More dependencies and product surface than needed |

## Why open_deep_research wins for ParkingUSA

ParkingUSA already has the data model that matters:

- `DataSource`
- `SourceObservation`
- `ParkingFacility`
- `CurbSegment`
- `ParkingZone`
- `confidence`
- `lastVerifiedAt`
- `dataAsOf`
- `rawProperties`

So the missing piece is not a generic "deep report". The missing piece is a repeatable worker that can answer tasks like:

- find official parking datasets for a city;
- determine whether a source is Socrata, ArcGIS REST, CKAN, PDF, HTML, or operator page;
- extract dataset URLs, update cadence, license, fields, and API endpoints;
- classify whether the source contains meters, curb rules, zones, garages, lots, occupancy, or rates;
- emit normalized `SourceObservation` records;
- queue deterministic ETL scripts for sources that should not be handled by LLMs.

`open_deep_research` is a smaller and cleaner base for that because its LangGraph structure makes the research loop explicit: clarification, research brief, supervisor, researcher tools, compression, final output. For ParkingUSA, replace "final report" as the primary artifact with a structured `parking_research_findings.json` payload and keep markdown only as an audit log.

## Where GPT Researcher still helps

Use GPT Researcher for:

- one-off competitive/market reports;
- operator landscape summaries;
- document-folder research over local PDFs/CSV/Excel/Word;
- quick demo UI for non-technical review;
- reference implementation for report exports and frontend patterns.

Do not use it as the first production worker because it brings a much bigger dependency tree, UI/server concerns, and report-oriented assumptions. It is still useful, just not the narrowest core for ParkingUSA.

## Recommended alternatives

1. Custom LangGraph worker based on `open_deep_research`.
   This is the best option. Use Open Deep Research as reference/runtime, but build ParkingUSA-specific nodes and output schemas.

2. CrewAI / AutoGen style multi-agent teams.
   Useful for experiments, but less attractive than LangGraph here because ParkingUSA needs deterministic tool routing, auditability, and structured persistence.

3. Pure deterministic source crawler plus LLM extraction.
   This should be part of the production system. Use deterministic connectors first for Socrata/ArcGIS/CKAN/OSM/operator known APIs, then call LLM only for source discovery, PDF/rule parsing, and ambiguous pages.

## First production design

Create a `researcher-service` outside the Next.js runtime:

```text
ParkingUSA app
  -> Research task queue
  -> Python LangGraph researcher worker
  -> city/source discovery tools
  -> structured findings JSON
  -> Prisma ingestion into DataSource + SourceObservation
```

Suggested task types:

- `discover_city_sources`
- `classify_source`
- `extract_dataset_metadata`
- `extract_parking_rules`
- `extract_operator_facility_info`
- `verify_conflicting_fact`

Suggested output schema:

```json
{
  "city": "Seattle",
  "state": "WA",
  "sources": [
    {
      "source_name": "Seattle Paid Parking Occupancy Last 30 Days",
      "source_type": "city_open_data",
      "portal_type": "socrata",
      "source_url": "https://data.seattle.gov/...",
      "api_url": "https://data.seattle.gov/resource/....json",
      "parking_layers": ["occupancy", "rates", "blockface"],
      "license": "unknown",
      "update_cadence": "weekly",
      "confidence": 0.86,
      "evidence": [
        {
          "url": "https://data.seattle.gov/...",
          "claim": "Dataset contains paid parking occupancy observations."
        }
      ],
      "recommended_connector": "socrata"
    }
  ]
}
```

## Next implementation steps

1. Add `research_tasks` / `research_findings` tables or use `SourceObservation` first.
2. Create `C:\AI\ParkingUSA\services\researcher` or `C:\AI\ParkingUSA\researcher-service`.
3. Vendor only a thin wrapper, not the whole Open Deep Research codebase, unless deeper customization demands it.
4. Add MCP tools for ParkingUSA:
   - Prisma read/write tool for `DataSource` and `SourceObservation`;
   - Socrata metadata/search tool;
   - ArcGIS REST layer inspector;
   - URL/PDF fetcher with content hashing;
   - source scoring tool.
5. Run the first benchmark on San Francisco, NYC, Seattle, LA, Chicago:
   - precision of source classification;
   - number of useful official sources found;
   - correctness of API endpoint extraction;
   - cost per city;
   - percent of findings persisted with evidence URLs.

## Sources reviewed

- `langchain-ai/open_deep_research`: https://github.com/langchain-ai/open_deep_research
- `assafelovic/gpt-researcher`: https://github.com/assafelovic/gpt-researcher
- `github/spec-kit`: https://github.com/github/spec-kit
- `Yeachan-Heo/oh-my-codex`: https://github.com/Yeachan-Heo/oh-my-codex
- Local ParkingUSA schema and plans:
  - `apps/backend/prisma/schema.prisma`
  - `parking_data_collection_plan.md`
  - `parking_full_data_strategy.md`
  - `ARCHITECTURE.md`

# Quickstart: Validate System Agent Files And Roadmap

Run these checks from the repository root:

```powershell
cd C:\AI\ParkingUSA
```

## Check Agent Files Exist

```powershell
Test-Path AGENTS.md
Test-Path CODEX.md
Test-Path CLAUDE.md
Test-Path GEMINI.md
Test-Path .github\copilot-instructions.md
Test-Path .cursor\rules\parkingusa.mdc
```

Expected result: all commands return `True`.

## Check Roadmap And Plan Exist

```powershell
Test-Path ROADMAP.md
Test-Path specs\001-system-agent-roadmap\spec.md
Test-Path specs\001-system-agent-roadmap\plan.md
Test-Path specs\001-system-agent-roadmap\research.md
Test-Path specs\001-system-agent-roadmap\data-model.md
Test-Path specs\001-system-agent-roadmap\quickstart.md
Test-Path specs\001-system-agent-roadmap\contracts\agent-roadmap-contract.md
```

Expected result: all commands return `True`.

## Check For Unresolved Template Placeholders

```powershell
$terms = @('NEEDS' + ' CLARIFICATION', 'ACTION' + ' REQUIRED', 'REMOVE' + ' IF UNUSED')
$files = @('AGENTS.md','CODEX.md','CLAUDE.md','GEMINI.md','ROADMAP.md','.specify\memory\constitution.md','specs\001-system-agent-roadmap\plan.md','specs\001-system-agent-roadmap\spec.md')
$terms | ForEach-Object { rg --fixed-strings $_ $files }
```

Expected result: no matches.

## Check Spec Kit Marker In AGENTS.md

```powershell
rg "ROADMAP.md|specs/001-system-agent-roadmap/plan.md" AGENTS.md
```

Expected result: both paths are present.

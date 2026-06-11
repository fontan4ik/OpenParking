param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string] $Prompt,

  [string] $OutFile = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not $OutFile) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $outDir = Join-Path $ProjectRoot "data\research"
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $OutFile = Join-Path $outDir "codex-research-$stamp.md"
}

$researchPrompt = @"
You are running as ParkingUSA's Codex-backed research worker.

Use Codex auth/runtime, not OPENAI_API_KEY. If web/search tools are available,
prefer Tavily MCP for discovery. Produce a concise but evidence-heavy markdown
research note with:

1. Findings
2. Source URLs
3. ParkingUSA ingestion relevance
4. Suggested DataSource / SourceObservation records
5. Confidence and freshness notes

Task:
$Prompt
"@

$result = @(codex exec --skip-git-repo-check -C $ProjectRoot $researchPrompt)
$firstMarkdownLine = -1
for ($i = 0; $i -lt $result.Count; $i++) {
  if ($result[$i] -match '^\s*#{1,6}\s+') {
    $firstMarkdownLine = $i
    break
  }
}

if ($firstMarkdownLine -ge 0) {
  $result = $result[$firstMarkdownLine..($result.Count - 1)]
}

$result | Set-Content -LiteralPath $OutFile -Encoding UTF8
Write-Output $OutFile

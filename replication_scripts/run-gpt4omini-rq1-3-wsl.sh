param(
  [string]$RunName = "gpt4omini_run1",
  [int]$Limit = 0,
  [int]$TimeLimitSeconds = 18000,
  [string]$Temperatures = "0.0",
  [int]$NumCompletions = 5,
  [string]$Snippets = "doc",
  [string]$NumSnippets = "all",
  [int]$SnippetLength = 20
)

$ErrorActionPreference = "Stop"

function Assert-CommandExists([string]$cmd) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "Missing required command '$cmd' on PATH."
  }
}

# Check whether prerequisites are met
Assert-CommandExists git
Assert-CommandExists node
Assert-CommandExists npm

# Find out the testpilot
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BenchmarksFile = Join-Path $RepoRoot "testpilot\.github\benchmarks.txt"
$TestpilotDir = Join-Path $RepoRoot "testpilot"
$Runner = Join-Path $TestpilotDir "benchmark\run.js"

if (-not (Test-Path $BenchmarksFile)) { throw "Not found: $BenchmarksFile" }
if (-not (Test-Path $Runner)) { throw "Not found: $Runner (did you run 'npm run build' in testpilot?)" }

$PackagesDir = Join-Path $RepoRoot "outputs\packages"
$RunsDir = Join-Path $RepoRoot ("outputs\runs\" + $RunName)

New-Item -ItemType Directory -Force -Path $PackagesDir | Out-Null
New-Item -ItemType Directory -Force -Path $RunsDir | Out-Null

$rawLines = Get-Content $BenchmarksFile
$entries = @()
foreach ($line in $rawLines) {
  $trim = $line.Trim()
  if ($trim -eq "" -or $trim.StartsWith("#")) { continue }
  $trim = ($trim -split "#", 2)[0].Trim()
  if ($trim -eq "") { continue }

  if ($trim -notmatch "/tree/") { throw "Unexpected benchmark line (missing /tree/): $trim" }
  $parts = $trim -split "/tree/", 2
  $repoUrl = $parts[0].TrimEnd("/")
  $rev = $parts[1].Trim()

  $repoName = [System.IO.Path]::GetFileName($repoUrl)
  if ($repoName -match "^node-(.+)$") { $repoName = $Matches[1] }

  $entries += [pscustomobject]@{
    RepoUrl = $repoUrl
    Rev = $rev
    Name = $repoName
  }
}

if ($Limit -gt 0) { $entries = $entries | Select-Object -First $Limit }

Write-Host ("Will run {0} package(s). Output -> {1}" -f $entries.Count, $RunsDir)

foreach ($e in $entries) {
  $pkgDir = Join-Path $PackagesDir $e.Name
  $outDir = Join-Path $RunsDir $e.Name

  if (-not (Test-Path $pkgDir)) {
    Write-Host ("Cloning {0} -> {1}" -f $e.RepoUrl, $pkgDir)
    git clone $e.RepoUrl $pkgDir | Out-Null
  }

  Push-Location $pkgDir
  try {
    git fetch --all --tags --prune | Out-Null
    git checkout --force $e.Rev | Out-Null

    if (-not (Test-Path (Join-Path $pkgDir "node_modules"))) {
      Write-Host ("Installing deps for {0}" -f $e.Name)
      npm install | Out-Null
    }
  } finally {
    Pop-Location
  }

  New-Item -ItemType Directory -Force -Path $outDir | Out-Null

  Write-Host ("Running TestPilot for {0} ({1})" -f $e.Name, $e.Rev)
  Push-Location $TestpilotDir
  try {
    node $Runner `
      --outputDir $outDir `
      --package $pkgDir `
      --snippets $Snippets `
      --numSnippets $NumSnippets `
      --snippetLength $SnippetLength `
      --temperatures $Temperatures `
      --numCompletions $NumCompletions `
      --model gpt `
      --timeLimit $TimeLimitSeconds
  } finally {
    Pop-Location
  }
}

Write-Host "Done."


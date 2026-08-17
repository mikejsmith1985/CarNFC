# Launches a clean-slate dev server for UX tests: clears build output, resets the database to seed state, and starts Next.js on a fixed port.
#
# Article V requires UX tests to run against this script, never against a built binary.
# Article II requires that any process termination target a specific PID — this script
# never uses a wildcard process match, because the agent itself may run inside a
# process whose name would match one.

param(
    # Generates the service worker in development. Off by default so a stale
    # worker never hides a code change; required for the offline UX specs,
    # which have nothing to serve the page from without it.
    [switch]$WithServiceWorker,

    [int]$Port = 3100,
    [switch]$SkipDatabaseReset
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot

Write-Host "ServiceCard :: clean dev launch" -ForegroundColor Cyan
Write-Host "Repository: $repositoryRoot"

# --- Stop whatever currently owns the port, by PID only ------------------------
# Get-NetTCPConnection gives us the exact owning process. We stop that one PID and
# nothing else. A name-based match such as "node*" could terminate unrelated work,
# including the session running this script.
$existingConnections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($connection in $existingConnections) {
    $owningProcessId = $connection.OwningProcess
    $owningProcess = Get-Process -Id $owningProcessId -ErrorAction SilentlyContinue
    if ($null -ne $owningProcess) {
        Write-Host "Stopping PID $owningProcessId ($($owningProcess.ProcessName)) holding port $Port" -ForegroundColor Yellow
        Stop-Process -Id $owningProcessId -Force -Confirm:$false
    }
}

# --- Clear build output --------------------------------------------------------
$buildOutputPath = Join-Path $repositoryRoot '.next'
if (Test-Path $buildOutputPath) {
    Write-Host "Removing stale build output at .next"
    Remove-Item -Recurse -Force $buildOutputPath -Confirm:$false
}

$generatedWorkerPath = Join-Path $repositoryRoot 'public\sw.js'
if (Test-Path $generatedWorkerPath) {
    Remove-Item -Force $generatedWorkerPath -Confirm:$false
}

# --- Reset the database to seed state -----------------------------------------
# UX tests assert against known fixture data. A database carrying leftovers from a
# previous run produces failures that look like regressions but are not.
if (-not $SkipDatabaseReset) {
    Write-Host "Resetting local Supabase database to seed state" -ForegroundColor Yellow
    Push-Location $repositoryRoot
    try {
        & npx --yes supabase@2.114.0 db reset --local
        if ($LASTEXITCODE -ne 0) {
            throw "Database reset failed with exit code $LASTEXITCODE. Is the local stack running? Try: npm run db:start"
        }
    }
    finally {
        Pop-Location
    }

    # UX specs assert against the worked example from the specification — the
    # Raptor at 112,450 miles with its bound tags. Resetting without reseeding
    # leaves them asserting against an empty database, and leaving stale data in
    # place lets one run's entries change the next run's arithmetic.
    Write-Host "Seeding demo fixtures" -ForegroundColor Yellow
    Push-Location $repositoryRoot
    try {
        & npx tsx --env-file=.env.local scripts/seed-demo.ts
        if ($LASTEXITCODE -ne 0) { throw "Demo seed failed with exit code $LASTEXITCODE." }
    }
    finally {
        Pop-Location
    }
}

# --- Start the dev server ------------------------------------------------------
Write-Host "Starting Next.js dev server on port $Port" -ForegroundColor Green
Push-Location $repositoryRoot
try {
    $env:PORT = "$Port"
    if ($WithServiceWorker) {
        Write-Host 'Service worker enabled for this run' -ForegroundColor Yellow
        $env:SERVICECARD_ENABLE_SW = '1'
    }

    & npx next dev --webpack --port $Port
}
finally {
    Pop-Location
}

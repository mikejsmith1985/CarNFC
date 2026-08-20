# Cuts a release locally: verifies, tags, and publishes with the GitHub CLI. Never GitHub Actions (Article VIII).
#
# Article VIII forbids pushing a tag and waiting for a runner. Everything is
# verified here, on this machine, before anything is published — so a broken
# release is caught before it exists rather than after.
#
# Article II: any process this script stops is targeted by PID. It never uses a
# wildcard process match.

param(
    [Parameter(Mandatory = $true)]
    [string]$Version,

    [switch]$SkipTests,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repositoryRoot

try {
    if ($Version -notmatch '^v\d+\.\d+\.\d+$') {
        throw "Version must look like v1.2.3 (got '$Version')."
    }

    Write-Host "ServiceCard release $Version" -ForegroundColor Cyan

    # --- refuse to release from a dirty tree ---------------------------------
    $pending = git status --porcelain
    if ($pending) {
        throw 'Working tree has uncommitted changes. Commit or stash before releasing.'
    }

    if (git rev-parse -q --verify "refs/tags/$Version" 2>$null) {
        throw "Tag $Version already exists."
    }

    # --- verify --------------------------------------------------------------
    if (-not $SkipTests) {
        Write-Host "`nType checking..." -ForegroundColor Yellow
        & npm run typecheck
        if ($LASTEXITCODE -ne 0) { throw 'Type check failed.' }

        Write-Host "`nLinting..." -ForegroundColor Yellow
        & npm run lint
        if ($LASTEXITCODE -ne 0) { throw 'Lint failed.' }

        Write-Host "`nChecking secret boundaries..." -ForegroundColor Yellow
        & npx tsx scripts/check-secret-boundaries.ts
        if ($LASTEXITCODE -ne 0) { throw 'Service-role key could reach a browser bundle.' }

        Write-Host "`nUnit tests..." -ForegroundColor Yellow
        & npm run test:unit
        if ($LASTEXITCODE -ne 0) { throw 'Unit tests failed.' }

        Write-Host "`nIntegration tests (real PostgreSQL)..." -ForegroundColor Yellow
        & npm run test:integration
        if ($LASTEXITCODE -ne 0) { throw 'Integration tests failed.' }
    }

    Write-Host "`nBuilding..." -ForegroundColor Yellow
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }

    # --- changelog -----------------------------------------------------------
    # Article VI makes CHANGELOG.md the single source of truth for what changed,
    # so a release with nothing recorded is a release nobody can review.
    $changelogPath = Join-Path $repositoryRoot 'CHANGELOG.md'
    if (-not (Select-String -Path $changelogPath -Pattern '## \[Unreleased\]' -Quiet)) {
        throw 'CHANGELOG.md has no [Unreleased] section to promote.'
    }

    if ($DryRun) {
        Write-Host "`nDry run: verified, nothing tagged or published." -ForegroundColor Green
        return
    }

    # --- tag and publish -----------------------------------------------------
    Write-Host "`nTagging $Version..." -ForegroundColor Yellow
    & git tag -a $Version -m "ServiceCard $Version"
    if ($LASTEXITCODE -ne 0) { throw 'git tag failed.' }

    # The tag has to reach the remote before the release is created. GitHub
    # refuses to publish a release for a tag it cannot see, and asking it to
    # create the tag instead means guessing a target commit — which is how this
    # step failed the first time it was used for real.
    Write-Host "Pushing the tag..." -ForegroundColor Yellow
    & git push origin $Version
    if ($LASTEXITCODE -ne 0) {
        & git tag -d $Version
        throw 'Pushing the tag failed. Local tag removed.'
    }

    Write-Host "Publishing with gh..." -ForegroundColor Yellow
    & gh release create $Version --title "ServiceCard $Version" --notes-file $changelogPath
    if ($LASTEXITCODE -ne 0) {
        # Leave nothing half-done: a tag with no release reads as a shipped
        # version that cannot be downloaded.
        & git push origin --delete $Version
        & git tag -d $Version
        throw 'gh release create failed. Tag removed locally and on the remote.'
    }

    Write-Host "`nReleased $Version." -ForegroundColor Green
}
finally {
    Pop-Location
}

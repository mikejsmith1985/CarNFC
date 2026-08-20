# Builds the Cloudflare Worker against the hosted project, never the local one.
#
# Next loads .env.local in every environment and it takes precedence over
# .env.production. On a developer machine that file points at the local Supabase
# stack, so a production build silently inlines the laptop's address: the
# deployed site comes up, signs people in, and writes to a database sitting on a
# desk behind a tunnel. Nothing fails, which is what makes it dangerous.
#
# This moves .env.local aside for the duration of the build and puts it back
# afterwards, including when the build throws.

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repositoryRoot

$localEnvPath = Join-Path $repositoryRoot '.env.local'
$parkedEnvPath = Join-Path $repositoryRoot '.env.local.parked'
$wasParked = $false

try {
    if (-not (Test-Path '.env.production')) {
        throw '.env.production is missing. It carries the hosted project''s address and keys.'
    }

    # Refuse to build against a tunnel or a local host, whatever the file says.
    $productionUrl = (Select-String -Path '.env.production' -Pattern '^NEXT_PUBLIC_SUPABASE_URL=(.+)$').Matches.Groups[1].Value
    if ($productionUrl -match 'localhost|127\.0\.0\.1|trycloudflare') {
        throw "NEXT_PUBLIC_SUPABASE_URL in .env.production points at $productionUrl, which is not a hosted project."
    }

    if (Test-Path $localEnvPath) {
        Write-Host 'Parking .env.local so it cannot override the production values' -ForegroundColor Yellow
        Move-Item -Path $localEnvPath -Destination $parkedEnvPath -Force
        $wasParked = $true
    }

    Write-Host "Building against $productionUrl" -ForegroundColor Green
    $env:OPEN_NEXT_BUILD = '1'
    & npx opennextjs-cloudflare build
    if ($LASTEXITCODE -ne 0) { throw 'OpenNext build failed.' }

    Write-Host 'Build complete.' -ForegroundColor Green
}
finally {
    if ($wasParked) {
        Move-Item -Path $parkedEnvPath -Destination $localEnvPath -Force
        Write-Host 'Restored .env.local' -ForegroundColor Yellow
    }
    Pop-Location
}

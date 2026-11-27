# MECHASSET first-time setup for Windows PowerShell
# Run from the repository root:
#   powershell -ExecutionPolicy Bypass -File .\setup-mechasset.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkerDir = Join-Path $RepoRoot "worker"
$ConfigPath = Join-Path $WorkerDir "wrangler.toml"
$MigrationDir = Join-Path $WorkerDir "migrations"

function Invoke-Wrangler {
    param([string[]]$Arguments)
    Push-Location $WorkerDir
    try {
        & npx wrangler @Arguments
        if ($LASTEXITCODE -ne 0) { throw "Wrangler command failed: npx wrangler $($Arguments -join ' ')" }
    }
    finally { Pop-Location }
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host " MECHASSET - First-time setup" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "This creates a NEW D1 database in your Cloudflare account."
Write-Host "It does not use the repository owner's database or API key."
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required. Install the current Node.js LTS version, then run this script again."
}
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "npm/npx was not found. Reinstall Node.js LTS with npm enabled."
}
if (-not (Test-Path $ConfigPath)) { throw "Cannot find worker/wrangler.toml." }
if (-not (Test-Path $MigrationDir)) { throw "Cannot find worker/migrations." }

$databaseName = Read-Host "D1 database name [mechasset-db]"
if ([string]::IsNullOrWhiteSpace($databaseName)) { $databaseName = "mechasset-db" }
$workerName = Read-Host "Worker name [asset-register-extractor]"
if ([string]::IsNullOrWhiteSpace($workerName)) { $workerName = "asset-register-extractor" }

Write-Host ""
Write-Host "[1/6] Sign in to your Cloudflare account..." -ForegroundColor Yellow
Invoke-Wrangler -Arguments @("login")

Write-Host ""
Write-Host "[2/6] Creating your own D1 database..." -ForegroundColor Yellow
Push-Location $WorkerDir
try {
    $createOutput = & npx wrangler d1 create $databaseName 2>&1
    $createExit = $LASTEXITCODE
    $createText = ($createOutput | Out-String)
    Write-Host $createText
    if ($createExit -ne 0) { throw "Could not create D1 database. Check whether a database with this name already exists in your Cloudflare account." }
}
finally { Pop-Location }

$idMatch = [regex]::Match($createText, 'database_id\s*=\s*"([0-9a-fA-F-]{36})"')
if (-not $idMatch.Success) {
    $idMatch = [regex]::Match($createText, '"database_id"\s*:\s*"([0-9a-fA-F-]{36})"')
}
if (-not $idMatch.Success) {
    throw "The D1 database may have been created, but its ID could not be read automatically. Copy the database_id shown above and add it to worker/wrangler.toml, then continue with steps 3-6 in README.md."
}
$databaseId = $idMatch.Groups[1].Value

Write-Host ""
Write-Host "[3/6] Writing your D1 ID into worker/wrangler.toml..." -ForegroundColor Yellow
$config = Get-Content $ConfigPath -Raw
$config = [regex]::Replace($config, '(?m)^database_name\s*=\s*"[^"]*"\s*$', "database_name = `"$databaseName`"")
$config = [regex]::Replace($config, '(?m)^database_id\s*=\s*"[^"]*"\s*$', "database_id = `"$databaseId`"")
$config = [regex]::Replace($config, '(?m)^name\s*=\s*"[^"]*"\s*$', "name = `"$workerName`"")
Set-Content -Path $ConfigPath -Value $config -Encoding utf8

Write-Host ""
Write-Host "[4/6] Applying ALL database migrations (PSV/BVV/PV)..." -ForegroundColor Yellow
Invoke-Wrangler -Arguments @("d1", "migrations", "apply", $databaseName, "--remote")

Write-Host ""
Write-Host "[5/6] Saving your Gemini API key as a Cloudflare secret..." -ForegroundColor Yellow
Write-Host "When prompted, paste your Gemini API key. It will not be written into this repository."
Invoke-Wrangler -Arguments @("secret", "put", "GEMINI_API_KEY")

Write-Host ""
Write-Host "[6/6] Deploying your Worker..." -ForegroundColor Yellow
Push-Location $WorkerDir
try {
    $deployOutput = & npx wrangler deploy 2>&1
    $deployExit = $LASTEXITCODE
    $deployText = ($deployOutput | Out-String)
    Write-Host $deployText
    if ($deployExit -ne 0) { throw "Worker deployment failed. Review the error above." }
}
finally { Pop-Location }

$workerUrlMatch = [regex]::Match($deployText, 'https://[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.workers\.dev')
Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host " MECHASSET BACKEND SETUP COMPLETED" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
if ($workerUrlMatch.Success) {
    Write-Host "Your Worker URL: $($workerUrlMatch.Value)" -ForegroundColor Green
    Write-Host "Save this URL; enter it on your MECHASSET website's connection screen."
} else {
    Write-Host "Worker deployed. Copy the workers.dev URL from the deployment output."
}
Write-Host ""
Write-Host "Next: enable GitHub Pages (GitHub > Settings > Pages > GitHub Actions),"
Write-Host "open your GitHub Pages website, and enter your Worker URL."
Write-Host "Keep your Gemini API key private. Never commit it to GitHub."

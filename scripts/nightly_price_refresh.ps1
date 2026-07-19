# Nightly price refresh and redeploy for Project V
# Schedule with Windows Task Scheduler to run nightly (e.g. 2 AM)
#
# To register the task, run once as Administrator:
#   schtasks /create /tn "ProjectV-PriceRefresh" /tr "pwsh -NonInteractive -File \"E:\Code\Project V\scripts\nightly_price_refresh.ps1\"" /sc daily /st 02:00 /ru SYSTEM /f
#
# To remove the task:
#   schtasks /delete /tn "ProjectV-PriceRefresh" /f

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

$LogFile = Join-Path $ProjectRoot "netlify\data\refresh.log"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Log($msg) {
  $line = "[$Timestamp] $msg"
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Set-Location $ProjectRoot
Log "=== Nightly price refresh started ==="

try {
  # Step 1: Fetch real prices from store websites (concurrency=50 for ~90 min runtime)
  Log "Step 1/4: Fetching live prices from stores..."
  node scripts/remediate_prices.cjs --concurrency 50 --timeout-ms 3000 --retries 1
  if ($LASTEXITCODE -ne 0) { throw "remediate:prices failed (exit $LASTEXITCODE)" }
  Log "Step 1/4: Done"

  # Step 2: Re-export snapshot (preserves enriched prices)
  Log "Step 2/4: Re-exporting snapshot..."
  python -m scripts.export_snapshot
  if ($LASTEXITCODE -ne 0) {
    python3 -m scripts.export_snapshot
    if ($LASTEXITCODE -ne 0) { throw "export:snapshot failed" }
  }
  Log "Step 2/4: Done"

  # Step 3: Rebuild stats, search bundle, and verify
  Log "Step 3/4: Rebuilding stats, search bundle, and verifying..."
  node scripts/rebuild_stats.cjs
  node scripts/build_search_bundle.cjs
  if ($LASTEXITCODE -ne 0) { throw "build_search_bundle failed (exit $LASTEXITCODE)" }
  node scripts/verify_record_integrity.cjs
  node scripts/verify_api_contract.cjs
  Log "Step 3/4: Done"

  # Step 4: Build + deploy to Netlify (two-step: draft upload + REST restore;
  # the one-shot `deploy --prod` returns 403 on this account).
  Log "Step 4/4: Building and deploying to Netlify..."
  npx tsc -b
  if ($LASTEXITCODE -ne 0) { throw "tsc build failed" }
  npx vite build
  if ($LASTEXITCODE -ne 0) { throw "vite build failed" }
  $env:DEPLOY_MESSAGE = "Nightly price refresh"
  node scripts/netlify_deploy_prod.cjs
  if ($LASTEXITCODE -ne 0) { throw "netlify deploy failed (exit $LASTEXITCODE)" }
  Log "Step 4/4: Done"

  Log "=== Refresh complete — site redeployed ==="

} catch {
  Log "ERROR: $_"
  exit 1
}

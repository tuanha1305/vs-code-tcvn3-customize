# Bootstrap uninstaller (Windows / PowerShell).
#
# One-liner:
#   irm https://raw.githubusercontent.com/OWNER/vs-code-tcvn3-customize/main/uninstall.ps1 | iex

[CmdletBinding()]
param(
    [switch]$Force,
    [string]$VsCode
)

$ErrorActionPreference = 'Stop'

if ($env:TCVN3_FORCE) { $Force = $true }
$repo   = if ($env:TCVN3_REPO)   { $env:TCVN3_REPO }   else { 'tuanha1305/vs-code-tcvn3-customize' }
$branch = if ($env:TCVN3_BRANCH) { $env:TCVN3_BRANCH } else { 'main' }
$base   = "https://raw.githubusercontent.com/$repo/$branch"

function Log  ($msg) { Write-Host ">>> $msg" -ForegroundColor Cyan }
function Warn ($msg) { Write-Host "WARN: $msg" -ForegroundColor Yellow }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is required." -ForegroundColor Red
    exit 1
}

$vsRunning = Get-Process -Name 'Code' -ErrorAction SilentlyContinue
if ($vsRunning -and -not $Force) {
    Warn "VS Code is running. Restoration may fail due to file locks."
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        $resp = Read-Host "Continue anyway? [y/N]"
        if ($resp -notmatch '^[yY]') { Write-Host "Aborted."; exit 0 }
    } else {
        Write-Host "Non-interactive. Quit VS Code or set `$env:TCVN3_FORCE=1."
        exit 1
    }
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("tcvn3u-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

try {
    Log "Downloading restore script..."
    Invoke-WebRequest -Uri "$base/scripts/restore.js" -OutFile (Join-Path $tmp 'restore.js') -UseBasicParsing -ErrorAction Stop

    $forwardArgs = @()
    if ($VsCode) { $forwardArgs += '--vscode'; $forwardArgs += $VsCode }

    Log "Restoring VS Code..."
    & node (Join-Path $tmp 'restore.js') @forwardArgs
    if ($LASTEXITCODE -ne 0) { throw "restore.js failed (exit $LASTEXITCODE)" }
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

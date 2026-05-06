# Bootstrap installer for vs-code-tcvn3-customize (Windows / PowerShell).
#
# One-liner install:
#   irm https://raw.githubusercontent.com/OWNER/vs-code-tcvn3-customize/main/install.ps1 | iex
#
# With UI dropdown:
#   $env:TCVN3_WITH_UI=1; irm https://.../install.ps1 | iex
#
# With -Force (skip running-VS-Code prompt):
#   $env:TCVN3_FORCE=1; irm https://.../install.ps1 | iex
#
# Override repo (forks / branches):
#   $env:TCVN3_REPO='user/fork'; $env:TCVN3_BRANCH='dev'; irm https://.../install.ps1 | iex
#
# Note: when piped via `irm | iex`, parameters can't be passed positionally;
# use the env vars above.

[CmdletBinding()]
param(
    [switch]$WithUi,
    [switch]$Force,
    [string]$VsCode
)

$ErrorActionPreference = 'Stop'

# Pull settings from env vars when this script is piped to iex (no params).
if ($env:TCVN3_WITH_UI) { $WithUi = $true }
if ($env:TCVN3_FORCE)   { $Force  = $true }
$repo   = if ($env:TCVN3_REPO)   { $env:TCVN3_REPO }   else { 'tuanha1305/vs-code-tcvn3-customize' }
$branch = if ($env:TCVN3_BRANCH) { $env:TCVN3_BRANCH } else { 'main' }
$base   = "https://raw.githubusercontent.com/$repo/$branch"

function Log  ($msg) { Write-Host ">>> $msg" -ForegroundColor Cyan }
function Warn ($msg) { Write-Host "WARN: $msg" -ForegroundColor Yellow }

# ---- Prerequisites ---------------------------------------------------------

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is required." -ForegroundColor Red
    Write-Host "       Install from https://nodejs.org/ (any LTS version)." -ForegroundColor Red
    exit 1
}
Log "Node.js: $((& node --version).Trim())"
Log "Repo:    $repo  branch: $branch"

# ---- VS Code running check -------------------------------------------------

$vsRunning = Get-Process -Name 'Code' -ErrorAction SilentlyContinue
if ($vsRunning -and -not $Force) {
    Warn "VS Code is running ($($vsRunning.Count) processes)."
    Warn "Quit VS Code completely (incl. background Code.exe) before continuing."
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        $resp = Read-Host "Continue anyway? [y/N]"
        if ($resp -notmatch '^[yY]') {
            Write-Host "Aborted."
            exit 0
        }
    } else {
        Write-Host "Non-interactive session (likely piped via iex)."
        Write-Host "Quit VS Code and re-run, or set `$env:TCVN3_FORCE=1 first."
        exit 1
    }
}

# ---- Download artifacts ----------------------------------------------------

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("tcvn3-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'dist') | Out-Null

try {
    function Download ($url, $dest) {
        try {
            Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -ErrorAction Stop
        } catch {
            throw "Failed to download $url : $_"
        }
    }

    Log "Downloading patch artifacts..."
    Download "$base/dist/iconv-lite-umd.js"   (Join-Path $tmp 'dist\iconv-lite-umd.js')
    Download "$base/dist/search-patch.js"     (Join-Path $tmp 'dist\search-patch.js')
    Download "$base/dist/workbench-patch.js"  (Join-Path $tmp 'dist\workbench-patch.js')
    Download "$base/dist/version.json"        (Join-Path $tmp 'dist\version.json')
    Download "$base/scripts/apply.js"         (Join-Path $tmp 'apply.js')

    # ---- Apply -------------------------------------------------------------

    $forwardArgs = @('--dist', (Join-Path $tmp 'dist'))
    if ($WithUi) { $forwardArgs += '--with-ui' }
    if ($VsCode) { $forwardArgs += '--vscode'; $forwardArgs += $VsCode }

    Log "Patching VS Code..."
    & node (Join-Path $tmp 'apply.js') @forwardArgs
    if ($LASTEXITCODE -ne 0) { throw "apply.js failed (exit $LASTEXITCODE)" }
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

# Bootstrap uninstaller (Windows / PowerShell). Pure PowerShell - no Node.js.
#
# One-liner:
#   irm https://raw.githubusercontent.com/tuanha1305/vs-code-tcvn3-customize/main/uninstall.ps1 | iex

[CmdletBinding()]
param(
    [switch]$Force,
    [string]$VsCode
)

$ErrorActionPreference = 'Stop'

if ($env:TCVN3_FORCE)  { $Force  = $true }
if ($env:TCVN3_VSCODE) { $VsCode = $env:TCVN3_VSCODE }

function Log  ($msg) { Write-Host ">>> $msg" -ForegroundColor Cyan }
function Warn ($msg) { Write-Host "WARN: $msg" -ForegroundColor Yellow }

$vsRunning = Get-Process -Name 'Code' -ErrorAction SilentlyContinue
if ($vsRunning -and -not $Force) {
    Warn "VS Code is running. Restoration may fail due to file locks."
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        $resp = Read-Host "Continue anyway? [y/N]"
        if ($resp -notmatch '^[yY]') { Write-Host "Aborted."; exit 0 }
    } else {
        Write-Host "Non-interactive. Quit VS Code, or set `$env:TCVN3_FORCE=1."
        exit 1
    }
}

function Test-IsApp ($dir) {
    (Test-Path (Join-Path $dir 'package.json')) -and `
    (Test-Path (Join-Path $dir 'node_modules\@vscode\iconv-lite-umd'))
}
function Find-AppDirs ($root) {
    $found = @()
    if (-not (Test-Path $root)) { return $found }
    $direct = Join-Path $root 'resources\app'
    if (Test-IsApp $direct) { $found += $direct }
    if (Test-IsApp $root)   { $found += $root }
    Get-ChildItem -Path $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $cand = Join-Path $_.FullName 'resources\app'
        if (Test-IsApp $cand) { $found += $cand }
    }
    return $found
}

$candidates = if ($VsCode) { @($VsCode) } else {
    @(
        Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code'
        'C:\Program Files\Microsoft VS Code'
        'C:\Program Files (x86)\Microsoft VS Code'
        Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code Insiders'
    )
}
$appDirs = @()
foreach ($c in $candidates) {
    foreach ($d in (Find-AppDirs $c)) {
        if ($appDirs -notcontains $d) { $appDirs += $d }
    }
}
if ($appDirs.Count -eq 0) {
    Write-Host "ERROR: No VS Code installation found." -ForegroundColor Red
    exit 1
}

function Restore-File ($target, $backup) {
    if (-not (Test-Path $backup)) { return $false }
    Copy-Item $backup $target -Force
    Remove-Item $backup -Force
    return $true
}

foreach ($appDir in $appDirs) {
    Log "--- Restoring: $appDir ---"
    $iconvTarget = Join-Path $appDir 'node_modules\@vscode\iconv-lite-umd\lib\iconv-lite-umd.js'
    $iconvBackup = Join-Path $appDir 'node_modules\@vscode\iconv-lite-umd\lib\iconv-lite-umd.original.js'
    if (Restore-File $iconvTarget $iconvBackup) {
        Log "iconv-lite-umd.js restored."
    } else {
        Log "No iconv-lite-umd backup - skipping."
    }

    foreach ($rel in @(
        'out\vs\workbench\api\node\extensionHostProcess.js',
        'out\vs\workbench\workbench.desktop.main.js'
    )) {
        $t = Join-Path $appDir $rel
        $b = "$t.tcvn3-backup"
        if (Restore-File $t $b) {
            Log "$(Split-Path $t -Leaf) restored."
        }
    }
}

Log "Done. Restart VS Code."

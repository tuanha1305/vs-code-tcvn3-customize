# Bootstrap installer for vs-code-tcvn3-customize (Windows / PowerShell).
# Pure PowerShell - no Node.js required. Uses native -replace, IndexOf,
# Substring, and Invoke-WebRequest.
#
# One-liner install:
#   $env:TCVN3_WITH_UI=1; irm https://raw.githubusercontent.com/tuanha1305/vs-code-tcvn3-customize/main/install.ps1 | iex
#
# Env-var flags (used when piped via iex - PowerShell scriptblocks don't
# accept positional parameters that way):
#   $env:TCVN3_WITH_UI = 1   patch workbench.desktop.main.js too (UI dropdown)
#   $env:TCVN3_FORCE   = 1   skip the running-VS-Code prompt
#   $env:TCVN3_VSCODE  = "<path>"  explicit resources/app dir
#   $env:TCVN3_REPO    = "user/fork"   override repo
#   $env:TCVN3_BRANCH  = "dev"         override branch

[CmdletBinding()]
param(
    [switch]$WithUi,
    [switch]$Force,
    [string]$VsCode
)

$ErrorActionPreference = 'Stop'

if ($env:TCVN3_WITH_UI) { $WithUi = $true }
if ($env:TCVN3_FORCE)   { $Force  = $true }
if ($env:TCVN3_VSCODE)  { $VsCode = $env:TCVN3_VSCODE }
$repo   = if ($env:TCVN3_REPO)   { $env:TCVN3_REPO }   else { 'tuanha1305/vs-code-tcvn3-customize' }
$branch = if ($env:TCVN3_BRANCH) { $env:TCVN3_BRANCH } else { 'main' }
$base   = "https://raw.githubusercontent.com/$repo/$branch"

function Log  ($msg) { Write-Host ">>> $msg" -ForegroundColor Cyan }
function Warn ($msg) { Write-Host "WARN: $msg" -ForegroundColor Yellow }

# ---- VS Code running check -------------------------------------------------

$vsRunning = Get-Process -Name 'Code' -ErrorAction SilentlyContinue
if ($vsRunning -and -not $Force) {
    Warn "VS Code is running ($($vsRunning.Count) processes)."
    Warn "Quit VS Code completely (incl. background Code.exe) before continuing."
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        $resp = Read-Host "Continue anyway? [y/N]"
        if ($resp -notmatch '^[yY]') { Write-Host "Aborted."; exit 0 }
    } else {
        Write-Host "Non-interactive (likely irm | iex). Quit VS Code or set `$env:TCVN3_FORCE=1."
        exit 1
    }
}

# ---- Locate VS Code apps ---------------------------------------------------

function Test-IsApp ($dir) {
    (Test-Path (Join-Path $dir 'package.json')) -and `
    (Test-Path (Join-Path $dir 'node_modules\@vscode\iconv-lite-umd\lib\iconv-lite-umd.js'))
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

$candidates = @()
if ($VsCode) {
    $candidates += $VsCode
} else {
    $candidates += @(
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
    Write-Host "       Set `$env:TCVN3_VSCODE = '<path-to-resources/app>' if non-standard." -ForegroundColor Red
    exit 1
}

Log "Found $($appDirs.Count) VS Code app dir(s):"
$appDirs | ForEach-Object { Log "  $_" }

# ---- Download artifacts ----------------------------------------------------

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("tcvn3-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Dl ($url, $dest) {
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -ErrorAction Stop
    } catch {
        throw "Download failed: $url ($_)"
    }
}

try {
    Log "Downloading patch artifacts..."
    Dl "$base/dist/iconv-lite-umd.js"             (Join-Path $tmp 'iconv-lite-umd.js')
    Dl "$base/dist/search-patch-prepend.js"       (Join-Path $tmp 'search-patch-prepend.js')
    Dl "$base/dist/search-patch-anchor.txt"       (Join-Path $tmp 'search-patch-anchor.txt')
    Dl "$base/dist/search-patch-replacement.txt"  (Join-Path $tmp 'search-patch-replacement.txt')
    Dl "$base/dist/uy-patch-anchor.txt"           (Join-Path $tmp 'uy-patch-anchor.txt')
    Dl "$base/dist/uy-patch-replacement.txt"      (Join-Path $tmp 'uy-patch-replacement.txt')
    Dl "$base/dist/version.json"                  (Join-Path $tmp 'version.json')
    if ($WithUi) {
        Dl "$base/dist/workbench-patch-anchor.txt"    (Join-Path $tmp 'workbench-patch-anchor.txt')
        Dl "$base/dist/workbench-patch-injection.txt" (Join-Path $tmp 'workbench-patch-injection.txt')
    }
    $verJson = Get-Content (Join-Path $tmp 'version.json') -Raw | ConvertFrom-Json
    Log "Patch version: $($verJson.version)"

    # Pre-load patch fragments. Read with Raw to preserve line endings, and
    # explicitly use UTF8 (no BOM) to keep bytes identical to what the artifact
    # producer wrote.
    $bundlePath        = Join-Path $tmp 'iconv-lite-umd.js'
    $searchPrepend     = [System.IO.File]::ReadAllText((Join-Path $tmp 'search-patch-prepend.js'),     [System.Text.Encoding]::UTF8)
    $searchAnchor      = [System.IO.File]::ReadAllText((Join-Path $tmp 'search-patch-anchor.txt'),     [System.Text.Encoding]::UTF8)
    $searchReplacement = [System.IO.File]::ReadAllText((Join-Path $tmp 'search-patch-replacement.txt'), [System.Text.Encoding]::UTF8)
    $uyAnchor          = [System.IO.File]::ReadAllText((Join-Path $tmp 'uy-patch-anchor.txt'),          [System.Text.Encoding]::UTF8)
    $uyReplacement     = [System.IO.File]::ReadAllText((Join-Path $tmp 'uy-patch-replacement.txt'),     [System.Text.Encoding]::UTF8)
    $uiAnchor    = $null; $uiInjection = $null
    if ($WithUi) {
        $uiAnchor    = [System.IO.File]::ReadAllText((Join-Path $tmp 'workbench-patch-anchor.txt'),    [System.Text.Encoding]::UTF8)
        $uiInjection = [System.IO.File]::ReadAllText((Join-Path $tmp 'workbench-patch-injection.txt'), [System.Text.Encoding]::UTF8)
    }

    function Read-Text ($path) {
        return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    }
    function Write-TextNoBom ($path, $content) {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
    }

    $anyApplied = $false

    foreach ($appDir in $appDirs) {
        Log "--- Patching: $appDir ---"

        # 1. Codec replacement -------------------------------------------------
        $libDir = Join-Path $appDir 'node_modules\@vscode\iconv-lite-umd\lib'
        $target = Join-Path $libDir 'iconv-lite-umd.js'
        $backup = Join-Path $libDir 'iconv-lite-umd.original.js'
        if (-not (Test-Path $target)) {
            Warn "iconv-lite-umd.js missing - skipping"
        } else {
            if (-not (Test-Path $backup)) {
                Log "Backing up iconv-lite-umd.js -> .original.js"
                Copy-Item $target $backup -Force
            }
            try {
                Copy-Item $bundlePath $target -Force
                Log ("iconv-lite-umd.js replaced ({0} bytes)." -f (Get-Item $target).Length)
                $anyApplied = $true
            } catch {
                throw "Cannot write $target - quit VS Code first. ($_)"
            }
        }

        # 2. Search patch (v3: byte search + Vietnamese preview decoder) -------
        $searchTarget = Join-Path $appDir 'out\vs\workbench\api\node\extensionHostProcess.js'
        $searchBackup = "$searchTarget.tcvn3-backup"
        if (-not (Test-Path $searchTarget)) {
            Warn "extensionHostProcess.js missing - skipping search patch"
        } else {
            $searchContent = Read-Text $searchTarget
            $needSearchPatch = $false
            if ($searchContent.Contains("TCVN3 SEARCH PATCH v3 BEGIN")) {
                Log "Search patch v3 already present, skipping."
            } elseif ($searchContent.Contains("TCVN3 SEARCH PATCH v2 BEGIN") -or $searchContent.Contains("TCVN3 SEARCH PATCH v1 BEGIN")) {
                $oldVer = if ($searchContent.Contains("TCVN3 SEARCH PATCH v2 BEGIN")) { "v2" } else { "v1" }
                Log "Old patch $oldVer found - upgrading to v3 (adds correct Vietnamese preview text)..."
                if (Test-Path $searchBackup) {
                    Copy-Item $searchBackup $searchTarget -Force
                    $searchContent = Read-Text $searchTarget
                    $needSearchPatch = $true
                } else {
                    Warn "$oldVer backup not found; cannot upgrade safely. Run uninstall.ps1 first, then reinstall."
                }
            } else {
                $needSearchPatch = $true
            }

            if ($needSearchPatch) {
                $idx = $searchContent.IndexOf($searchAnchor)
                if ($idx -lt 0) {
                    Warn "Could not locate search anchor; skipping search patch."
                } else {
                    if (-not (Test-Path $searchBackup)) { Copy-Item $searchTarget $searchBackup -Force }
                    $newContent = $searchPrepend +
                                  $searchContent.Substring(0, $idx) +
                                  $searchReplacement +
                                  $searchContent.Substring($idx + $searchAnchor.Length)
                    # Also apply uy() preview decoder patch
                    $uyIdx = $newContent.IndexOf($uyAnchor)
                    if ($uyIdx -ge 0) {
                        $newContent = $newContent.Substring(0, $uyIdx) +
                                      $uyReplacement +
                                      $newContent.Substring($uyIdx + $uyAnchor.Length)
                        Log "extensionHostProcess.js patched v3 (byte search + Vietnamese preview decoder)."
                    } else {
                        Warn "uy anchor not found; search works but preview text may be garbled."
                        Log "extensionHostProcess.js patched v3 (byte search only)."
                    }
                    Write-TextNoBom $searchTarget $newContent
                    $anyApplied = $true
                }
            }
        }

        # 3. Workbench (UI) patch ----------------------------------------------
        if ($WithUi) {
            $uiTarget = Join-Path $appDir 'out\vs\workbench\workbench.desktop.main.js'
            $uiBackup = "$uiTarget.tcvn3-backup"
            if (-not (Test-Path $uiTarget)) {
                Warn "workbench.desktop.main.js missing - skipping UI patch"
            } else {
                $uiContent = Read-Text $uiTarget
                if ($uiContent.Contains('Vietnamese (TCVN3)')) {
                    Log "Workbench already has TCVN3 entry, skipping."
                } else {
                    $idx = $uiContent.IndexOf($uiAnchor)
                    if ($idx -lt 0) {
                        Warn "Could not locate workbench anchor; skipping UI patch."
                    } else {
                        if (-not (Test-Path $uiBackup)) { Copy-Item $uiTarget $uiBackup -Force }
                        $insertAt = $idx + $uiAnchor.Length
                        $newUi = $uiContent.Substring(0, $insertAt) + $uiInjection + $uiContent.Substring($insertAt)
                        Write-TextNoBom $uiTarget $newUi
                        Log "workbench.desktop.main.js patched (TCVN3 visible in encoding picker)."
                        $anyApplied = $true
                    }
                }
            }
        }
    }

    Write-Host ""
    if ($anyApplied) {
        Log "Done. Quit VS Code completely (incl. background Code.exe) and relaunch."
        Log ""
        Log "Add to settings.json:  `"files.encoding`": `"tcvn3`""
    }
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

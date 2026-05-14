#!/usr/bin/env bash
# Bootstrap installer for vs-code-tcvn3-customize (Linux / macOS).
# Pure bash — no Node.js, no Python required. Uses only POSIX tools:
#   curl, grep, head, tail, cat, wc, dd, mktemp, cp, mv.
#
# One-liner install:
#   curl -fsSL https://raw.githubusercontent.com/tuanha1305/vs-code-tcvn3-customize/main/install.sh | bash -s -- --with-ui
#
# Flags (forwarded after --):
#   --with-ui            also patch workbench.desktop.main.js (encoding picker)
#   --vscode <path>      explicit path to a VS Code resources/app dir
#   --force              skip the running-VS-Code prompt
set -euo pipefail

REPO="${TCVN3_REPO:-tuanha1305/vs-code-tcvn3-customize}"
BRANCH="${TCVN3_BRANCH:-main}"
BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

WITH_UI=0
FORCE=0
EXPLICIT_VSCODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-ui) WITH_UI=1; shift ;;
    --force)   FORCE=1; shift ;;
    --vscode)  EXPLICIT_VSCODE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

c_log()  { printf '\033[36m>>>\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33mWARN:\033[0m %s\n' "$*" >&2; }
c_fail() { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || c_fail "curl is required."

# ---- VS Code running check -------------------------------------------------

vscode_running() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -i 'Code Helper|Visual Studio Code|^code$|^Code$' >/dev/null 2>&1
  else
    ps -A 2>/dev/null | grep -Ei '(Code Helper|Visual Studio Code|/code$)' | grep -v grep >/dev/null
  fi
}
if vscode_running && [[ $FORCE -eq 0 ]]; then
  c_warn "VS Code appears to be running."
  c_warn "Quit VS Code completely before continuing - file locks may block the patch."
  if [[ -t 0 ]]; then
    printf 'Continue anyway? [y/N] '
    read -r ans
    [[ "$ans" =~ ^[yY] ]] || { echo "Aborted."; exit 0; }
  else
    echo "Non-interactive (curl|bash). Quit VS Code and re-run, or pass --force."
    exit 1
  fi
fi

# ---- Locate VS Code apps ---------------------------------------------------

is_app() {
  [[ -f "$1/package.json" ]] && \
  [[ -f "$1/node_modules/@vscode/iconv-lite-umd/lib/iconv-lite-umd.js" ]]
}
find_app_dirs() {
  local root="$1"
  [[ -d "$root" ]] || return 0
  local direct="$root/resources/app"
  is_app "$direct" && echo "$direct"
  is_app "$root" && echo "$root"
  for entry in "$root"/*; do
    [[ -d "$entry" ]] || continue
    local cand="$entry/resources/app"
    is_app "$cand" && echo "$cand"
  done
}

CANDIDATES=()
if [[ -n "$EXPLICIT_VSCODE" ]]; then
  CANDIDATES+=("$EXPLICIT_VSCODE")
else
  CANDIDATES+=(
    "$HOME/AppData/Local/Programs/Microsoft VS Code"
    "/usr/share/code"
    "/usr/share/code-insiders"
    "/snap/code/current/usr/share/code"
    "/Applications/Visual Studio Code.app/Contents/Resources/app"
    "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app"
  )
fi
APP_DIRS=()
for c in "${CANDIDATES[@]}"; do
  while IFS= read -r d; do
    [[ -n "$d" ]] || continue
    # de-dup
    skip=0
    for existing in "${APP_DIRS[@]:-}"; do
      [[ "$existing" == "$d" ]] && { skip=1; break; }
    done
    [[ $skip -eq 0 ]] && APP_DIRS+=("$d")
  done < <(find_app_dirs "$c")
done
[[ ${#APP_DIRS[@]} -gt 0 ]] || c_fail "No VS Code installation found. Pass --vscode <resources/app>."

c_log "Found ${#APP_DIRS[@]} VS Code app dir(s):"
for d in "${APP_DIRS[@]}"; do c_log "  $d"; done

# ---- Download artifacts ----------------------------------------------------

TMPDIR=$(mktemp -d -t tcvn3-XXXXXX)
trap 'rm -rf "$TMPDIR"' EXIT

dl() {
  curl -fsSL "$1" -o "$2" || c_fail "Download failed: $1"
}

c_log "Downloading patch artifacts..."
dl "$BASE/dist/iconv-lite-umd.js"               "$TMPDIR/iconv-lite-umd.js"
dl "$BASE/dist/search-patch-prepend.js"         "$TMPDIR/search-patch-prepend.js"
dl "$BASE/dist/search-patch-anchor.txt"         "$TMPDIR/search-patch-anchor.txt"
dl "$BASE/dist/search-patch-replacement.txt"    "$TMPDIR/search-patch-replacement.txt"
dl "$BASE/dist/uy-patch-anchor.txt"              "$TMPDIR/uy-patch-anchor.txt"
dl "$BASE/dist/uy-patch-replacement.txt"         "$TMPDIR/uy-patch-replacement.txt"
dl "$BASE/dist/replace-offset-anchor.txt"        "$TMPDIR/replace-offset-anchor.txt"
dl "$BASE/dist/replace-offset-replacement.txt"   "$TMPDIR/replace-offset-replacement.txt"
dl "$BASE/dist/version.json"                     "$TMPDIR/version.json"
if [[ $WITH_UI -eq 1 ]]; then
  dl "$BASE/dist/workbench-patch-anchor.txt"    "$TMPDIR/workbench-patch-anchor.txt"
  dl "$BASE/dist/workbench-patch-injection.txt" "$TMPDIR/workbench-patch-injection.txt"
fi
c_log "Patch version: $(grep -o '"version":[^,}]*' "$TMPDIR/version.json" | cut -d'"' -f4)"

# ---- Patch routines --------------------------------------------------------

# replace_anchor <target_file> <anchor_file> <replacement_file>
#   In-place replace the first occurrence of <anchor> contents with
#   <replacement> contents in <target>. Uses byte-offset slicing so it works
#   on big files (~2MB extensionHostProcess.js) and arbitrary contents.
replace_anchor() {
  local target="$1" anchor_file="$2" replacement_file="$3"
  local anchor_len
  anchor_len=$(wc -c < "$anchor_file")
  # grep -aob -F: byte offset of literal match in binary mode.
  local first
  first=$(LC_ALL=C grep -aobF -f "$anchor_file" "$target" | head -1 | cut -d: -f1) || true
  if [[ -z "${first:-}" ]]; then
    return 1
  fi
  local tmp="$target.tcvn3-tmp"
  head -c "$first" "$target" > "$tmp"
  cat "$replacement_file" >> "$tmp"
  tail -c +$((first + anchor_len + 1)) "$target" >> "$tmp"
  mv "$tmp" "$target"
}

# insert_after_anchor <target_file> <anchor_file> <injection_file>
#   Insert <injection> contents immediately AFTER the first occurrence of
#   <anchor> in <target>. (Anchor preserved.)
insert_after_anchor() {
  local target="$1" anchor_file="$2" injection_file="$3"
  local anchor_len
  anchor_len=$(wc -c < "$anchor_file")
  local first
  first=$(LC_ALL=C grep -aobF -f "$anchor_file" "$target" | head -1 | cut -d: -f1) || true
  if [[ -z "${first:-}" ]]; then
    return 1
  fi
  local end_of_anchor=$((first + anchor_len))
  local tmp="$target.tcvn3-tmp"
  head -c "$end_of_anchor" "$target" > "$tmp"
  cat "$injection_file" >> "$tmp"
  tail -c +$((end_of_anchor + 1)) "$target" >> "$tmp"
  mv "$tmp" "$target"
}

# prepend_file <target_file> <prepend_file>
prepend_file() {
  local target="$1" pre="$2"
  local tmp="$target.tcvn3-tmp"
  cat "$pre" "$target" > "$tmp"
  mv "$tmp" "$target"
}

# ---- Apply per app dir -----------------------------------------------------

ANY_APPLIED=0

for APP_DIR in "${APP_DIRS[@]}"; do
  c_log "--- Patching: $APP_DIR ---"

  # 1. Codec replacement -----------------------------------------------------
  LIB_DIR="$APP_DIR/node_modules/@vscode/iconv-lite-umd/lib"
  TARGET="$LIB_DIR/iconv-lite-umd.js"
  BACKUP="$LIB_DIR/iconv-lite-umd.original.js"
  if [[ ! -f "$TARGET" ]]; then
    c_warn "iconv-lite-umd.js missing at $TARGET - skipping"
  else
    if [[ ! -f "$BACKUP" ]]; then
      c_log "Backing up iconv-lite-umd.js -> .original.js"
      cp "$TARGET" "$BACKUP"
    fi
    cp "$TMPDIR/iconv-lite-umd.js" "$TARGET" || c_fail "Cannot write $TARGET (quit VS Code first?)"
    c_log "iconv-lite-umd.js replaced ($(wc -c < "$TARGET") bytes)."
    ANY_APPLIED=1
  fi

  # 2. Search patch (v4: byte search + preview decoder + replace offset fix) --
  SEARCH_TARGET="$APP_DIR/out/vs/workbench/api/node/extensionHostProcess.js"
  SEARCH_BACKUP="$SEARCH_TARGET.tcvn3-backup"
  if [[ ! -f "$SEARCH_TARGET" ]]; then
    c_warn "extensionHostProcess.js missing - skipping search patch"
  elif grep -q "TCVN3 SEARCH PATCH v5 BEGIN" "$SEARCH_TARGET" 2>/dev/null; then
    c_log "Search patch v5 already present, skipping."
  else
    NEED_SEARCH_PATCH=0
    if grep -q "TCVN3 SEARCH PATCH v4 BEGIN" "$SEARCH_TARGET" 2>/dev/null || \
       grep -q "TCVN3 SEARCH PATCH v3 BEGIN" "$SEARCH_TARGET" 2>/dev/null || \
       grep -q "TCVN3 SEARCH PATCH v2 BEGIN" "$SEARCH_TARGET" 2>/dev/null || \
       grep -q "TCVN3 SEARCH PATCH v1 BEGIN" "$SEARCH_TARGET" 2>/dev/null; then
      if grep -q "TCVN3 SEARCH PATCH v4 BEGIN" "$SEARCH_TARGET" 2>/dev/null; then
        OLD_VER="v4"
      elif grep -q "TCVN3 SEARCH PATCH v3 BEGIN" "$SEARCH_TARGET" 2>/dev/null; then
        OLD_VER="v3"
      elif grep -q "TCVN3 SEARCH PATCH v2 BEGIN" "$SEARCH_TARGET" 2>/dev/null; then
        OLD_VER="v2"
      else
        OLD_VER="v1"
      fi
      c_log "Old patch ${OLD_VER} found - upgrading to v5 (eager decoder init for multi-worker fix)..."
      if [[ -f "$SEARCH_BACKUP" ]]; then
        cp "$SEARCH_BACKUP" "$SEARCH_TARGET"
        NEED_SEARCH_PATCH=1
      else
        c_warn "${OLD_VER} backup not found; cannot upgrade safely. Run uninstall.sh first, then reinstall."
      fi
    else
      NEED_SEARCH_PATCH=1
    fi

    if [[ $NEED_SEARCH_PATCH -eq 1 ]]; then
      [[ -f "$SEARCH_BACKUP" ]] || cp "$SEARCH_TARGET" "$SEARCH_BACKUP"
      if replace_anchor "$SEARCH_TARGET" \
                        "$TMPDIR/search-patch-anchor.txt" \
                        "$TMPDIR/search-patch-replacement.txt"; then
        # Apply replace-offset fix (byte→char column correction for Replace All)
        if replace_anchor "$SEARCH_TARGET" \
                          "$TMPDIR/replace-offset-anchor.txt" \
                          "$TMPDIR/replace-offset-replacement.txt"; then
          :
        else
          c_warn "replace-offset anchor not found; Replace All may land at wrong column."
        fi
        # Apply uy() preview decoder patch
        if replace_anchor "$SEARCH_TARGET" \
                          "$TMPDIR/uy-patch-anchor.txt" \
                          "$TMPDIR/uy-patch-replacement.txt"; then
          prepend_file "$SEARCH_TARGET" "$TMPDIR/search-patch-prepend.js"
          c_log "extensionHostProcess.js patched v5 (eager decoder + byte search + preview decoder + replace offset fix)."
        else
          prepend_file "$SEARCH_TARGET" "$TMPDIR/search-patch-prepend.js"
          c_warn "uy anchor not found; search works but preview text may be garbled."
          c_log "extensionHostProcess.js patched v5 (eager decoder + byte search + replace offset fix)."
        fi
        ANY_APPLIED=1
      else
        c_warn "Could not locate search anchor; restoring backup."
        cp "$SEARCH_BACKUP" "$SEARCH_TARGET"
      fi
    fi
  fi

  # 3. Workbench (UI) patch --------------------------------------------------
  if [[ $WITH_UI -eq 1 ]]; then
    UI_TARGET="$APP_DIR/out/vs/workbench/workbench.desktop.main.js"
    UI_BACKUP="$UI_TARGET.tcvn3-backup"
    if [[ ! -f "$UI_TARGET" ]]; then
      c_warn "workbench.desktop.main.js missing - skipping UI patch"
    elif grep -q 'Vietnamese (TCVN3)' "$UI_TARGET" 2>/dev/null; then
      c_log "Workbench already has TCVN3 entry, skipping."
    else
      [[ -f "$UI_BACKUP" ]] || cp "$UI_TARGET" "$UI_BACKUP"
      if insert_after_anchor "$UI_TARGET" \
                             "$TMPDIR/workbench-patch-anchor.txt" \
                             "$TMPDIR/workbench-patch-injection.txt"; then
        c_log "workbench.desktop.main.js patched (TCVN3 visible in encoding picker)."
        ANY_APPLIED=1
      else
        c_warn "Could not locate workbench anchor; restoring backup."
        cp "$UI_BACKUP" "$UI_TARGET"
      fi
    fi
  fi
done

echo
if [[ $ANY_APPLIED -eq 1 ]]; then
  c_log "Done. Quit VS Code completely (incl. background processes) and relaunch."
  c_log ""
  c_log 'Add to settings.json:  "files.encoding": "tcvn3"'
fi

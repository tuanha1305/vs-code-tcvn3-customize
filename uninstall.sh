#!/usr/bin/env bash
# Bootstrap uninstaller (Linux / macOS). Pure bash - no Node.js.
# Restores VS Code's original files from the *.original.js / *.tcvn3-backup
# files that install.sh saved.
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/tuanha1305/vs-code-tcvn3-customize/main/uninstall.sh | bash
set -euo pipefail

FORCE=0
EXPLICIT_VSCODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)  FORCE=1; shift ;;
    --vscode) EXPLICIT_VSCODE="$2"; shift 2 ;;
    *) shift ;;
  esac
done

c_log()  { printf '\033[36m>>>\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33mWARN:\033[0m %s\n' "$*" >&2; }
c_fail() { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

vscode_running() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -i 'Code Helper|Visual Studio Code|^code$|^Code$' >/dev/null 2>&1
  else
    ps -A 2>/dev/null | grep -Ei '(Code Helper|Visual Studio Code|/code$)' | grep -v grep >/dev/null
  fi
}
if vscode_running && [[ $FORCE -eq 0 ]]; then
  c_warn "VS Code is running. Restoration may fail due to file locks."
  if [[ -t 0 ]]; then
    printf 'Continue anyway? [y/N] '
    read -r ans
    [[ "$ans" =~ ^[yY] ]] || { echo "Aborted."; exit 0; }
  else
    echo "Non-interactive. Quit VS Code, or pass --force."
    exit 1
  fi
fi

is_app() {
  [[ -f "$1/package.json" ]] && [[ -d "$1/node_modules/@vscode/iconv-lite-umd" ]]
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
    "/snap/code/current/usr/share/code"
    "/Applications/Visual Studio Code.app/Contents/Resources/app"
  )
fi
APP_DIRS=()
for c in "${CANDIDATES[@]}"; do
  while IFS= read -r d; do
    [[ -n "$d" ]] || continue
    skip=0
    for existing in "${APP_DIRS[@]:-}"; do
      [[ "$existing" == "$d" ]] && { skip=1; break; }
    done
    [[ $skip -eq 0 ]] && APP_DIRS+=("$d")
  done < <(find_app_dirs "$c")
done
[[ ${#APP_DIRS[@]} -gt 0 ]] || c_fail "No VS Code installation found."

restore() {
  local target="$1" backup="$2"
  if [[ ! -f "$backup" ]]; then return 1; fi
  cp "$backup" "$target" || return 2
  rm -f "$backup"
  return 0
}

for APP_DIR in "${APP_DIRS[@]}"; do
  c_log "--- Restoring: $APP_DIR ---"

  ICONV_TARGET="$APP_DIR/node_modules/@vscode/iconv-lite-umd/lib/iconv-lite-umd.js"
  ICONV_BACKUP="$APP_DIR/node_modules/@vscode/iconv-lite-umd/lib/iconv-lite-umd.original.js"
  if restore "$ICONV_TARGET" "$ICONV_BACKUP"; then
    c_log "iconv-lite-umd.js restored."
  else
    c_log "No iconv-lite-umd backup - skipping."
  fi

  for f in \
    "out/vs/workbench/api/node/extensionHostProcess.js" \
    "out/vs/workbench/workbench.desktop.main.js"; do
    T="$APP_DIR/$f"
    B="$T.tcvn3-backup"
    if restore "$T" "$B"; then
      c_log "$(basename "$T") restored."
    fi
  done
done

c_log "Done. Restart VS Code."

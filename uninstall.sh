#!/usr/bin/env bash
# Bootstrap uninstaller (Linux / macOS).
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/OWNER/vs-code-tcvn3-customize/main/uninstall.sh | bash
set -euo pipefail

REPO="${TCVN3_REPO:-tuanha1305/vs-code-tcvn3-customize}"
BRANCH="${TCVN3_BRANCH:-main}"
BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

log()  { printf '\033[36m>>>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mWARN:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

if ! command -v node >/dev/null 2>&1; then fail "Node.js is required."; fi
if ! command -v curl >/dev/null 2>&1; then fail "curl is required."; fi

FORCE=0
FORWARD=()
for arg in "$@"; do
  if [[ "$arg" == "--force" ]]; then FORCE=1
  else FORWARD+=("$arg")
  fi
done

vscode_running() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -i 'Code Helper|Visual Studio Code|^code$|^Code$' >/dev/null 2>&1
  else
    ps -A 2>/dev/null | grep -Ei '(Code Helper|Visual Studio Code|/code$)' | grep -v grep >/dev/null
  fi
}
if vscode_running && [[ $FORCE -eq 0 ]]; then
  warn "VS Code is running. Restoration may fail due to file locks."
  if [[ -t 0 ]]; then
    printf 'Continue anyway? [y/N] '
    read -r ans
    case "$ans" in
      [yY]*) ;;
      *) echo "Aborted."; exit 0 ;;
    esac
  else
    echo "Non-interactive (curl|bash). Quit VS Code and re-run, or pass --force."
    exit 1
  fi
fi

TMPDIR=$(mktemp -d -t tcvn3u-XXXXXX)
trap 'rm -rf "$TMPDIR"' EXIT
log "Downloading restore script..."
curl -fsSL "$BASE/scripts/restore.js" -o "$TMPDIR/restore.js" || fail "download failed"

log "Restoring VS Code..."
node "$TMPDIR/restore.js" "${FORWARD[@]}"

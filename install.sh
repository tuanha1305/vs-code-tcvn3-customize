#!/usr/bin/env bash
# Bootstrap installer for vs-code-tcvn3-customize (Linux / macOS).
#
# One-liner install (replace OWNER):
#   curl -fsSL https://raw.githubusercontent.com/OWNER/vs-code-tcvn3-customize/main/install.sh | bash
#
# With UI dropdown:
#   curl -fsSL https://.../install.sh | bash -s -- --with-ui
#
# Override repo (forks / branches):
#   TCVN3_REPO=user/fork TCVN3_BRANCH=dev curl -fsSL https://.../install.sh | bash
set -euo pipefail

# Configure these for your fork. The published version pins these to the
# canonical OWNER/main; users can override with env vars.
REPO="${TCVN3_REPO:-tuanha1305/vs-code-tcvn3-customize}"
BRANCH="${TCVN3_BRANCH:-main}"
BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

log()  { printf '\033[36m>>>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mWARN:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ---- Prerequisites ---------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
  fail $'Node.js is required.\n       Install from https://nodejs.org/ (any LTS).'
fi
if ! command -v curl >/dev/null 2>&1; then
  fail "curl is required."
fi

log "Node.js: $(node --version)"
log "Repo:    $REPO  branch: $BRANCH"

# ---- Args ------------------------------------------------------------------

FORCE=0
FORWARD=()
for arg in "$@"; do
  if [[ "$arg" == "--force" ]]; then FORCE=1
  else FORWARD+=("$arg")
  fi
done

# ---- VS Code running check -------------------------------------------------

vscode_running() {
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -i 'Code Helper|Visual Studio Code|^code$|^Code$' >/dev/null 2>&1
  else
    ps -A 2>/dev/null | grep -Ei '(Code Helper|Visual Studio Code|/code$)' | grep -v grep >/dev/null
  fi
}
if vscode_running && [[ $FORCE -eq 0 ]]; then
  warn "VS Code appears to be running."
  warn "Quit VS Code completely before continuing - file locks may block the patch."
  if [[ -t 0 ]]; then
    printf 'Continue anyway? [y/N] '
    read -r ans
    case "$ans" in
      [yY]*) ;;
      *) echo "Aborted."; exit 0 ;;
    esac
  else
    echo "Non-interactive (e.g. piped from curl). Quit VS Code and re-run, or pass --force."
    exit 1
  fi
fi

# ---- Download artifacts ----------------------------------------------------

TMPDIR=$(mktemp -d -t tcvn3-XXXXXX)
trap 'rm -rf "$TMPDIR"' EXIT
mkdir -p "$TMPDIR/dist"

download() {
  local url="$1" dest="$2"
  if ! curl -fsSL "$url" -o "$dest"; then
    fail "Failed to download $url"
  fi
}

log "Downloading patch artifacts..."
download "$BASE/dist/iconv-lite-umd.js"   "$TMPDIR/dist/iconv-lite-umd.js"
download "$BASE/dist/search-patch.js"     "$TMPDIR/dist/search-patch.js"
download "$BASE/dist/workbench-patch.js"  "$TMPDIR/dist/workbench-patch.js"
download "$BASE/dist/version.json"        "$TMPDIR/dist/version.json"
download "$BASE/scripts/apply.js"         "$TMPDIR/apply.js"

# ---- Apply -----------------------------------------------------------------

log "Patching VS Code..."
node "$TMPDIR/apply.js" --dist "$TMPDIR/dist" "${FORWARD[@]}"

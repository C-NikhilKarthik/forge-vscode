#!/usr/bin/env bash
#
# Forge remote bootstrap — reusable core.
#
# Sets up a micromamba environment and downloads datasets/checkpoints declared
# in .forge/, caching to a /data volume if one is mounted. Idempotent: every
# step checks for prior completion, so re-running is cheap and safe.
#
# Inputs (env vars, set by the caller — the VS Code extension or a future CLI):
#   FORGE_ENV_NAME   conda/micromamba env name            (required)
#   FORGE_ENV_FILE   path to environment.yml, repo-relative (required)
#   FORGE_DATA       newline-delimited "src|dest" entries  (optional)
#   FORGE_SETUP      newline-delimited shell commands      (optional)
#
set -euo pipefail

log() { printf '\033[1;36m[forge]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[forge] error:\033[0m %s\n' "$*" >&2; exit 1; }

# 1. Cache root: prefer a mounted /data volume so downloads persist.
if mountpoint -q /data 2>/dev/null || { [ -d /data ] && [ -w /data ]; }; then
  CACHE_ROOT=/data
else
  CACHE_ROOT="$HOME/.forge-cache"
fi
DONE_DIR="$CACHE_ROOT/.forge/done"
mkdir -p "$DONE_DIR"
log "cache root: $CACHE_ROOT"

# 2. Install micromamba if absent.
MAMBA_ROOT="${MAMBA_ROOT_PREFIX:-$HOME/micromamba}"
export MAMBA_ROOT_PREFIX="$MAMBA_ROOT"
if ! command -v micromamba >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/micromamba" ]; then
  log "installing micromamba…"
  mkdir -p "$HOME/.local/bin"
  arch="$(uname -m)"; os="$(uname -s)"
  case "$os-$arch" in
    Linux-x86_64)  plat="linux-64" ;;
    Linux-aarch64) plat="linux-aarch64" ;;
    Darwin-arm64)  plat="osx-arm64" ;;
    Darwin-x86_64) plat="osx-64" ;;
    *) die "unsupported platform: $os-$arch" ;;
  esac
  curl -Ls "https://micro.mamba.pm/api/micromamba/$plat/latest" \
    | tar -xvj -C "$HOME/.local" bin/micromamba >/dev/null
fi
export PATH="$HOME/.local/bin:$PATH"
command -v micromamba >/dev/null 2>&1 || die "micromamba not on PATH after install"

# 3. Create or update the environment.
[ -n "${FORGE_ENV_NAME:-}" ] || die "FORGE_ENV_NAME not set"
[ -f "${FORGE_ENV_FILE:-environment.yml}" ] || die "env file not found: ${FORGE_ENV_FILE:-environment.yml}"
if micromamba env list | awk '{print $1}' | grep -qx "$FORGE_ENV_NAME"; then
  log "updating env '$FORGE_ENV_NAME'…"
  micromamba update -y -n "$FORGE_ENV_NAME" -f "$FORGE_ENV_FILE"
else
  log "creating env '$FORGE_ENV_NAME'…"
  micromamba create -y -n "$FORGE_ENV_NAME" -f "$FORGE_ENV_FILE"
fi

run_in_env() { micromamba run -n "$FORGE_ENV_NAME" bash -lc "$1"; }

# 4. Download data entries (skip if already present via sentinel).
if [ -n "${FORGE_DATA:-}" ]; then
  while IFS='|' read -r src dest; do
    [ -n "$src" ] || continue
    sentinel="$DONE_DIR/$(printf '%s' "$src$dest" | shasum | cut -d' ' -f1)"
    if [ -f "$sentinel" ] && [ -e "$dest" ]; then
      log "skip (cached): $dest"
      continue
    fi
    mkdir -p "$(dirname "$dest")"
    log "downloading $src -> $dest"
    case "$src" in
      hf://*)   run_in_env "huggingface-cli download '${src#hf://}' --local-dir '$dest'" ;;
      s3://*)   run_in_env "aws s3 sync '$src' '$dest'" ;;
      http://*|https://*) curl -L --fail -o "$dest" "$src" ;;
      *) die "unknown data scheme for: $src" ;;
    esac
    touch "$sentinel"
  done <<< "$FORGE_DATA"
fi

# 5. Setup steps.
if [ -n "${FORGE_SETUP:-}" ]; then
  while IFS= read -r cmd; do
    [ -n "$cmd" ] || continue
    log "setup: $cmd"
    run_in_env "$cmd"
  done <<< "$FORGE_SETUP"
fi

log "bootstrap complete. activate with: micromamba activate $FORGE_ENV_NAME"

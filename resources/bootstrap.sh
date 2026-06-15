#!/usr/bin/env bash
#
# Forge remote bootstrap — reusable core.
#
# Sets up a conda environment and downloads datasets/checkpoints declared in
# .forge/, caching to a /data volume if one is mounted. Idempotent: every step
# checks for prior completion, so re-running is cheap and safe.
#
# Inputs (env vars, set by the caller — the VS Code extension or a future CLI):
#   FORGE_ENV_NAME   conda env name                              (required)
#   FORGE_ENV_YAML   environment.yml content (generated from env.toml) (required)
#   FORGE_DATA       newline-delimited "src|dest" entries        (optional)
#   FORGE_SETUP      newline-delimited shell commands            (optional)
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

# 2. Resolve a conda: reuse an existing one (common on Vast images), else install
#    Miniconda3. `mamba` is used as a faster drop-in solver when available.
find_conda() {
  for c in conda mamba; do
    if command -v "$c" >/dev/null 2>&1; then echo "$c"; return 0; fi
  done
  for base in "$HOME/miniconda3" "$HOME/miniforge3" /opt/conda; do
    if [ -x "$base/bin/conda" ]; then echo "$base/bin/conda"; return 0; fi
  done
  return 1
}

if ! CONDA="$(find_conda)"; then
  log "no conda found — installing Miniconda3…"
  arch="$(uname -m)"; os="$(uname -s)"
  case "$os-$arch" in
    Linux-x86_64)  mc="Miniconda3-latest-Linux-x86_64.sh" ;;
    Linux-aarch64) mc="Miniconda3-latest-Linux-aarch64.sh" ;;
    Darwin-arm64)  mc="Miniconda3-latest-MacOSX-arm64.sh" ;;
    Darwin-x86_64) mc="Miniconda3-latest-MacOSX-x86_64.sh" ;;
    *) die "unsupported platform: $os-$arch" ;;
  esac
  curl -Ls "https://repo.anaconda.com/miniconda/$mc" -o /tmp/forge-miniconda.sh
  bash /tmp/forge-miniconda.sh -b -p "$HOME/miniconda3"
  rm -f /tmp/forge-miniconda.sh
  CONDA="$HOME/miniconda3/bin/conda"
fi
log "using conda: $CONDA"

# 3. Create or update the environment from the generated environment.yml.
[ -n "${FORGE_ENV_NAME:-}" ] || die "FORGE_ENV_NAME not set"
[ -n "${FORGE_ENV_YAML:-}" ] || die "FORGE_ENV_YAML not set"
ENV_FILE="$(mktemp /tmp/forge-env.XXXXXX.yml)"
printf '%s' "$FORGE_ENV_YAML" > "$ENV_FILE"
trap 'rm -f "$ENV_FILE"' EXIT

if "$CONDA" env list | awk '{print $1}' | grep -qx "$FORGE_ENV_NAME"; then
  log "updating env '$FORGE_ENV_NAME'…"
  "$CONDA" env update -n "$FORGE_ENV_NAME" -f "$ENV_FILE" --prune
else
  log "creating env '$FORGE_ENV_NAME'…"
  "$CONDA" env create -y -n "$FORGE_ENV_NAME" -f "$ENV_FILE"
fi

run_in_env() { "$CONDA" run -n "$FORGE_ENV_NAME" bash -lc "$1"; }

# 4. Download data entries (skip if already present via sentinel).
if [ -n "${FORGE_DATA:-}" ]; then
  # Prefer the new `hf` CLI; fall back to the older `huggingface-cli` alias.
  HF_CLI="huggingface-cli"
  if run_in_env "command -v hf >/dev/null 2>&1"; then HF_CLI="hf"; fi

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
      hf://*)
        ref="${src#hf://}"; rtype="model"
        case "$ref" in
          datasets/*) rtype="dataset"; ref="${ref#datasets/}" ;;
          models/*)   rtype="model";   ref="${ref#models/}" ;;
        esac
        run_in_env "$HF_CLI download --repo-type '$rtype' '$ref' --local-dir '$dest'"
        ;;
      s3://*)   run_in_env "aws s3 sync '$src' '$dest'" ;;
      http://*|https://*) curl -L --fail -o "$dest" "$src" ;;
      *) die "unknown data scheme for: $src" ;;
    esac
    touch "$sentinel"
  done <<< "$FORGE_DATA"
fi

# 5. Setup steps (run inside the env).
if [ -n "${FORGE_SETUP:-}" ]; then
  while IFS= read -r cmd; do
    [ -n "$cmd" ] || continue
    log "setup: $cmd"
    run_in_env "$cmd"
  done <<< "$FORGE_SETUP"
fi

log "bootstrap complete. activate with: conda activate $FORGE_ENV_NAME"

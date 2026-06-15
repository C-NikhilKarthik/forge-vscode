#!/usr/bin/env bash
#
# Forge: remove what Forge created on the box. Driven by env flags so the user
# picks what to clear in VS Code. Best-effort — not `set -e`, so one failed
# removal doesn't abort the rest.
#
# Inputs (env vars):
#   FORGE_CLEAN_ENV/DATA/KEY/REPO = "1" to remove that piece
#   FORGE_ENV_NAME   conda env to remove
#   FORGE_DATA       newline-delimited "src|dest" entries to remove (+ sentinels)
#   FORGE_REPO_PATH  cloned repo folder to delete
#
set -uo pipefail

log() { printf '\033[1;36m[forge]\033[0m %s\n' "$*"; }

if mountpoint -q /data 2>/dev/null || { [ -d /data ] && [ -w /data ]; }; then
  CACHE_ROOT=/data
else
  CACHE_ROOT="$HOME/.forge-cache"
fi
DONE_DIR="$CACHE_ROOT/.forge/done"

find_conda() {
  for c in conda mamba; do
    command -v "$c" >/dev/null 2>&1 && { echo "$c"; return 0; }
  done
  for b in "$HOME/miniconda3" "$HOME/miniforge3" /opt/conda /opt/miniforge3; do
    [ -x "$b/bin/conda" ] && { echo "$b/bin/conda"; return 0; }
  done
  return 1
}

if [ "${FORGE_CLEAN_ENV:-}" = "1" ] && [ -n "${FORGE_ENV_NAME:-}" ]; then
  if CONDA="$(find_conda)"; then
    log "removing conda env: $FORGE_ENV_NAME"
    "$CONDA" env remove -y -n "$FORGE_ENV_NAME" || log "env remove failed (maybe already gone)"
  else
    log "no conda found; skipping env removal"
  fi
fi

if [ "${FORGE_CLEAN_DATA:-}" = "1" ] && [ -n "${FORGE_DATA:-}" ]; then
  while IFS='|' read -r src dest; do
    [ -n "$dest" ] || continue
    log "removing data: $dest"
    rm -rf "$dest"
    rm -f "$DONE_DIR/$(printf '%s' "$src$dest" | shasum | cut -d' ' -f1)"
  done <<< "$FORGE_DATA"
fi

if [ "${FORGE_CLEAN_KEY:-}" = "1" ]; then
  log "removing box Forge SSH key + git core.sshCommand"
  rm -f /data/.forge/ssh/forge_id_ed25519 /data/.forge/ssh/forge_id_ed25519.pub \
        "$HOME/.ssh/forge_id_ed25519" "$HOME/.ssh/forge_id_ed25519.pub"
  git config --global --unset core.sshCommand 2>/dev/null || true
fi

if [ "${FORGE_CLEAN_REPO:-}" = "1" ] && [ -n "${FORGE_REPO_PATH:-}" ]; then
  log "removing repo folder: $FORGE_REPO_PATH"
  rm -rf "$FORGE_REPO_PATH"
fi

log "cleanup complete."

#!/usr/bin/env bash
#
# Forge: give the box its own GitHub-authorized SSH identity.
#
# This is the credential layer that "just works" regardless of the user's local
# config or the box's shell (tmux strips forwarded creds, so we don't rely on
# forwarding). We generate a dedicated key ON the box — your laptop keys and any
# PAT are never copied here — and point all git at it via core.sshCommand, so
# clone/push/pull work in every shell, the GUI, and for AI agents.
#
# Inputs (env vars, optional):
#   FORGE_GIT_NAME   git user.name to set globally on the box
#   FORGE_GIT_EMAIL  git user.email to set globally on the box
#
# Machine-readable output (one per line):
#   FORGE_KEY=<private key path>
#   FORGE_PUBKEY=<public key contents>
#   FORGE_AUTH=ok | missing
#
set -euo pipefail

# Persist the key on a mounted /data volume if present, so it survives instance
# rebuilds (you only authorize it on GitHub once per volume).
if mountpoint -q /data 2>/dev/null || { [ -d /data ] && [ -w /data ]; }; then
  KEY_DIR=/data/.forge/ssh
else
  KEY_DIR="$HOME/.ssh"
fi
mkdir -p "$KEY_DIR"
chmod 700 "$KEY_DIR" 2>/dev/null || true
KEY="$KEY_DIR/forge_id_ed25519"

if [ ! -f "$KEY" ]; then
  ssh-keygen -t ed25519 -N "" -C "forge@$(hostname)" -f "$KEY" >/dev/null 2>&1
fi
chmod 600 "$KEY" 2>/dev/null || true

# All git on the box uses this key, and auto-accepts GitHub's host key.
SSHCMD="ssh -i $KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
git config --global core.sshCommand "$SSHCMD"

[ -n "${FORGE_GIT_NAME:-}" ]  && git config --global user.name  "$FORGE_GIT_NAME"  || true
[ -n "${FORGE_GIT_EMAIL:-}" ] && git config --global user.email "$FORGE_GIT_EMAIL" || true

echo "FORGE_KEY=$KEY"
echo "FORGE_PUBKEY=$(cat "$KEY.pub")"

# `ssh -T git@github.com` exits non-zero even on success, and `set -o pipefail`
# would propagate that — so capture the output and match the text, not the code.
AUTH_OUT="$($SSHCMD -T git@github.com 2>&1 || true)"
case "$AUTH_OUT" in
  *"successfully authenticated"*) echo "FORGE_AUTH=ok" ;;
  *)                              echo "FORGE_AUTH=missing" ;;
esac

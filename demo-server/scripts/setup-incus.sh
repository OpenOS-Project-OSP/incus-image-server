#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# setup-incus.sh — prepare Incus for the demo server.
#
# Creates the 'demo' profile with appropriate resource limits and pulls
# the default base image. Run once after install.sh.
#
# Usage: sudo bash scripts/setup-incus.sh [--image IMAGE] [--pool POOL]

set -euo pipefail

IMAGE="ubuntu/24.04"
POOL="default"
PROFILE="demo"
NETWORK="incusbr0"

log()  { printf '\033[34m[setup-incus]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[setup-incus]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[setup-incus]\033[0m Error: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --image)   IMAGE="$2";   shift 2 ;;
        --pool)    POOL="$2";    shift 2 ;;
        --profile) PROFILE="$2"; shift 2 ;;
        --network) NETWORK="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: sudo bash setup-incus.sh [--image IMAGE] [--pool POOL]"
            exit 0 ;;
        *) die "Unknown option: $1" ;;
    esac
done

[[ $EUID -eq 0 ]] || die "Run as root (sudo bash setup-incus.sh)"
command -v incus >/dev/null 2>&1 || die "incus not found"

# ── profile ───────────────────────────────────────────────────────────────────
if incus profile show "${PROFILE}" &>/dev/null; then
    log "Profile '${PROFILE}' already exists — skipping creation."
else
    log "Creating Incus profile '${PROFILE}' ..."
    incus profile create "${PROFILE}"

    # Resource limits matching config.yaml defaults
    incus profile set "${PROFILE}" limits.memory 512MB
    incus profile set "${PROFILE}" limits.processes 50
    incus profile set "${PROFILE}" security.nesting false
    incus profile set "${PROFILE}" security.privileged false

    # Root disk device
    incus profile device add "${PROFILE}" root disk \
        path=/ pool="${POOL}" size=5GB

    # Network device
    incus profile device add "${PROFILE}" eth0 nic \
        nictype=bridged parent="${NETWORK}" name=eth0

    ok "Profile '${PROFILE}' created."
fi

# ── base image ────────────────────────────────────────────────────────────────
log "Pulling base image '${IMAGE}' (this may take a while) ..."
if incus image info "${IMAGE}" &>/dev/null; then
    log "Image '${IMAGE}' already present — skipping."
else
    incus image copy "images:${IMAGE}" local: --alias "${IMAGE}" --auto-update
    ok "Image '${IMAGE}' pulled."
fi

# ── incus-admin group membership ──────────────────────────────────────────────
if id incus-demo &>/dev/null; then
    if ! groups incus-demo | grep -q incus-admin; then
        log "Adding incus-demo to incus-admin group ..."
        usermod -aG incus-admin incus-demo
        ok "Group membership updated."
    fi
fi

ok "Incus setup complete."
echo ""
echo "Start the demo server with:"
echo "  sudo systemctl enable --now incus-demo-server"

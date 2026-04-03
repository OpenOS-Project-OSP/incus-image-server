#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# install.sh — build and install incus-demo-server from upstream source.
#
# Usage: sudo bash scripts/install.sh [--version TAG]
#
# Options:
#   --version TAG   Upstream git tag or branch to build (default: main)

set -euo pipefail

UPSTREAM="https://github.com/lxc/incus-demo-server.git"
VERSION="main"
INSTALL_BIN="/usr/local/bin/incus-demo-server"
CONFIG_DIR="/etc/incus-demo-server"
DATA_DIR="/var/lib/incus-demo-server"
RUN_DIR="/run/incus-demo-server"
SERVICE_USER="incus-demo"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

log()  { printf '\033[34m[install]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[install]\033[0m %s\n' "$*"; }
die()  { printf '\033[31m[install]\033[0m Error: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version) VERSION="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: sudo bash install.sh [--version TAG]"
            exit 0 ;;
        *) die "Unknown option: $1" ;;
    esac
done

[[ $EUID -eq 0 ]] || die "Run as root (sudo bash install.sh)"

# ── dependencies ──────────────────────────────────────────────────────────────
log "Checking dependencies..."
command -v go >/dev/null 2>&1 || die "Go is required. Install from https://go.dev/dl/"
command -v git >/dev/null 2>&1 || die "git is required"

# ── build ─────────────────────────────────────────────────────────────────────
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

log "Cloning incus-demo-server @ ${VERSION} ..."
git clone --depth 1 --branch "${VERSION}" "${UPSTREAM}" "${BUILD_DIR}" 2>&1 \
    || git clone --depth 1 "${UPSTREAM}" "${BUILD_DIR}"

log "Building binary..."
cd "${BUILD_DIR}"
go build -o "${INSTALL_BIN}" ./cmd/incus-demo-server/
ok "Binary installed: ${INSTALL_BIN}"

# ── system user ───────────────────────────────────────────────────────────────
if ! id "${SERVICE_USER}" &>/dev/null; then
    log "Creating system user '${SERVICE_USER}' ..."
    useradd --system --no-create-home --shell /usr/sbin/nologin \
            --comment "Incus Demo Server" "${SERVICE_USER}"
    ok "User created: ${SERVICE_USER}"
fi

# ── directories ───────────────────────────────────────────────────────────────
install -d -m 750 -o "${SERVICE_USER}" -g "${SERVICE_USER}" \
    "${CONFIG_DIR}" "${DATA_DIR}" "${RUN_DIR}"

# ── config ────────────────────────────────────────────────────────────────────
if [[ ! -f "${CONFIG_DIR}/config.yaml" ]]; then
    log "Installing default config to ${CONFIG_DIR}/config.yaml ..."
    install -m 640 -o "${SERVICE_USER}" -g "${SERVICE_USER}" \
        "${SCRIPT_DIR}/../config/config.yaml" "${CONFIG_DIR}/config.yaml"
    ok "Config installed. Edit ${CONFIG_DIR}/config.yaml before starting."
else
    log "Config already exists at ${CONFIG_DIR}/config.yaml — not overwriting."
fi

# ── systemd unit ──────────────────────────────────────────────────────────────
log "Installing systemd unit..."
install -m 644 "${SCRIPT_DIR}/../systemd/incus-demo-server.service" \
    /etc/systemd/system/incus-demo-server.service
systemctl daemon-reload
ok "Systemd unit installed."

ok "Installation complete."
echo ""
echo "Next steps:"
echo "  1. Edit ${CONFIG_DIR}/config.yaml"
echo "  2. Run: sudo bash scripts/setup-incus.sh"
echo "  3. Run: sudo systemctl enable --now incus-demo-server"

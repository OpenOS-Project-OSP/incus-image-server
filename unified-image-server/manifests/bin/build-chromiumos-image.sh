#!/usr/bin/env bash
# manifests/bin/build-chromiumos-image.sh
#
# Downloads a pre-built ChromiumOS stage3 tarball (from the chromiumos-stage3
# component of this project) and repackages it as an Incus-compatible unified
# tarball (rootfs.tar.xz + metadata.tar.xz).
#
# The stage3 is a ChromiumOS build-environment container — it contains the
# ChromiumOS Portage tree, toolchain, and base userspace. It is NOT a
# ChromiumOS desktop/runtime image.
#
# Usage:
#   ./build-chromiumos-image.sh [--board BOARD] [--release RELEASE] [--output DIR]
#
# Boards:
#   reven         amd64 generic (default) — from sebanc/chromiumos-stage3 releases
#   arm64-generic arm64 generic           — from this project's CI releases
#
# Examples:
#   ./build-chromiumos-image.sh
#   ./build-chromiumos-image.sh --board arm64-generic --release R146
#   ./build-chromiumos-image.sh --board reven --output /tmp/images

set -Eeuo pipefail

BOARD="${BOARD:-reven}"
RELEASE="${RELEASE:-R146}"
OUTPUT_DIR="${OUTPUT_DIR:-.}"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "${WORK_DIR}"' EXIT

# GitHub repos publishing pre-built stage3 tarballs
STAGE3_REPO="${STAGE3_REPO:-}"  # override for self-hosted releases
STAGE3_GITHUB_REPO="sebanc/chromiumos-stage3"
# This project's own releases publish arm64 stage3 tarballs built by
# chromiumos-stage3/.github/workflows/build.yml
THIS_GITHUB_REPO="${THIS_GITHUB_REPO:-Interested-Deving-1896/incus-image-server}"

ARCH_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --board)   BOARD="$2";         shift 2 ;;
    --release) RELEASE="$2";       shift 2 ;;
    --output)  OUTPUT_DIR="$2";    shift 2 ;;
    --repo)    STAGE3_REPO="$2";   shift 2 ;;
    --arch)    ARCH_OVERRIDE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# Derive arch from board name; --arch may override for forward-compatibility
# but must be consistent with the board (used for metadata only, not build logic).
case "${BOARD}" in
  reven)         ARCH="amd64" ;;
  arm64-generic|rpi4|rpi5|rk3588|rk3399|orangepi5) ARCH="arm64" ;;
  *) echo "ERROR: Unknown board '${BOARD}'. See chromiumos-stage3/boards/ for options."; exit 1 ;;
esac

if [[ -n "${ARCH_OVERRIDE}" && "${ARCH_OVERRIDE}" != "${ARCH}" ]]; then
  echo "WARNING: --arch ${ARCH_OVERRIDE} ignored; board '${BOARD}' is ${ARCH}."
fi

SERIAL="$(date +%Y%m%d)"
IMAGE_NAME="chromiumos-${BOARD}-${RELEASE}-${SERIAL}"

# ── Resolve stage3 tarball URL ────────────────────────────────────────────────
_resolve_tarball_from_github() {
  local repo="$1"
  local board="$2"
  local response http_code body
  response=$(curl -sSL -w "\n%{http_code}" \
    "https://api.github.com/repos/${repo}/releases/latest" 2>/dev/null) || true
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
  # Return empty string if no releases exist yet (404) or any other error
  if [[ "$http_code" != "200" ]]; then
    echo ""
    return 0
  fi
  echo "$body" | python3 -c "
import json, sys
data = json.load(sys.stdin)
board = sys.argv[1]
assets_all = data.get('assets', [])
# Primary: match our own naming convention (chromiumos-stage3-<board>*.tar.xz)
needle = 'chromiumos-stage3-' + board
matches = [
    a['browser_download_url']
    for a in assets_all
    if (a['name'].endswith('.tar.xz') or a['name'].endswith('.tar.gz'))
    and needle in a['name']
]
# Fallback for sebanc/chromiumos-stage3: single generic tarball (reven board only)
if not matches and board == 'reven':
    matches = [
        a['browser_download_url']
        for a in assets_all
        if a['name'].startswith('chromiumos') and
           (a['name'].endswith('.tar.gz') or a['name'].endswith('.tar.xz'))
    ]
print(matches[0] if matches else '')
" "$board"
}

if [[ -n "${STAGE3_REPO}" ]]; then
  # Direct URL override (e.g. self-hosted or local file)
  TARBALL_URL="${STAGE3_REPO}/chromiumos-stage3-${BOARD}-${RELEASE}.tar.xz"
elif [[ "${BOARD}" == "reven" ]]; then
  # sebanc/chromiumos-stage3 publishes reven (amd64) releases
  TARBALL_URL="$(_resolve_tarball_from_github "${STAGE3_GITHUB_REPO}" "${BOARD}")"
  if [[ -z "${TARBALL_URL}" ]]; then
    echo "ERROR: Could not find a reven tarball in ${STAGE3_GITHUB_REPO} releases"
    exit 1
  fi
else
  # arm64 and hardware-specific boards are built and published by this
  # project's chromiumos-stage3 CI workflow (build.yml).
  TARBALL_URL="$(_resolve_tarball_from_github "${THIS_GITHUB_REPO}" "${BOARD}")"
  if [[ -z "${TARBALL_URL}" ]]; then
    echo "ERROR: No pre-built tarball found for board '${BOARD}' in ${THIS_GITHUB_REPO} releases."
    echo ""
    echo "  To build it locally:"
    echo "    cd chromiumos-stage3 && sudo ./build.sh --board ${BOARD}"
    echo "    Then re-run with: --repo file:///path/to/output"
    echo ""
    echo "  Or wait for the weekly chromiumos-stage3 CI run to publish it."
    exit 1
  fi
fi

echo "==> ChromiumOS stage3 → Incus image"
echo "    Board:   ${BOARD}"
echo "    Arch:    ${ARCH}"
echo "    Release: ${RELEASE}"
echo "    Source:  ${TARBALL_URL}"
echo "    Output:  ${OUTPUT_DIR}/${IMAGE_NAME}/"

mkdir -p "${OUTPUT_DIR}/${IMAGE_NAME}"

# ── Download stage3 tarball ───────────────────────────────────────────────────
echo "==> Downloading stage3"
# Detect compression from URL extension
case "${TARBALL_URL}" in
  *.tar.gz)  TARBALL="${WORK_DIR}/chromiumos-stage3.tar.gz"  ;;
  *)         TARBALL="${WORK_DIR}/chromiumos-stage3.tar.xz"  ;;
esac
if [[ "${TARBALL_URL}" == file://* ]]; then
  cp "${TARBALL_URL#file://}" "${TARBALL}"
else
  curl -L --progress-bar "${TARBALL_URL}" -o "${TARBALL}"
fi

# ── Strip build-only artifacts before repackaging ────────────────────────────
# The stage3 contains Portage build infrastructure not needed at container
# runtime. Strip the heaviest directories to reduce image size.
echo "==> Extracting and stripping stage3"
mkdir -p "${WORK_DIR}/rootfs"
case "${TARBALL}" in
  *.tar.gz) tar -xzf "${TARBALL}" -C "${WORK_DIR}/rootfs" ;;
  *)        tar -xJf "${TARBALL}" -C "${WORK_DIR}/rootfs" ;;
esac

# Remove build-time-only paths
for strip_path in \
  var/cache/distfiles \
  var/cache/binpkgs \
  usr/local/portage \
  mnt/host; do
  rm -rf "${WORK_DIR}/rootfs/${strip_path}"
done

# ── Build rootfs tarball ──────────────────────────────────────────────────────
echo "==> Building rootfs.tar.xz"
tar -cJf "${OUTPUT_DIR}/${IMAGE_NAME}/rootfs.tar.xz" \
  -C "${WORK_DIR}/rootfs" \
  --exclude="./proc/*" \
  --exclude="./sys/*" \
  --exclude="./dev/*" \
  --exclude="./run/*" \
  .

# ── Build metadata tarball ────────────────────────────────────────────────────
echo "==> Building metadata.tar.xz"
mkdir -p "${WORK_DIR}/metadata"

cat > "${WORK_DIR}/metadata/metadata.yaml" << METADATA
architecture: "${ARCH}"
creation_date: $(date +%s)
properties:
  description: ChromiumOS ${RELEASE} ${BOARD} build environment
  os: chromiumos
  release: "${RELEASE}"
  variant: default
  architecture: "${ARCH}"
  serial: "${SERIAL}"
  board: "${BOARD}"
templates: {}
METADATA

tar -cJf "${OUTPUT_DIR}/${IMAGE_NAME}/metadata.tar.xz" \
  -C "${WORK_DIR}/metadata" \
  metadata.yaml

# ── Compute hashes ────────────────────────────────────────────────────────────
echo "==> Computing hashes"
sha256sum "${OUTPUT_DIR}/${IMAGE_NAME}/rootfs.tar.xz" \
  | awk '{print $1}' > "${OUTPUT_DIR}/${IMAGE_NAME}/rootfs.tar.xz.sha256"
sha256sum "${OUTPUT_DIR}/${IMAGE_NAME}/metadata.tar.xz" \
  | awk '{print $1}' > "${OUTPUT_DIR}/${IMAGE_NAME}/metadata.tar.xz.sha256"

echo "==> Done"
ls -lh "${OUTPUT_DIR}/${IMAGE_NAME}/"

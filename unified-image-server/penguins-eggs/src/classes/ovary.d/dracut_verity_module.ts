/**
 * ./src/classes/ovary.d/dracut_verity_module.ts
 * penguins-eggs / ecmascript 2020
 * license: MIT
 *
 * Installs dracut modules needed for dm-verity squashfs verification at boot.
 *
 * ChromiumOS live images use dm-verity to verify the squashfs at boot.
 * The initramfs (built by dracut) must include the verity module so it can
 * call veritysetup to verify the squashfs before mounting it.
 *
 * Dynamically imported by produce.ts only when familyId === 'chromiumos'.
 */

import fs from 'node:fs'
import path from 'node:path'
import { exec } from '../../lib/utils.js'
import Utils from '../utils.js'

const DRACUT_MODULE_DIR = '/usr/lib/dracut/modules.d'
const VERITY_MODULE_NAME = '91cros-verity'
const VERITY_MODULE_DIR = path.join(DRACUT_MODULE_DIR, VERITY_MODULE_NAME)

/**
 * Installs all dracut modules required for ChromiumOS verity boot.
 * Creates the module directory and scripts if they don't exist.
 */
export async function installAllVerityModules(echo: object): Promise<void> {
  if (!fs.existsSync(DRACUT_MODULE_DIR)) {
    Utils.warning(`dracut modules directory not found: ${DRACUT_MODULE_DIR}`)
    Utils.warning('Skipping verity dracut module installation')
    return
  }

  await installVerityModule(echo)
  await installLiveVerityHook(echo)
}

/**
 * Installs the cros-verity dracut module.
 * This module calls veritysetup to verify the squashfs root hash at boot.
 */
async function installVerityModule(echo: object): Promise<void> {
  if (fs.existsSync(VERITY_MODULE_DIR)) return

  await exec(`mkdir -p ${VERITY_MODULE_DIR}`, echo)

  // module-setup.sh — tells dracut what to include
  fs.writeFileSync(
    path.join(VERITY_MODULE_DIR, 'module-setup.sh'),
    `#!/bin/bash
# dracut module: cros-verity
# Includes veritysetup and the verity hook in the initramfs.

check() {
    require_binaries veritysetup || return 1
    return 0
}

depends() {
    echo "dm"
    return 0
}

install() {
    inst_multiple veritysetup
    inst_hook pre-mount 50 "$moddir/cros-verity-hook.sh"
}
`
  )

  // cros-verity-hook.sh — runs at pre-mount to verify the squashfs
  fs.writeFileSync(
    path.join(VERITY_MODULE_DIR, 'cros-verity-hook.sh'),
    `#!/bin/bash
# dracut hook: cros-verity pre-mount
# Verifies the live squashfs against the dm-verity root hash embedded
# in the kernel cmdline (verity_squash_root_hash=<hex>).

type getarg > /dev/null 2>&1 || . /lib/dracut-lib.sh

SQUASHFS=/run/initramfs/live/live/filesystem.squashfs
HASH_FILE=/run/initramfs/live/live/filesystem.squashfs.verity
ROOT_HASH=$(getarg verity_squash_root_hash)

if [ -z "$ROOT_HASH" ]; then
    # No root hash in cmdline — verity not required, continue
    exit 0
fi

if [ ! -f "$SQUASHFS" ]; then
    warn "cros-verity: squashfs not found at $SQUASHFS"
    exit 0
fi

if [ ! -f "$HASH_FILE" ]; then
    warn "cros-verity: hash tree not found at $HASH_FILE"
    exit 1
fi

info "cros-verity: verifying squashfs root hash..."
if veritysetup verify "$SQUASHFS" "$HASH_FILE" "$ROOT_HASH"; then
    info "cros-verity: squashfs verified OK"
else
    warn "cros-verity: VERIFICATION FAILED — squashfs may be corrupted or tampered"
    # In strict mode, halt. In permissive mode (cros_debug), warn and continue.
    if getargbool 0 cros_debug; then
        warn "cros-verity: cros_debug set — continuing despite verification failure"
    else
        emergency_shell
    fi
fi
`
  )

  await exec(`chmod +x ${path.join(VERITY_MODULE_DIR, 'module-setup.sh')}`, echo)
  await exec(`chmod +x ${path.join(VERITY_MODULE_DIR, 'cros-verity-hook.sh')}`, echo)
}

/**
 * Installs a dracut hook that mounts the verity hash tree alongside the squashfs.
 * This is a separate hook from the verification step — it handles the case where
 * the hash tree is a separate file rather than appended to the squashfs.
 */
async function installLiveVerityHook(echo: object): Promise<void> {
  const hookDir = path.join(DRACUT_MODULE_DIR, VERITY_MODULE_NAME)
  const hookFile = path.join(hookDir, 'cros-verity-livemount.sh')

  if (fs.existsSync(hookFile)) return

  fs.writeFileSync(
    hookFile,
    `#!/bin/bash
# dracut hook: cros-verity live mount helper
# Ensures the verity hash tree file is accessible alongside the squashfs
# when the live medium is mounted.

type getarg > /dev/null 2>&1 || . /lib/dracut-lib.sh

LIVE_DIR=/run/initramfs/live
SQUASHFS_VERITY="$LIVE_DIR/live/filesystem.squashfs.verity"

# If the hash tree is not present, nothing to do
[ -f "$SQUASHFS_VERITY" ] || exit 0

info "cros-verity: hash tree found at $SQUASHFS_VERITY"
`
  )

  await exec(`chmod +x ${hookFile}`, echo)
}

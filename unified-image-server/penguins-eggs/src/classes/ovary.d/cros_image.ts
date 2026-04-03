/**
 * ./src/classes/ovary.d/cros_image.ts
 * penguins-eggs / ecmascript 2020
 * license: MIT
 *
 * Produces a CrOS-compatible signed kernel image alongside the standard ISO.
 * The output can be dd'd to USB and booted via depthcharge on Chromebooks
 * without requiring custom firmware.
 *
 * Tools required:
 *   futility   — from vboot-utils (signs the kernel blob)
 *   cgpt       — from cgpt package (creates GPT partition table)
 *
 * Dynamically imported by produce.ts only when:
 *   familyId === 'chromiumos' && Utils.commandExists('cgpt')
 */

import fs from 'node:fs'
import path from 'node:path'
import { exec, shx } from '../../lib/utils.js'
import Utils from '../utils.js'

export interface CrosImageOptions {
  vmlinuz: string
  cmdline: string
  squashfs: string
  outputImage: string
  arch: 'x86_64' | 'arm64'
  verbose: boolean
}

/**
 * Returns true if futility (vboot signing tool) is available.
 */
export function hasFutility(): boolean {
  return shx.which('futility') !== null
}

/**
 * Creates a CrOS-compatible signed kernel image.
 *
 * The image contains:
 *   - A GPT partition table (via cgpt)
 *   - A signed kernel blob (vmlinuz + cmdline, signed with futility)
 *   - The squashfs as the root partition
 *
 * This image can be written to USB with dd and booted via depthcharge.
 */
export async function createCrosImage(opts: CrosImageOptions): Promise<void> {
  const { vmlinuz, cmdline, squashfs, outputImage, arch, verbose } = opts
  const echo = Utils.setEcho(verbose)

  const workDir = `/tmp/cros-image-${Date.now()}`
  await exec(`mkdir -p ${workDir}`, echo)

  try {
    // ── 1. Pack the kernel with its cmdline ──────────────────────────────────
    const cmdlineFile = path.join(workDir, 'cmdline')
    fs.writeFileSync(cmdlineFile, cmdline)

    const kernelBlob = path.join(workDir, 'kernel.blob')

    // futility vbutil_kernel packs vmlinuz + cmdline into a CrOS kernel blob
    // Using a test key (insecure) — production use requires real vboot keys.
    const testKeyDir = '/usr/share/vboot/devkeys'
    const keyblock = fs.existsSync(`${testKeyDir}/kernel.keyblock`)
      ? `${testKeyDir}/kernel.keyblock`
      : '/dev/null'
    const signprivate = fs.existsSync(`${testKeyDir}/kernel_data_key.vbprivk`)
      ? `${testKeyDir}/kernel_data_key.vbprivk`
      : '/dev/null'

    const archFlag = arch === 'arm64' ? '--arch arm' : '--arch x86_64'

    await exec(
      `futility vbutil_kernel \
        --pack ${kernelBlob} \
        --keyblock ${keyblock} \
        --signprivate ${signprivate} \
        --version 1 \
        --vmlinuz ${vmlinuz} \
        --config ${cmdlineFile} \
        ${archFlag} \
        --bootloader /dev/zero`,
      echo
    )

    // ── 2. Calculate partition sizes ─────────────────────────────────────────
    const kernelSize = fs.statSync(kernelBlob).size
    const squashfsSize = fs.statSync(squashfs).size

    // Align to 512-byte sectors, add 1 MB padding
    const sectorSize = 512
    const mbInSectors = (1024 * 1024) / sectorSize
    const kernelSectors = Math.ceil(kernelSize / sectorSize) + mbInSectors
    const rootSectors = Math.ceil(squashfsSize / sectorSize) + mbInSectors
    const totalSectors = kernelSectors + rootSectors + 2 * mbInSectors + 34 // GPT overhead

    // ── 3. Create the disk image ─────────────────────────────────────────────
    await exec(
      `dd if=/dev/zero of=${outputImage} bs=512 count=${totalSectors} status=none`,
      echo
    )

    // ── 4. Write GPT partition table ─────────────────────────────────────────
    await exec(`cgpt create ${outputImage}`, echo)

    // Kernel partition (type: ChromeOS kernel)
    const kernelStart = mbInSectors
    await exec(
      `cgpt add -i 1 -t kernel -b ${kernelStart} -s ${kernelSectors} \
        -l "KERN-A" -S 1 -T 5 -P 10 ${outputImage}`,
      echo
    )

    // Root partition (type: ChromeOS rootfs)
    const rootStart = kernelStart + kernelSectors
    await exec(
      `cgpt add -i 2 -t rootfs -b ${rootStart} -s ${rootSectors} \
        -l "ROOT-A" ${outputImage}`,
      echo
    )

    await exec(`cgpt boot -p ${outputImage}`, echo)

    // ── 5. Write kernel and squashfs into partitions ─────────────────────────
    await exec(
      `dd if=${kernelBlob} of=${outputImage} bs=512 seek=${kernelStart} conv=notrunc status=none`,
      echo
    )
    await exec(
      `dd if=${squashfs} of=${outputImage} bs=512 seek=${rootStart} conv=notrunc status=none`,
      echo
    )

    Utils.warning(`CrOS image created: ${outputImage}`)
    Utils.warning(`  Write to USB: sudo dd if=${outputImage} of=/dev/sdX bs=4M status=progress`)
  } finally {
    await exec(`rm -rf ${workDir}`, echo)
  }
}

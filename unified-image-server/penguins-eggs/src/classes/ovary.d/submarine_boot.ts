/**
 * ./src/classes/ovary.d/submarine_boot.ts
 * penguins-eggs / ecmascript 2020
 * license: MIT
 *
 * Submarine depthcharge boot image support.
 *
 * Submarine is a tool that creates a self-contained ChromeOS kernel image
 * that can boot a Linux live system via depthcharge (the ChromeOS bootloader).
 * It wraps a standard Linux kernel + initramfs into a CrOS-signed kernel blob
 * that depthcharge will accept without requiring developer mode.
 *
 * Reference: https://github.com/mikejzx/submarine
 *
 * Tools required:
 *   submarine  — the submarine tool itself
 *   futility   — for signing (from vboot-utils)
 *
 * Dynamically imported by produce.ts only when familyId === 'chromiumos'.
 */

import fs from 'node:fs'
import path from 'node:path'
import { exec, shx } from '../../lib/utils.js'
import Utils from '../utils.js'

export interface SubmarineOptions {
  vmlinuz: string
  initrd: string
  cmdline: string
  outputBlob: string
  arch: 'x86_64' | 'arm64'
  verbose: boolean
}

// produce.ts calls createSubmarineImage with this shape
export interface SubmarineImageOptions {
  arch: 'x86_64' | 'arm64'
  vmlinuz: string
  initramfs: string
  cmdline: string
  squashfs: string
  outputImage: string
  verbose: boolean
}

/**
 * Returns true if the submarine tool is available.
 * Alias: hasSubmarine (internal), isSubmarineAvailable (produce.ts API).
 */
export function hasSubmarine(): boolean {
  return shx.which('submarine') !== null
}

/**
 * Returns true if submarine is available for the given arch.
 * produce.ts calls isSubmarineAvailable(arch).
 */
export function isSubmarineAvailable(arch: 'x86_64' | 'arm64'): boolean {
  // submarine supports both x86_64 and arm64
  void arch
  return hasSubmarine()
}

/**
 * Returns true if depthcharge is the active bootloader on this system.
 * Checks for the ChromeOS firmware identifier in /sys/firmware/dmi.
 */
export function isDepthchargeSystem(): boolean {
  const dmiPaths = [
    '/sys/firmware/dmi/tables/DMI',
    '/sys/class/dmi/id/bios_vendor',
    '/sys/class/dmi/id/sys_vendor',
  ]

  for (const p of dmiPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8').toLowerCase()
        if (content.includes('google') || content.includes('chromebook')) return true
      } catch {
        // binary file or unreadable — skip
      }
    }
  }

  // Check for ChromeOS firmware via crossystem
  if (shx.which('crossystem')) {
    const result = shx.exec('crossystem mainfw_type 2>/dev/null', { silent: true })
    if (result.code === 0 && result.stdout.trim() !== '') return true
  }

  return false
}

/**
 * Creates a Submarine depthcharge boot blob.
 *
 * The blob is a CrOS-signed kernel image that contains:
 *   - The Linux kernel (vmlinuz)
 *   - The initramfs
 *   - The kernel cmdline
 *
 * Depthcharge loads this blob from the KERN-A partition and boots it directly.
 * The live squashfs is loaded by the initramfs from the USB/SD card.
 */
export async function createSubmarineBoot(opts: SubmarineOptions): Promise<void> {
  const { vmlinuz, initrd, cmdline, outputBlob, arch, verbose } = opts
  const echo = Utils.setEcho(verbose)

  if (!hasSubmarine()) {
    Utils.warning('submarine not found — skipping depthcharge boot image')
    Utils.warning('Install submarine: https://github.com/mikejzx/submarine')
    return
  }

  const workDir = `/tmp/submarine-${Date.now()}`
  await exec(`mkdir -p ${workDir}`, echo)

  try {
    const cmdlineFile = path.join(workDir, 'cmdline')
    fs.writeFileSync(cmdlineFile, cmdline)

    const archFlag = arch === 'arm64' ? '--arch arm64' : '--arch x86_64'

    await exec(
      `submarine \
        --kernel ${vmlinuz} \
        --initrd ${initrd} \
        --cmdline ${cmdlineFile} \
        --output ${outputBlob} \
        ${archFlag}`,
      echo
    )

    Utils.warning(`Submarine boot blob created: ${outputBlob}`)
  } finally {
    await exec(`rm -rf ${workDir}`, echo)
  }
}

/**
 * produce.ts API: createSubmarineImage
 * Wraps createSubmarineBoot with the options shape produce.ts passes.
 */
export async function createSubmarineImage(opts: SubmarineImageOptions): Promise<void> {
  return createSubmarineBoot({
    vmlinuz: opts.vmlinuz,
    initrd: opts.initramfs,
    cmdline: opts.cmdline,
    outputBlob: opts.outputImage,
    arch: opts.arch,
    verbose: opts.verbose,
  })
}

/**
 * Returns the kernel cmdline for a ChromiumOS live image.
 *
 * Extends the standard dracut live cmdline (from diversions.ts) with:
 *   - cros_debug: enables ChromeOS debug features
 *   - verity_squash_root_hash: dm-verity root hash (if verity is enabled)
 *   - console=tty1: ensure console output on Chromebook display
 */
export function buildCrosCmdline(opts: {
  volid: string
  rootHash?: string
  extraParams?: string
}): string {
  const { volid, rootHash, extraParams } = opts

  const parts = [
    `root=live:CDLABEL=${volid}`,
    'rd.live.image',
    'rd.live.dir=/live',
    'rd.live.squashimg=filesystem.squashfs',
    'cros_debug',
    'console=tty1',
    'console=ttyS0,115200n8',
  ]

  if (rootHash) {
    parts.push(`verity_squash_root_hash=${rootHash}`)
  }

  if (extraParams) {
    parts.push(extraParams)
  }

  return parts.join(' ')
}

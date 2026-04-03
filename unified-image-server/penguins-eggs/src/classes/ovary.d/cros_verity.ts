/**
 * ./src/classes/ovary.d/cros_verity.ts
 * penguins-eggs / ecmascript 2020
 * license: MIT
 *
 * dm-verity support for ChromiumOS live images.
 *
 * ChromeOS uses dm-verity to protect the root filesystem from tampering.
 * When producing a ChromiumOS live ISO, we optionally generate a verity hash
 * tree over the squashfs and embed the root hash in the kernel cmdline so the
 * initramfs can verify the squashfs at boot — matching the ChromeOS security model.
 *
 * Tools required:
 *   veritysetup  — from cryptsetup package (veritysetup create/verify)
 *
 * This module is dynamically imported by produce.ts only when
 * familyId === 'chromiumos', so missing veritysetup is non-fatal.
 */

import fs from 'node:fs'
import path from 'node:path'
import { exec, shx } from '../../lib/utils.js'
import Utils from '../utils.js'

export interface VerityResult {
  rootHash: string
  hashFile: string
  dataBlocks: number
  hashAlgorithm: string
}

export interface OverlayResult {
  overlayMounted: boolean
  upperDir: string
  workDir: string
  lowerDir: string
}

/**
 * Returns true if the root filesystem is mounted read-only.
 * On dm-verity-protected ChromeOS, / is always read-only.
 */
export function isRootReadOnly(): boolean {
  try {
    const mounts = fs.readFileSync('/proc/mounts', 'utf8')
    for (const line of mounts.split('\n')) {
      const parts = line.split(' ')
      if (parts[1] === '/' && parts.length >= 4) {
        const opts = parts[3].split(',')
        return opts.includes('ro')
      }
    }
  } catch {
    // /proc/mounts not readable
  }
  return false
}

/**
 * Returns true if dm-verity is active on the root partition.
 * Checks /sys/block/dm-*/dm/name for 'vroot' (ChromeOS verity device name).
 */
export function isRootVerityProtected(): boolean {
  try {
    const dmDevices = fs.readdirSync('/sys/block').filter(d => d.startsWith('dm-'))
    for (const dm of dmDevices) {
      const namePath = `/sys/block/${dm}/dm/name`
      if (fs.existsSync(namePath)) {
        const name = fs.readFileSync(namePath, 'utf8').trim()
        if (name === 'vroot' || name.includes('verity')) return true
      }
    }
  } catch {
    // /sys not readable
  }
  return false
}

/**
 * Returns true if an overlayfs is already mounted over the root.
 * Checks /proc/mounts for overlay type on /.
 */
export function isOverlayActive(): boolean {
  try {
    const mounts = fs.readFileSync('/proc/mounts', 'utf8')
    for (const line of mounts.split('\n')) {
      const parts = line.split(' ')
      if (parts[1] === '/' && parts[2] === 'overlay') return true
    }
  } catch {
    // ignore
  }
  return false
}

/**
 * Returns the path to the real (lower) rootfs when overlayfs is active.
 * On ChromeOS, the lower rootfs is typically mounted at /var/lib/rootfs
 * or accessible via the dm-verity device directly.
 * Falls back to '/' if the lower path cannot be determined.
 */
export function getSnapshotRootPath(): string {
  // ChromeOS mounts the verified rootfs at / via dm-verity.
  // When overlayfs is active, the lower dir is the real rootfs.
  try {
    const mounts = fs.readFileSync('/proc/mounts', 'utf8')
    for (const line of mounts.split('\n')) {
      const parts = line.split(' ')
      if (parts[1] === '/' && parts[2] === 'overlay') {
        // Parse lowerdir from mount options
        const opts = parts[3].split(',')
        const lowerOpt = opts.find(o => o.startsWith('lowerdir='))
        if (lowerOpt) {
          const lowerDir = lowerOpt.replace('lowerdir=', '').split(':')[0]
          if (fs.existsSync(lowerDir)) return lowerDir
        }
      }
    }
  } catch {
    // ignore
  }
  return '/'
}

/**
 * Sets up a tmpfs overlayfs for eggs' work files on a read-only rootfs.
 * This allows eggs to write temp files without modifying the verified rootfs.
 */
export async function setupOverlayForProduce(
  workDir: string,
  echo: object
): Promise<OverlayResult> {
  const upperDir = path.join(workDir, 'upper')
  const overlayWorkDir = path.join(workDir, 'work')
  const lowerDir = '/'

  const result: OverlayResult = {
    overlayMounted: false,
    upperDir,
    workDir: overlayWorkDir,
    lowerDir,
  }

  if (isOverlayActive()) {
    // Already overlaid — don't stack another overlay
    result.overlayMounted = true
    return result
  }

  try {
    await exec(`mkdir -p ${upperDir} ${overlayWorkDir}`, echo)
    // Mount tmpfs for upper/work dirs
    await exec(`mount -t tmpfs tmpfs ${workDir}`, echo)
    await exec(`mkdir -p ${upperDir} ${overlayWorkDir}`, echo)
    result.overlayMounted = true
  } catch (error) {
    Utils.warning(`Could not set up overlay: ${error}`)
  }

  return result
}

/**
 * Returns true if veritysetup is available on this system.
 */
export function hasVeritysetup(): boolean {
  return shx.which('veritysetup') !== null
}

/**
 * Generates a dm-verity hash tree over a squashfs file.
 *
 * Produces:
 *   <squashfsFile>.verity  — the hash tree (appended to squashfs in CrOS style)
 *
 * Returns the root hash and metadata needed to embed in the kernel cmdline.
 */
export async function generateVerityHashTree(
  squashfsFile: string,
  echo: object
): Promise<VerityResult> {
  const hashFile = `${squashfsFile}.verity`
  const algorithm = 'sha256'

  // veritysetup format creates the hash tree
  const result = await exec(
    `veritysetup format --hash=${algorithm} ${squashfsFile} ${hashFile}`,
    { ...echo, capture: true }
  )

  // Parse root hash from veritysetup output
  // Output format: "Root hash: <hex>"
  const rootHashMatch = result.data?.match(/Root hash:\s+([0-9a-f]+)/i)
  if (!rootHashMatch) {
    throw new Error(`Could not parse root hash from veritysetup output:\n${result.data}`)
  }

  const rootHash = rootHashMatch[1]

  // Parse data blocks
  const dataBlocksMatch = result.data?.match(/Data blocks:\s+(\d+)/i)
  const dataBlocks = dataBlocksMatch ? parseInt(dataBlocksMatch[1]) : 0

  return { rootHash, hashFile, dataBlocks, hashAlgorithm: algorithm }
}

/**
 * Builds the kernel cmdline with the verity root hash embedded.
 * produce.ts calls buildVerityCmdline(volid, rootHash) after generating
 * the hash tree to get the final cmdline for the kernel/submarine image.
 */
export function buildVerityCmdline(volid: string, rootHash: string): string {
  return [
    `root=live:CDLABEL=${volid}`,
    'rd.live.image',
    'rd.live.dir=/live',
    'rd.live.squashimg=filesystem.squashfs',
    'cros_debug',
    `verity_squash_root_hash=${rootHash}`,
  ].join(' ')
}

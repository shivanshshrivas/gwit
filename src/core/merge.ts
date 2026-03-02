import * as fs from 'fs'
import * as path from 'path'

import { runArgsWithExitCode } from '../lib/shell'
import { isGitIgnored, isGitTracked } from './files'
import { hashFile, readSnapshot, getSnapshotFilePath } from './snapshot'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MergeBackResult {
  /** Worktree-only changes copied directly to main. */
  copied: string[]
  /** Files cleanly merged with `git merge-file`. */
  merged: string[]
  /** Files with conflict markers written by `git merge-file`. */
  conflicts: string[]
  /** Files skipped (unchanged, deleted, convergent, invalid, or out-of-scope). */
  skipped: string[]
  /** Binary files skipped when both sides diverged from base. */
  binarySkipped: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/')
}

function copyFileToMain(worktreeFile: string, mainFile: string): void {
  fs.mkdirSync(path.dirname(mainFile), { recursive: true })
  fs.copyFileSync(worktreeFile, mainFile)
}

function isExistingFile(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
}

/**
 * Detects binary files via null-byte check in the first 8KB.
 * @param filePath - Absolute path to a file.
 * @returns True if the file appears to be binary.
 */
function isBinaryFile(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r')
  const buffer = Buffer.alloc(8192)
  try {
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true
    }
    return false
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Runs git's three-way file merge in place on `mainFile`.
 * @param mainFile - Current file in main worktree (written in-place).
 * @param snapshotFile - Base file captured at worktree creation time.
 * @param worktreeFile - Current file in the linked worktree.
 * @param branch - Branch label used in conflict markers.
 * @returns True when merge produced conflicts, false for a clean merge.
 */
function runGitMergeFile(
  mainFile: string,
  snapshotFile: string,
  worktreeFile: string,
  branch: string
): boolean {
  const result = runArgsWithExitCode('git', [
    'merge-file',
    '-L',
    'main',
    '-L',
    'base',
    '-L',
    branch,
    mainFile,
    snapshotFile,
    worktreeFile,
  ])
  return result.exitCode > 0
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Performs a per-file three-way merge for snapshot-tracked `.gwitinclude` files.
 *
 * Decision summary:
 * - unchanged (`base === main === worktree`) -> skip
 * - worktree-only change (`base === main`) -> copy worktree to main
 * - main-only change (`base === worktree`) -> skip
 * - convergent change (`main === worktree !== base`) -> skip
 * - divergent text (`main !== worktree !== base`) -> `git merge-file`
 * - divergent binary -> skip with binary marker
 *
 * @param worktreePath - Absolute path to source worktree.
 * @param mainPath - Absolute path to destination main worktree.
 * @param slug - Worktree slug used to read its snapshot.
 * @returns Structured merge outcome lists.
 */
export function mergeBackIncludedFiles(
  worktreePath: string,
  mainPath: string,
  slug: string
): MergeBackResult {
  const result: MergeBackResult = {
    copied: [],
    merged: [],
    conflicts: [],
    skipped: [],
    binarySkipped: [],
  }

  const manifest = readSnapshot(slug)
  if (!manifest) return result

  const relPaths = Object.keys(manifest.files).sort()

  for (const rawRelPath of relPaths) {
    const relPath = normalizeRelPath(rawRelPath)
    const base = manifest.files[relPath]
    if (!base) {
      result.skipped.push(relPath)
      continue
    }

    // Keep merge scope constrained to files that are still gitignored in main.
    if (!isGitIgnored(relPath, mainPath) || isGitTracked(relPath, mainPath)) {
      result.skipped.push(relPath)
      continue
    }

    const mainFile = path.resolve(mainPath, relPath)
    const worktreeFile = path.resolve(worktreePath, relPath)
    const snapshotFile = getSnapshotFilePath(slug, relPath)

    // Main deleted the file after snapshot: respect main and do not recreate.
    if (!isExistingFile(mainFile)) {
      result.skipped.push(relPath)
      continue
    }

    // Worktree deleted the file: skip and let user resolve intent manually.
    if (!isExistingFile(worktreeFile)) {
      result.skipped.push(relPath)
      continue
    }

    // Snapshot missing/corrupt for this file means no safe merge base.
    if (!snapshotFile || !isExistingFile(snapshotFile)) {
      result.skipped.push(relPath)
      continue
    }

    const baseHash = base.hash
    const mainHash = hashFile(mainFile)
    const worktreeHash = hashFile(worktreeFile)

    if (baseHash === mainHash && baseHash === worktreeHash) {
      result.skipped.push(relPath)
      continue
    }

    if (baseHash === mainHash) {
      copyFileToMain(worktreeFile, mainFile)
      result.copied.push(relPath)
      continue
    }

    if (baseHash === worktreeHash || mainHash === worktreeHash) {
      result.skipped.push(relPath)
      continue
    }

    if (isBinaryFile(mainFile) || isBinaryFile(worktreeFile) || isBinaryFile(snapshotFile)) {
      result.binarySkipped.push(relPath)
      continue
    }

    const hasConflicts = runGitMergeFile(mainFile, snapshotFile, worktreeFile, manifest.branch)
    if (hasConflicts) {
      result.conflicts.push(relPath)
    } else {
      result.merged.push(relPath)
    }
  }

  return result
}

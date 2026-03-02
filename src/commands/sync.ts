import * as fs from 'fs'

import { GwitError } from '../types'
import { ui } from '../lib/ui'
import { isGitRepo, getMainWorktreePath, getRepoRoot, listWorktrees } from '../core/git'
import { getWorktreeEntry } from '../core/registry'
import { copyIncludedFiles, reverseCopyIncludedFiles } from '../core/files'
import { mergeBackIncludedFiles, type MergeBackResult } from '../core/merge'
import { readSnapshot } from '../core/snapshot'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncOptions {
  /** Three-way merge `.gwitinclude` files back into the main worktree. */
  back?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves the target branch when the user runs `gwit sync` with no argument.
 * Detects the current worktree by comparing the current repo root against the
 * main worktree path — if they differ, we are inside a linked worktree.
 *
 * @param mainPath - Absolute path to the main worktree.
 * @returns The branch name of the current linked worktree.
 * @throws {GwitError} If called from inside the main worktree or a detached HEAD.
 */
function detectCurrentBranch(mainPath: string): string {
  const currentRoot = getRepoRoot()

  if (currentRoot === mainPath) {
    throw new GwitError(
      'No branch specified and you are in the main worktree.',
      'Run: gwit sync <branch>'
    )
  }

  const worktrees = listWorktrees()
  const current = worktrees.find((w) => w.path === currentRoot)

  if (!current) {
    throw new GwitError('Could not detect the current worktree.', 'Run: gwit sync <branch>')
  }

  if (!current.branch) {
    throw new GwitError(
      'Current worktree is in detached HEAD state — cannot determine branch.',
      'Checkout a branch first, or run: gwit sync <branch>'
    )
  }

  return current.branch
}

function logFileList(files: string[]): void {
  files.forEach((f) => ui.dim(`  ${f}`))
}

/**
 * Prints a concise summary for three-way sync-back results.
 * @param result - Merge/copy outcomes from the merge engine.
 */
function reportBackResult(result: MergeBackResult): void {
  if (result.copied.length > 0) {
    ui.success(
      `Copied ${result.copied.length} worktree-only file${result.copied.length === 1 ? '' : 's'}`
    )
    logFileList(result.copied)
  }

  if (result.merged.length > 0) {
    ui.success(
      `Merged ${result.merged.length} file${result.merged.length === 1 ? '' : 's'} cleanly`
    )
    logFileList(result.merged)
  }

  if (result.conflicts.length > 0) {
    ui.warn(
      `Conflicts in ${result.conflicts.length} file${result.conflicts.length === 1 ? '' : 's'} (markers written to main)`
    )
    logFileList(result.conflicts)
  }

  if (result.binarySkipped.length > 0) {
    ui.warn(
      `Skipped ${result.binarySkipped.length} binary file${result.binarySkipped.length === 1 ? '' : 's'} (manual resolution required)`
    )
    logFileList(result.binarySkipped)
  }

  if (result.skipped.length > 0) {
    ui.dim(
      `  skipped ${result.skipped.length} unchanged/main-only file${result.skipped.length === 1 ? '' : 's'}`
    )
  }

  const changed = result.copied.length + result.merged.length + result.conflicts.length
  if (changed === 0 && result.binarySkipped.length === 0) {
    ui.info('Nothing to sync back — no snapshot-tracked files changed.')
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Re-copies files listed in `.gwitinclude` from the main worktree into an
 * existing gwit worktree. Useful when gitignored source files change (e.g.
 * a new key is added to `.env`, certs rotate, or `node_modules` is updated).
 *
 * When `branch` is omitted, gwit detects the current worktree automatically
 * (only works when the shell is already inside a linked worktree).
 *
 * @param branch - Branch name of the target worktree, or undefined to auto-detect.
 * @param options - Sync flags from the CLI invocation.
 */
export function syncCommand(branch?: string, options: SyncOptions = {}): void {
  if (!isGitRepo()) {
    throw new GwitError(
      'Not a git repository.',
      'Run gwit sync from inside a git repo (or any of its worktrees).'
    )
  }

  const mainPath = getMainWorktreePath()
  const targetBranch = branch ?? detectCurrentBranch(mainPath)
  const entry = getWorktreeEntry(mainPath, targetBranch)

  if (!entry) {
    throw new GwitError(
      `No gwit worktree found for '${targetBranch}'.`,
      `Run 'gwit list' to see active worktrees.`
    )
  }

  if (!fs.existsSync(entry.path)) {
    throw new GwitError(
      `Worktree path no longer exists: ${entry.path}`,
      `Run 'gwit remove ${targetBranch}' to clean up the stale registry entry.`
    )
  }

  if (options.back) {
    ui.step(`Syncing .gwitinclude back to main from ${entry.path}…`)

    const snapshot = readSnapshot(entry.slug)
    if (!snapshot) {
      ui.warn(`No snapshot found for '${targetBranch}' — falling back to direct copy.`)
      const copiedBack = reverseCopyIncludedFiles(entry.path, mainPath)
      if (copiedBack.length > 0) {
        ui.success(`Synced ${copiedBack.length} file${copiedBack.length === 1 ? '' : 's'} back`)
        logFileList(copiedBack)
      } else {
        ui.info('Nothing to sync back — no .gwitinclude entries were copied.')
      }
      return
    }

    const result = mergeBackIncludedFiles(entry.path, mainPath, entry.slug)
    reportBackResult(result)
    return
  }

  ui.step(`Syncing .gwitinclude into ${entry.path}…`)
  const copied = copyIncludedFiles(mainPath, entry.path)

  if (copied.length > 0) {
    ui.success(`Synced ${copied.length} file${copied.length === 1 ? '' : 's'}`)
    logFileList(copied)
  } else {
    ui.info('Nothing to sync — no .gwitinclude entries were copied.')
  }
}

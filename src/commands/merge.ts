import * as fs from 'fs'

import { GwitError } from '../types'
import { ui } from '../lib/ui'
import { runArgs } from '../lib/shell'
import {
  isGitRepo,
  getMainWorktreePath,
  hasUncommittedChanges,
  getDefaultBranch,
  mergeBranch,
  squashMergeBranch,
  rebaseBranch,
  ffMergeBranch,
  commitMerge,
  removeWorktree,
} from '../core/git'
import { buildEnvironment } from '../core/env'
import { runCleanupHooks } from '../core/hooks'
import { getWorktreeEntry, removeWorktreeEntry } from '../core/registry'
import { reverseCopyIncludedFiles } from '../core/files'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MergeOptions {
  /** Target branch to merge into (default: repo's default branch). */
  into?: string
  /** Squash all commits into one before merging. */
  squash?: boolean
  /** Rebase feature onto target, then fast-forward. */
  rebase?: boolean
  /** Force a merge commit even when fast-forward is possible. */
  noFf?: boolean
  /** Remove worktree + run .gwitcleanup after successful merge. */
  cleanup?: boolean
  /** Skip reverse-copying .gwitinclude files. */
  syncBack?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Executes the git merge using the selected strategy.
 *
 * @param mainPath - Absolute path to the main worktree (merge target).
 * @param worktreePath - Absolute path to the feature worktree.
 * @param branch - The feature branch name.
 * @param target - The target branch name.
 * @param options - Merge strategy flags.
 */
function executeMerge(
  mainPath: string,
  worktreePath: string,
  branch: string,
  target: string,
  options: MergeOptions
): void {
  try {
    if (options.squash) {
      ui.step(`Squash merging '${branch}' into '${target}'…`)
      squashMergeBranch(mainPath, branch)
      commitMerge(mainPath, `Squash merge branch '${branch}'`)
    } else if (options.rebase) {
      ui.step(`Rebasing '${branch}' onto '${target}'…`)
      rebaseBranch(worktreePath, target)
      ui.step(`Fast-forwarding '${target}' to '${branch}'…`)
      ffMergeBranch(mainPath, branch)
    } else {
      ui.step(`Merging '${branch}' into '${target}'…`)
      mergeBranch(mainPath, branch, options.noFf ?? false)
    }
  } catch {
    throw new GwitError(
      `Merge conflict while merging '${branch}' into '${target}'.`,
      `Resolve conflicts in ${mainPath}, then run: git merge --continue`
    )
  }
}

/**
 * Runs cleanup hooks and removes the worktree + registry entry.
 * Reuses the same pattern as `gwit remove`.
 *
 * @param mainPath - Absolute path to the main worktree.
 * @param worktreePath - Absolute path to the worktree to remove.
 * @param branch - The branch name for registry lookup.
 * @param port - The port number for user feedback.
 */
async function cleanupWorktree(
  mainPath: string,
  worktreePath: string,
  branch: string,
  port: number
): Promise<void> {
  const entry = getWorktreeEntry(mainPath, branch)
  if (entry) {
    const env = buildEnvironment(
      entry.branch,
      entry.slug,
      entry.port,
      worktreePath,
      mainPath,
      entry.index
    )
    runCleanupHooks(mainPath, worktreePath, env)
  }

  ui.step(`Removing worktree at ${worktreePath}…`)
  if (fs.existsSync(worktreePath)) {
    removeWorktree(worktreePath, true)
  } else {
    runArgs('git', ['worktree', 'prune'])
  }

  await removeWorktreeEntry(mainPath, branch)
  ui.success(`Cleaned up worktree for '${branch}' (port ${port} freed)`)
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Merges a worktree branch back into the target branch (default: repo default).
 * Optionally reverse-copies .gwitinclude files and removes the worktree after.
 *
 * Flow: guards → resolve target → sync back .gwitinclude → git merge → cleanup.
 *
 * @param branch - Branch name of the worktree to merge.
 * @param options - Merge flags from the CLI invocation.
 */
export async function mergeCommand(branch: string, options: MergeOptions): Promise<void> {
  // ── Pre-flight ────────────────────────────────────────────────────────────

  if (!isGitRepo()) {
    throw new GwitError(
      'Not a git repository.',
      'Run gwit merge from inside a git repo (or any of its worktrees).'
    )
  }

  const mainPath = getMainWorktreePath()
  const entry = getWorktreeEntry(mainPath, branch)

  if (!entry) {
    throw new GwitError(
      `No gwit worktree found for '${branch}'.`,
      `Run 'gwit list' to see active worktrees.`
    )
  }

  if (!fs.existsSync(entry.path)) {
    throw new GwitError(
      `Worktree path no longer exists: ${entry.path}`,
      `Run 'gwit remove ${branch}' to clean up the stale registry entry.`
    )
  }

  if (hasUncommittedChanges(entry.path)) {
    throw new GwitError(
      `Worktree for '${branch}' has uncommitted changes.`,
      'Commit or stash changes in the worktree first, then retry.'
    )
  }

  // ── Resolve target branch ────────────────────────────────────────────────

  const target = options.into ?? getDefaultBranch()
  ui.info(`Target branch: ${ui.bold(target)}`)

  // ── Sync back .gwitinclude files ─────────────────────────────────────────

  if (options.syncBack !== false) {
    ui.step('Syncing .gwitinclude files back to main…')
    const copied = reverseCopyIncludedFiles(entry.path, mainPath)
    if (copied.length > 0) {
      ui.success(`Synced ${copied.length} file${copied.length === 1 ? '' : 's'} back`)
      copied.forEach((f) => ui.dim(`  ${f}`))
    } else {
      ui.dim('  No .gwitinclude files to sync back')
    }
  }

  // ── Git merge ────────────────────────────────────────────────────────────

  executeMerge(mainPath, entry.path, branch, target, options)
  ui.success(`Merged '${branch}' into '${target}'`)

  // ── Cleanup ──────────────────────────────────────────────────────────────

  if (options.cleanup) {
    await cleanupWorktree(mainPath, entry.path, branch, entry.port)
  }
}

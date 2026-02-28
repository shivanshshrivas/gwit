import * as fs from 'fs'

import { GwitError } from '../types'
import { ui } from '../lib/ui'
import { runArgs } from '../lib/shell'
import {
  isGitRepo,
  getMainWorktreePath,
  listWorktrees,
  hasUncommittedChanges,
  removeWorktree,
} from '../core/git'
import { buildEnvironment } from '../core/env'
import { runCleanupHooks } from '../core/hooks'
import { getWorktreeEntry, removeWorktreeEntry } from '../core/registry'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RemoveOptions {
  /** Skip the uncommitted-changes guard. */
  force?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Handles removal of a worktree that exists in git but not in the gwit registry
 * (e.g. created before gwit was adopted, or before Phase 4). Skips hooks since
 * no registry entry means no env vars to inject.
 *
 * @param branch - Branch name to remove.
 * @param force - Passed through to git worktree remove.
 */
function removeUnregisteredWorktree(branch: string, force: boolean): void {
  const worktrees = listWorktrees()
  const match = worktrees.find((w) => w.branch === branch)

  if (!match) {
    throw new GwitError(
      `No worktree found for branch '${branch}'.`,
      `Use 'git worktree list' to see all worktrees.`
    )
  }

  ui.warn(`Branch '${branch}' is not in the gwit registry — skipping cleanup hooks.`)
  ui.step(`Removing worktree at ${match.path}…`)
  removeWorktree(match.path, force)
  ui.success(`Removed worktree for '${branch}'`)
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Removes a gwit-managed worktree:
 *   1. Runs `.gwitcleanup` hooks with `$GWIT_*` env vars injected
 *   2. Removes the worktree directory via `git worktree remove`
 *   3. Deletes the entry from `~/.gwit/worktrees.json`
 *
 * If the worktree directory is already gone, prunes git's bookkeeping instead.
 * If the branch is not in the registry, removes the worktree without hooks.
 *
 * @param branch - Branch name of the worktree to remove.
 * @param options - Command flags.
 */
export async function removeCommand(branch: string, options: RemoveOptions): Promise<void> {
  // ── Pre-flight ────────────────────────────────────────────────────────────

  if (!isGitRepo()) {
    throw new GwitError(
      'Not a git repository.',
      'Run gwit from inside a git repo (or any of its worktrees).'
    )
  }

  const force = options.force ?? false
  const mainPath = getMainWorktreePath()
  const entry = getWorktreeEntry(mainPath, branch)

  if (!entry) {
    removeUnregisteredWorktree(branch, force)
    return
  }

  const worktreePath = entry.path

  // ── Uncommitted-changes guard ─────────────────────────────────────────────

  if (!force && fs.existsSync(worktreePath) && hasUncommittedChanges(worktreePath)) {
    throw new GwitError(
      `Worktree '${branch}' has uncommitted changes.`,
      `Use 'gwit remove ${branch} --force' to remove anyway, or commit first.`
    )
  }

  // ── Cleanup hooks ─────────────────────────────────────────────────────────

  const env = buildEnvironment(
    entry.branch,
    entry.slug,
    entry.port,
    worktreePath,
    mainPath,
    entry.index
  )
  runCleanupHooks(mainPath, worktreePath, env)

  // ── Remove worktree ───────────────────────────────────────────────────────

  ui.step(`Removing worktree at ${worktreePath}…`)

  if (fs.existsSync(worktreePath)) {
    removeWorktree(worktreePath, force)
  } else {
    // Directory already gone — prune git's internal bookkeeping
    runArgs('git', ['worktree', 'prune'])
    ui.dim('  (directory not found — pruned git bookkeeping)')
  }

  // ── Update registry ───────────────────────────────────────────────────────

  await removeWorktreeEntry(mainPath, branch)
  ui.success(`Removed worktree for '${branch}' (port ${entry.port} freed)`)
}

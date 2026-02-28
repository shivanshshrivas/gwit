import * as fs from 'fs'

import { GwitError } from '../types'
import { ui } from '../lib/ui'
import { isGitRepo, getMainWorktreePath, getRepoRoot, listWorktrees } from '../core/git'
import { getWorktreeEntry } from '../core/registry'
import { copyIncludedFiles } from '../core/files'

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
 */
export function syncCommand(branch?: string): void {
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

  ui.step(`Syncing .gwitinclude into ${entry.path}…`)
  const copied = copyIncludedFiles(mainPath, entry.path)

  if (copied.length > 0) {
    ui.success(`Synced ${copied.length} file${copied.length === 1 ? '' : 's'}`)
    copied.forEach((f) => ui.dim(`  ${f}`))
  } else {
    ui.info('Nothing to sync — no .gwitinclude entries were copied.')
  }
}

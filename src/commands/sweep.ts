import * as fs from 'fs'

import inquirer from 'inquirer'

import { type WorktreeEntry, GwitError } from '../types'
import { ui } from '../lib/ui'
import { runArgs } from '../lib/shell'
import {
  isGitRepo,
  getMainWorktreePath,
  getDefaultBranch,
  isBranchMerged,
  removeWorktree,
} from '../core/git'
import { buildEnvironment } from '../core/env'
import { runCleanupHooks } from '../core/hooks'
import { listWorktreeEntries, removeWorktreeEntry } from '../core/registry'
import { isGhAvailable, getPrInfo } from '../core/gh'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SweepOptions {
  /** Show what would be removed without removing anything. */
  dryRun?: boolean
  /** Skip confirmation prompt. */
  force?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the branch should be swept — either git-merged into the
 * default branch, or the associated PR is merged/closed.
 *
 * @param branch - The branch name to check.
 * @param defaultBranch - The repo's default branch.
 * @param ghAvailable - Whether the gh CLI is available.
 * @returns True if the branch is sweepable.
 */
function isSweepable(branch: string, defaultBranch: string, ghAvailable: boolean): boolean {
  if (isBranchMerged(branch, defaultBranch)) return true

  if (ghAvailable) {
    const pr = getPrInfo(branch)
    if (pr && (pr.state === 'MERGED' || pr.state === 'CLOSED')) return true
  }

  return false
}

/**
 * Removes a single worktree with cleanup hooks and registry update.
 *
 * @param entry - The worktree entry to remove.
 * @param mainPath - Absolute path to the main worktree.
 */
async function sweepEntry(entry: WorktreeEntry, mainPath: string): Promise<void> {
  // Run cleanup hooks
  const env = buildEnvironment(
    entry.branch,
    entry.slug,
    entry.port,
    entry.path,
    mainPath,
    entry.index
  )
  runCleanupHooks(mainPath, entry.path, env)

  // Remove worktree
  if (fs.existsSync(entry.path)) {
    removeWorktree(entry.path, true)
  } else {
    runArgs('git', ['worktree', 'prune'])
  }

  // Update registry
  await removeWorktreeEntry(mainPath, entry.branch)
  ui.success(`Removed '${entry.branch}' (port ${entry.port} freed)`)
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Removes worktrees whose branches are fully merged into the default branch
 * or whose PRs are merged/closed. Prompts for confirmation unless --force.
 *
 * @param options - Command flags.
 */
export async function sweepCommand(options: SweepOptions): Promise<void> {
  if (!isGitRepo()) {
    throw new GwitError(
      'Not a git repository.',
      'Run gwit sweep from inside a git repo (or any of its worktrees).'
    )
  }

  const mainPath = getMainWorktreePath()
  const entries = listWorktreeEntries(mainPath)

  if (entries.length === 0) {
    ui.info('No active gwit worktrees to sweep.')
    return
  }

  const defaultBranch = getDefaultBranch()
  const ghAvail = isGhAvailable()

  // Find sweepable entries
  const sweepable = entries.filter((e) => isSweepable(e.branch, defaultBranch, ghAvail))

  if (sweepable.length === 0) {
    ui.info('No merged worktrees found to sweep.')
    return
  }

  // Display candidates
  console.log()
  ui.info(`Found ${sweepable.length} merged worktree${sweepable.length === 1 ? '' : 's'}:`)
  for (const entry of sweepable) {
    ui.dim(`  ${entry.branch} (port ${entry.port})`)
  }
  console.log()

  // Dry run — show and exit
  if (options.dryRun) {
    ui.info('Dry run — no worktrees were removed.')
    return
  }

  // Confirm unless --force
  if (!options.force) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Remove ${sweepable.length} worktree${sweepable.length === 1 ? '' : 's'}?`,
        default: false,
      },
    ])
    if (!confirm) {
      ui.info('Sweep cancelled.')
      return
    }
  }

  // Remove each
  for (const entry of sweepable) {
    await sweepEntry(entry, mainPath)
  }

  ui.success(`Swept ${sweepable.length} worktree${sweepable.length === 1 ? '' : 's'}`)
}

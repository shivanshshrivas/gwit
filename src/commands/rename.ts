import { GwitError } from '../types'
import { ui } from '../lib/ui'
import { toSlug } from '../lib/slug'
import { getWorktreePath } from '../lib/paths'
import { isGitRepo, getMainWorktreePath, renameBranch, moveWorktree } from '../core/git'
import { loadConfig } from '../core/config'
import { getWorktreeEntry, removeWorktreeEntry, addWorktreeEntry } from '../core/registry'
import { renameSnapshot } from '../core/snapshot'

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Renames a gwit-managed worktree: updates the git branch name, moves the
 * worktree directory (if the slug changed), and updates the registry.
 *
 * @param oldBranch - Current branch name.
 * @param newBranch - New branch name.
 */
export async function renameCommand(oldBranch: string, newBranch: string): Promise<void> {
  // ── Pre-flight ────────────────────────────────────────────────────────────

  if (!isGitRepo()) {
    throw new GwitError(
      'Not a git repository.',
      'Run gwit rename from inside a git repo (or any of its worktrees).'
    )
  }

  const mainPath = getMainWorktreePath()
  const entry = getWorktreeEntry(mainPath, oldBranch)

  if (!entry) {
    throw new GwitError(
      `No gwit worktree found for '${oldBranch}'.`,
      `Run 'gwit list' to see active worktrees.`
    )
  }

  const existingNew = getWorktreeEntry(mainPath, newBranch)
  if (existingNew) {
    throw new GwitError(
      `A worktree already exists for '${newBranch}'.`,
      `Remove it first: gwit remove ${newBranch}`
    )
  }

  // ── Rename git branch ──────────────────────────────────────────────────

  ui.step(`Renaming branch '${oldBranch}' → '${newBranch}'…`)
  renameBranch(oldBranch, newBranch)

  // ── Move worktree directory if slug changed ──────────────────────────────

  const oldSlug = entry.slug
  const newSlug = toSlug(newBranch)
  let newPath = entry.path

  if (oldSlug !== newSlug) {
    const config = loadConfig()
    newPath = getWorktreePath(mainPath, config.location, newSlug)
    ui.step(`Moving worktree to ${newPath}…`)
    moveWorktree(entry.path, newPath)
    renameSnapshot(oldSlug, newSlug)
  }

  // ── Update registry ──────────────────────────────────────────────────────

  await removeWorktreeEntry(mainPath, oldBranch)
  await addWorktreeEntry(mainPath, {
    ...entry,
    branch: newBranch,
    slug: newSlug,
    path: newPath,
  })

  ui.success(`Renamed '${oldBranch}' → '${newBranch}'`)
  if (oldSlug !== newSlug) {
    ui.info(`Slug   ${ui.bold(oldSlug)} → ${ui.bold(newSlug)}`)
    ui.info(`Path   ${ui.bold(newPath)}`)
  }
}

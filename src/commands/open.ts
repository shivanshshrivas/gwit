import { GwitError } from '../types'
import { ui } from '../lib/ui'
import { isGitRepo, getMainWorktreePath } from '../core/git'
import { loadConfig } from '../core/config'
import { getWorktreeEntry } from '../core/registry'
import { launchEditor } from '../core/editor'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OpenOptions {
  /** Override the editor for this invocation only. */
  editor?: string
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Re-opens the editor for an already-existing gwit worktree.
 * Useful when the editor window was closed and you want it back without
 * re-running `gwit create`.
 *
 * @param branch - Branch name of the worktree to open.
 * @param options - Optional editor override.
 */
export function openCommand(branch: string, options: OpenOptions): void {
  if (!isGitRepo()) {
    throw new GwitError(
      'Not a git repository.',
      'Run gwit open from inside a git repo (or any of its worktrees).'
    )
  }

  const mainPath = getMainWorktreePath()
  const entry = getWorktreeEntry(mainPath, branch)

  if (!entry) {
    throw new GwitError(
      `No gwit worktree found for '${branch}'.`,
      `Run 'gwit list' to see active worktrees, or 'gwit create ${branch}' to create one.`
    )
  }

  const config = loadConfig()
  const editorName = options.editor ?? config.editor

  ui.step(`Opening ${editorName} at ${entry.path}…`)
  launchEditor(editorName, entry.path)
}

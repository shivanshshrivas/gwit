import { type WorktreeEntry, GwitError } from '../types'
import { toSlug } from '../lib/slug'
import { getWorktreePath } from '../lib/paths'
import { ui } from '../lib/ui'
import {
  isGitRepo,
  getMainWorktreePath,
  branchExistsLocal,
  branchExistsRemote,
  worktreeExistsForBranch,
  fetchOrigin,
  addWorktree,
} from '../core/git'
import { ensureConfig } from '../core/config'
import { copyIncludedFiles } from '../core/files'
import { allocatePort } from '../core/ports'
import { buildEnvironment } from '../core/env'
import { peekNextIndex, addWorktreeEntry } from '../core/registry'
import { runSetupHooks } from '../core/hooks'
import { launchEditor } from '../core/editor'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateOptions {
  /** True when the `-b` flag is passed — creates a new branch from HEAD. */
  b?: boolean
  /**
   * `string` to override the editor, `false` when `--no-editor` is passed,
   * `undefined` to use the value from config.
   */
  editor?: string | boolean
  /** False when `--no-commands` is passed. Unused until Phase 5 (hooks). */
  commands?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validates that the branch exists (locally or remotely) when `-b` is not set.
 * Prints an informational message for remote-only branches since git will
 * automatically create a local tracking branch via DWIM.
 *
 * @param branch - The branch name provided by the user.
 * @param isNew - True when the `-b` flag was passed.
 * @throws {GwitError} If the branch doesn't exist and `-b` was not passed.
 */
function assertBranchResolvable(branch: string, isNew: boolean): void {
  if (isNew) return

  if (branchExistsLocal(branch)) return

  if (branchExistsRemote(branch)) {
    ui.dim(`  Branch '${branch}' not found locally — git will track it from origin.`)
    return
  }

  throw new GwitError(
    `Branch '${branch}' not found locally or on remote.`,
    `Use 'gwit -b ${branch}' to create a new branch.`
  )
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Creates a new isolated git worktree for the given branch.
 *
 * Flow: pre-flight → config → worktree → file copy → port → env →
 *       registry → [Phase 5: hooks] → editor.
 *
 * The registry is written AFTER hooks will run (Phase 5) so that a failed
 * hook does not leave behind a registry entry for a broken environment.
 *
 * @param branch - Branch name to check out (or create with `options.b`).
 * @param options - Flags from the CLI invocation.
 */
export async function createCommand(branch: string, options: CreateOptions): Promise<void> {
  // ── Pre-flight checks ─────────────────────────────────────────────────────

  if (!isGitRepo()) {
    throw new GwitError(
      'Not a git repository.',
      'Run gwit from inside a git repo (or any of its worktrees).'
    )
  }

  const isNew = options.b === true

  if (worktreeExistsForBranch(branch)) {
    throw new GwitError(
      `A worktree for '${branch}' already exists.`,
      `Use 'gwit remove ${branch}' to remove it first.`
    )
  }

  assertBranchResolvable(branch, isNew)

  // ── Fetch remote refs so git worktree DWIM can set up tracking ──────────

  if (!isNew && !branchExistsLocal(branch)) {
    ui.step('Fetching from origin…')
    fetchOrigin()
  }

  // ── Config & path resolution ──────────────────────────────────────────────

  const config = await ensureConfig()
  const mainPath = getMainWorktreePath()
  const slug = toSlug(branch)
  const worktreePath = getWorktreePath(mainPath, config.location, slug)

  // ── Create worktree ───────────────────────────────────────────────────────

  ui.step(isNew ? `Creating new branch '${branch}'…` : `Checking out '${branch}'…`)
  addWorktree(worktreePath, branch, isNew)
  ui.success(`Worktree ready at ${ui.bold(worktreePath)}`)

  // ── Copy gitignored files ─────────────────────────────────────────────────

  const copied = copyIncludedFiles(mainPath, worktreePath)
  if (copied.length > 0) {
    ui.success(`Copied ${copied.length} file${copied.length === 1 ? '' : 's'} from .gwitinclude`)
    copied.forEach((f) => ui.dim(`  ${f}`))
  }

  // ── Port & environment ────────────────────────────────────────────────────

  const port = await allocatePort(config.basePort)
  const index = peekNextIndex(mainPath)
  const env = buildEnvironment(branch, slug, port, worktreePath, mainPath, index)

  // ── Setup hooks ───────────────────────────────────────────────────────────

  // Hooks run before the registry is written so a failed hook does not leave
  // behind an entry for a broken environment. The worktree itself remains and
  // the user can cd in to debug.
  if (options.commands !== false) {
    runSetupHooks(mainPath, worktreePath, env)
  }

  // ── Write registry ────────────────────────────────────────────────────────

  const entry: WorktreeEntry = {
    path: worktreePath,
    port,
    branch,
    slug,
    index,
    createdAt: new Date().toISOString(),
  }
  await addWorktreeEntry(mainPath, entry)

  // ── Summary ───────────────────────────────────────────────────────────────

  ui.info(`Port   ${ui.bold(env.GWIT_PORT)}`)
  ui.info(`Slug   ${ui.bold(env.GWIT_SLUG)}`)
  ui.info(`Index  ${ui.bold(env.GWIT_INDEX)}`)

  // ── Open editor ───────────────────────────────────────────────────────────

  if (options.editor !== false) {
    const editorName = typeof options.editor === 'string' ? options.editor : config.editor
    ui.step(`Opening ${editorName}…`)
    launchEditor(editorName, worktreePath)
  }
}

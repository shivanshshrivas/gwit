import { runArgs, runArgsInherited, runArgsSafe, runSafe } from '../lib/shell'
import { GwitError } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorktreeInfo {
  /** Absolute path to the worktree directory. */
  path: string
  /** Full commit SHA the worktree is on. */
  head: string
  /** Short branch name (e.g. "main"), or null for detached HEAD. */
  branch: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses the output of `git worktree list --porcelain` into structured objects.
 * Exported with `_` prefix for unit testing only.
 *
 * @param output - Raw stdout from `git worktree list --porcelain`.
 * @returns Array of worktree info objects.
 */
export function _parseWorktreePorcelain(output: string): WorktreeInfo[] {
  // Blocks are separated by blank lines; each block describes one worktree
  const blocks = output.trim().split(/\n\n+/)

  return blocks
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n')
      const path = lines.find((l) => l.startsWith('worktree '))?.slice(9) ?? ''
      const head = lines.find((l) => l.startsWith('HEAD '))?.slice(5) ?? ''
      const branchLine = lines.find((l) => l.startsWith('branch '))
      // Strip refs/heads/ prefix to get the short branch name
      const branch = branchLine ? branchLine.slice(7).replace('refs/heads/', '') : null
      return { path, head, branch }
    })
    .filter((w) => w.path.length > 0)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the current working directory is inside a git repository.
 * @returns True if inside a git repo, false otherwise.
 */
export function isGitRepo(): boolean {
  return runSafe('git rev-parse --is-inside-work-tree').success
}

/**
 * Returns the root directory of the current worktree (where .git or
 * .git file lives). Use `getMainWorktreePath` to get the primary repo root.
 *
 * @returns Absolute path to the current worktree root.
 */
export function getRepoRoot(): string {
  return runArgs('git', ['rev-parse', '--show-toplevel'])
}

/**
 * Returns the absolute path of the main (primary) worktree by reading the
 * first entry from `git worktree list --porcelain`.
 *
 * @returns Absolute path to the main worktree directory.
 */
export function getMainWorktreePath(): string {
  const output = runArgs('git', ['worktree', 'list', '--porcelain'])
  const list = _parseWorktreePorcelain(output)
  const main = list[0]
  if (!main) {
    throw new GwitError('Could not determine main worktree path.')
  }
  return main.path
}

/**
 * Returns all worktrees (main + linked) for the current repo.
 * @returns Array of WorktreeInfo objects.
 */
export function listWorktrees(): WorktreeInfo[] {
  const output = runArgs('git', ['worktree', 'list', '--porcelain'])
  return _parseWorktreePorcelain(output)
}

/**
 * Returns true if a worktree is already checked out on the given branch.
 * @param branch - The branch name to look up.
 * @returns True if any worktree is currently on this branch.
 */
export function worktreeExistsForBranch(branch: string): boolean {
  return listWorktrees().some((w) => w.branch === branch)
}

/**
 * Returns true if the branch exists in the local repo.
 * @param branch - Branch name to check.
 * @returns True if the branch exists locally.
 */
export function branchExistsLocal(branch: string): boolean {
  const output = runArgs('git', ['branch', '--list', branch])
  return output.length > 0
}

/**
 * Returns true if the branch exists on the `origin` remote.
 * Returns false (not throws) if origin is unreachable.
 *
 * @param branch - Branch name to check.
 * @returns True if the branch exists on origin.
 */
export function branchExistsRemote(branch: string): boolean {
  // runArgsSafe (array args) prevents shell injection via branch names like
  // "origin; rm -rf ~" — never interpolate user input into execSync strings
  const result = runArgsSafe('git', ['ls-remote', '--heads', 'origin', branch])
  return result.success && result.stdout.length > 0
}

/**
 * Fetches all refs from the origin remote so that DWIM branch tracking works
 * when creating a worktree for a remote-only branch.
 */
export function fetchOrigin(): void {
  runArgsInherited('git', ['fetch', 'origin'])
}

/**
 * Creates a new linked worktree at the given path.
 * Uses argument arrays throughout to prevent shell injection.
 *
 * @param worktreePath - Absolute path where the worktree will be created.
 * @param branch - Branch name to check out (or create with `isNew`).
 * @param isNew - If true, creates a new branch from HEAD via `-b`.
 */
export function addWorktree(worktreePath: string, branch: string, isNew: boolean): void {
  const args = isNew
    ? ['worktree', 'add', '-b', branch, worktreePath]
    : ['worktree', 'add', worktreePath, branch]

  runArgsInherited('git', args)
}

/**
 * Removes a linked worktree and cleans up the admin files inside `.git`.
 * Does not delete the local branch.
 *
 * @param worktreePath - Absolute path to the worktree to remove.
 * @param force - If true, removes even when the worktree has uncommitted changes.
 */
export function removeWorktree(worktreePath: string, force = false): void {
  const args = ['worktree', 'remove', worktreePath]
  if (force) args.push('--force')
  runArgsInherited('git', args)
}

/**
 * Returns true if the given worktree directory has uncommitted changes.
 * Uses argument arrays to safely handle paths containing spaces.
 *
 * @param worktreePath - Absolute path to the worktree to inspect.
 * @returns True if there are staged or unstaged changes.
 */
export function hasUncommittedChanges(worktreePath: string): boolean {
  const result = runArgsSafe('git', ['-C', worktreePath, 'status', '--porcelain'])
  return result.success && result.stdout.length > 0
}

/**
 * Returns true if the given branch has been merged into the target ref.
 *
 * @param branch - The branch to check.
 * @param into - The ref to check against (e.g. "main").
 * @returns True if branch is fully merged into the target.
 */
export function isBranchMerged(branch: string, into: string): boolean {
  // Use array args to prevent injection via the `into` ref (e.g. "main; evil")
  const result = runArgsSafe('git', ['branch', '--merged', into])
  if (!result.success) return false
  return result.stdout.split('\n').some((line) => line.trim().replace(/^\*\s*/, '') === branch)
}

/**
 * Detects the default branch of the repository (e.g. "main" or "master").
 * Tries `git symbolic-ref refs/remotes/origin/HEAD` first, then falls back
 * to checking if "main" or "master" exist locally.
 *
 * @returns The name of the default branch.
 * @throws {GwitError} If the default branch cannot be determined.
 */
export function getDefaultBranch(): string {
  // Try the remote HEAD symref (most reliable when origin is configured)
  const symref = runArgsSafe('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'])
  if (symref.success && symref.stdout.length > 0) {
    // Output is "refs/remotes/origin/main" — extract the branch name
    return symref.stdout.replace('refs/remotes/origin/', '')
  }

  // Fallback: check for common default branch names
  if (branchExistsLocal('main')) return 'main'
  if (branchExistsLocal('master')) return 'master'

  throw new GwitError(
    'Could not determine the default branch.',
    "Specify the target explicitly: gwit merge <branch> --into main"
  )
}

/**
 * Returns how many commits a branch is ahead and behind relative to a base.
 *
 * @param branch - The branch to measure.
 * @param base - The reference branch (e.g. "main").
 * @param cwd - Optional working directory for the git command.
 * @returns Object with ahead and behind counts.
 */
export function getAheadBehind(
  branch: string,
  base: string,
  cwd?: string
): { ahead: number; behind: number } {
  const args = cwd
    ? ['-C', cwd, 'rev-list', '--left-right', '--count', `${base}...${branch}`]
    : ['rev-list', '--left-right', '--count', `${base}...${branch}`]

  const result = runArgsSafe('git', args)
  if (!result.success) return { ahead: 0, behind: 0 }

  // Output format: "3\t5" where left (base ahead) = behind, right (branch ahead) = ahead
  const parts = result.stdout.split('\t')
  return {
    behind: parseInt(parts[0] ?? '0', 10) || 0,
    ahead: parseInt(parts[1] ?? '0', 10) || 0,
  }
}

/**
 * Merges a branch into the working tree at `cwd`.
 *
 * @param cwd - Working directory where the merge happens (target worktree).
 * @param branch - The branch to merge in.
 * @param noFf - If true, forces a merge commit even for fast-forward merges.
 */
export function mergeBranch(cwd: string, branch: string, noFf = false): void {
  const args = ['-C', cwd, 'merge', branch]
  if (noFf) args.splice(3, 0, '--no-ff')
  runArgsInherited('git', args)
}

/**
 * Performs a squash merge of a branch into the working tree at `cwd`.
 * Stages all changes but does NOT create the commit — call `commitMerge` after.
 *
 * @param cwd - Working directory where the merge happens (target worktree).
 * @param branch - The branch to squash-merge.
 */
export function squashMergeBranch(cwd: string, branch: string): void {
  runArgsInherited('git', ['-C', cwd, 'merge', '--squash', branch])
}

/**
 * Rebases the current branch at `cwd` onto a target branch.
 *
 * @param cwd - Working directory of the branch being rebased.
 * @param onto - The branch to rebase onto.
 */
export function rebaseBranch(cwd: string, onto: string): void {
  runArgsInherited('git', ['-C', cwd, 'rebase', onto])
}

/**
 * Fast-forward only merge of a branch into the working tree at `cwd`.
 * Fails if a fast-forward is not possible.
 *
 * @param cwd - Working directory where the merge happens.
 * @param branch - The branch to fast-forward to.
 */
export function ffMergeBranch(cwd: string, branch: string): void {
  runArgsInherited('git', ['-C', cwd, 'merge', '--ff-only', branch])
}

/**
 * Creates a commit in the working tree at `cwd` with the given message.
 *
 * @param cwd - Working directory where the commit is created.
 * @param message - The commit message.
 */
export function commitMerge(cwd: string, message: string): void {
  runArgsInherited('git', ['-C', cwd, 'commit', '-m', message])
}

/**
 * Renames a local branch.
 *
 * @param oldName - Current branch name.
 * @param newName - New branch name.
 */
export function renameBranch(oldName: string, newName: string): void {
  runArgsInherited('git', ['branch', '-m', oldName, newName])
}

/**
 * Moves a linked worktree to a new directory path.
 *
 * @param oldPath - Current absolute path of the worktree.
 * @param newPath - New absolute path for the worktree.
 */
export function moveWorktree(oldPath: string, newPath: string): void {
  runArgsInherited('git', ['worktree', 'move', oldPath, newPath])
}

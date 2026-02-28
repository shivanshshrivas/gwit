import * as path from 'path'
import * as os from 'os'

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the gwit global data directory: `~/.gwit`.
 * @returns Absolute path to the gwit data directory.
 */
export function getGwitDir(): string {
  return path.join(os.homedir(), '.gwit')
}

/**
 * Returns the worktree registry path: `~/.gwit/worktrees.json`.
 * @returns Absolute path to the registry file.
 */
export function getRegistryPath(): string {
  return path.join(getGwitDir(), 'worktrees.json')
}

/**
 * Returns the global config path: `~/.gwitrc`.
 * @returns Absolute path to the config file.
 */
export function getConfigPath(): string {
  return path.join(os.homedir(), '.gwitrc')
}

/**
 * Computes the directory path for a new worktree given the placement strategy.
 *
 * - `sibling`: places the worktree next to the main repo as `{repoName}-{slug}`
 * - `subdirectory`: places it inside the main repo at `.worktrees/{slug}`
 *
 * @param mainPath - Absolute path to the main (primary) worktree.
 * @param location - Placement strategy from user config.
 * @param slug - Sanitized branch slug used as the directory suffix.
 * @returns Absolute path where the new worktree directory will be created.
 */
export function getWorktreePath(
  mainPath: string,
  location: 'sibling' | 'subdirectory',
  slug: string
): string {
  if (location === 'sibling') {
    const repoName = path.basename(mainPath)
    return path.join(path.dirname(mainPath), `${repoName}-${slug}`)
  }

  return path.join(mainPath, '.worktrees', slug)
}

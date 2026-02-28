import type { GwitEnvironment } from '../types'

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Builds the complete set of `$GWIT_*` environment variables for a worktree.
 * All values are strings — a requirement of the process environment API.
 *
 * These variables are injected into `.gwitcommand` and `.gwitcleanup` hooks
 * so user scripts can derive isolated resource names without hardcoding them.
 *
 * @param branch - Raw branch name (e.g. "36-bug-store").
 * @param slug - Sanitized slug (e.g. "36_bug_store").
 * @param port - Auto-assigned port number.
 * @param worktreePath - Absolute path to the new worktree directory.
 * @param mainPath - Absolute path to the main (primary) repo directory.
 * @param index - Stable monotonic index for this worktree.
 * @returns A GwitEnvironment object with all seven variables set.
 */
export function buildEnvironment(
  branch: string,
  slug: string,
  port: number,
  worktreePath: string,
  mainPath: string,
  index: number
): GwitEnvironment {
  return {
    GWIT_BRANCH: branch,
    GWIT_SLUG: slug,
    GWIT_PORT: String(port),
    GWIT_DB_SUFFIX: `_${slug}`,
    GWIT_WORKTREE_PATH: worktreePath,
    GWIT_MAIN_PATH: mainPath,
    GWIT_INDEX: String(index),
  }
}

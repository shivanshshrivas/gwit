import { runArgsSafe } from '../lib/shell'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrInfo {
  /** PR number on GitHub. */
  number: number
  /** PR state: OPEN, CLOSED, or MERGED. */
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  /** True if the PR is marked as a draft. */
  isDraft: boolean
  /** Aggregate status of CI checks, or null if unavailable. */
  checksStatus: 'pass' | 'fail' | 'pending' | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Maps the `statusCheckRollup` array from the gh CLI into a single aggregate.
 * @param rollup - Array of status check objects from gh.
 * @returns Aggregate check status.
 */
function aggregateChecks(
  rollup: Array<{ status?: string; conclusion?: string; state?: string }> | undefined
): 'pass' | 'fail' | 'pending' | null {
  if (!rollup || rollup.length === 0) return null

  let hasPending = false
  for (const check of rollup) {
    const conclusion = check.conclusion ?? check.state
    if (conclusion === 'FAILURE' || conclusion === 'ERROR' || conclusion === 'ACTION_REQUIRED') {
      return 'fail'
    }
    if (conclusion === 'PENDING' || check.status === 'IN_PROGRESS' || check.status === 'QUEUED') {
      hasPending = true
    }
  }

  return hasPending ? 'pending' : 'pass'
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true if the GitHub CLI (`gh`) is installed and available in PATH.
 * @returns True if gh is available.
 */
export function isGhAvailable(): boolean {
  return runArgsSafe('gh', ['--version']).success
}

/**
 * Fetches pull request info for a branch using the GitHub CLI.
 * Returns null if gh is unavailable, the branch has no PR, or the query fails.
 *
 * @param branch - The branch name to look up.
 * @returns PR info, or null if unavailable.
 */
export function getPrInfo(branch: string): PrInfo | null {
  const result = runArgsSafe('gh', [
    'pr',
    'view',
    branch,
    '--json',
    'number,state,isDraft,statusCheckRollup',
  ])

  if (!result.success || result.stdout.length === 0) return null

  try {
    const data = JSON.parse(result.stdout) as {
      number?: number
      state?: string
      isDraft?: boolean
      statusCheckRollup?: Array<{ status?: string; conclusion?: string; state?: string }>
    }

    if (typeof data.number !== 'number' || typeof data.state !== 'string') return null

    return {
      number: data.number,
      state: data.state as PrInfo['state'],
      isDraft: data.isDraft ?? false,
      checksStatus: aggregateChecks(data.statusCheckRollup),
    }
  } catch {
    return null
  }
}

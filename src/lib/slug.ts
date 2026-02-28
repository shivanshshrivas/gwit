import { GwitError } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

/** PostgreSQL database name length limit, also a reasonable slug cap. */
const MAX_SLUG_LENGTH = 63

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Converts a git branch name into a string safe for filesystems, database
 * names, and environment variable suffixes.
 *
 * Rules: lowercase, slashes/hyphens → underscores, collapse consecutive
 * underscores, trim edges, truncate to 63 chars (PostgreSQL limit).
 *
 * @param branch - The raw git branch name (e.g. "36-bug-store").
 * @returns A sanitized slug (e.g. "36_bug_store").
 * @throws {GwitError} If the branch name produces an empty slug.
 */
export function toSlug(branch: string): string {
  let slug = branch.toLowerCase()
  slug = slug.replace(/\//g, '_') // feature/auth → feature_auth
  slug = slug.replace(/-/g, '_') // bug-fix → bug_fix
  slug = slug.replace(/[^a-z0-9_]/g, '_') // non-alphanumeric → _
  slug = slug.replace(/_+/g, '_') // collapse consecutive underscores
  slug = slug.replace(/^_+|_+$/g, '') // trim leading/trailing underscores
  slug = slug.slice(0, MAX_SLUG_LENGTH)

  if (slug.length === 0) {
    throw new GwitError(
      `Branch name "${branch}" produces an empty slug after sanitization.`,
      'Use a branch name with at least one alphanumeric character.'
    )
  }

  return slug
}

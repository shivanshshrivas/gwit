// ─── Config ───────────────────────────────────────────────────────────────────

export interface GwitConfig {
  /** Editor command to open worktrees with (e.g. "code", "cursor", "zed"). */
  editor: string
  /** Whether new worktrees are placed beside or inside the main repo. */
  location: 'sibling' | 'subdirectory'
  /** Starting port for auto-assignment. Scans up to +100 from this value. */
  basePort: number
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export interface WorktreeEntry {
  /** Absolute path to the worktree directory. */
  path: string
  /** Auto-assigned port number for this worktree. */
  port: number
  /** Branch name as-is (e.g. "36-bug-store"). */
  branch: string
  /** Sanitized slug used for DB names and env vars (e.g. "36_bug_store"). */
  slug: string
  /** Stable monotonic index — never reused after removal. */
  index: number
  /** ISO 8601 creation timestamp. */
  createdAt: string
}

export interface WorktreeRepoRegistry {
  /** Monotonically increasing counter for generating stable indices. */
  nextIndex: number
  /** Active worktrees for this repo, keyed by branch name. */
  worktrees: Record<string, WorktreeEntry>
}

/** Top-level registry shape, keyed by the main repo's absolute path. */
export interface WorktreeRegistry {
  [mainRepoPath: string]: WorktreeRepoRegistry
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export interface FileSnapshot {
  /** SHA-256 hex digest captured at snapshot time. */
  hash: string
  /** File size in bytes captured at snapshot time. */
  size: number
}

export interface SnapshotManifest {
  /** Branch name associated with this snapshot. */
  branch: string
  /** Snapshot creation timestamp in ISO 8601 format. */
  createdAt: string
  /** Snapshot metadata keyed by repo-relative path. */
  files: Record<string, FileSnapshot>
}

// ─── Environment ──────────────────────────────────────────────────────────────

/**
 * The set of `$GWIT_*` variables injected into `.gwitcommand` and
 * `.gwitcleanup` hook executions. All values are strings (env var constraint).
 */
export interface GwitEnvironment {
  /** Raw branch name, e.g. "36-bug-store". */
  GWIT_BRANCH: string
  /** Filesystem/DB-safe slug, e.g. "36_bug_store". */
  GWIT_SLUG: string
  /** Auto-assigned port as a string, e.g. "3001". */
  GWIT_PORT: string
  /** Underscore-prefixed slug for DB name suffixes, e.g. "_36_bug_store". */
  GWIT_DB_SUFFIX: string
  /** Absolute path to this worktree directory. */
  GWIT_WORKTREE_PATH: string
  /** Absolute path to the main (primary) repo directory. */
  GWIT_MAIN_PATH: string
  /** Stable worktree index as a string, e.g. "1". */
  GWIT_INDEX: string
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Base error class for all gwit failures. Carries an optional human-readable
 * `suggestion` and a process `exitCode`.
 */
export class GwitError extends Error {
  constructor(
    message: string,
    public suggestion?: string,
    public exitCode: number = 1
  ) {
    super(message)
    this.name = 'GwitError'
  }
}

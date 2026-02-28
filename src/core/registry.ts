import * as fs from 'fs'
import * as path from 'path'

import type { WorktreeRegistry, WorktreeEntry } from '../types'
import { GwitError } from '../types'
import { getRegistryPath, getGwitDir } from '../lib/paths'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 100

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolves after `ms` milliseconds. Used between write-and-rename retries. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Atomically writes the registry to disk using a write-and-rename strategy.
 * Writes to a temp file with a unique name, then renames over the target.
 * `fs.renameSync` is atomic on POSIX and uses MoveFileEx on Windows, which
 * is also atomic for same-volume moves. Retries up to MAX_RETRIES times
 * if rename fails due to concurrent writers.
 *
 * @param registry - The full registry object to persist.
 */
async function writeRegistry(registry: WorktreeRegistry): Promise<void> {
  const registryPath = getRegistryPath()
  const gwitDir = getGwitDir()

  if (!fs.existsSync(gwitDir)) {
    // 0o700: owner-only — registry contains worktree paths, ports, and branch names
    fs.mkdirSync(gwitDir, { recursive: true, mode: 0o700 })
  }

  // Include PID + random suffix so concurrent gwit processes use distinct temps
  const tmpPath = path.join(
    gwitDir,
    `worktrees.json.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`
  )

  fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2), 'utf-8')
  // Set permissions before rename so the target file is never world-readable,
  // even briefly. Best-effort — Windows chmod support is limited.
  try {
    fs.chmodSync(tmpPath, 0o600)
  } catch {
    // Ignore on platforms where chmod is unsupported
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      fs.renameSync(tmpPath, registryPath)
      return
    } catch {
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS)
    }
  }

  // All retries exhausted — clean up the orphaned temp file
  try {
    fs.unlinkSync(tmpPath)
  } catch {
    // Ignore cleanup failure; temp file will be cleaned up by the OS eventually
  }

  throw new GwitError('Failed to write worktree registry after multiple retries.')
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads and parses `~/.gwit/worktrees.json`. Returns an empty registry if the
 * file does not exist. If the file is corrupt (invalid JSON), backs it up to
 * `worktrees.json.bak` and returns an empty registry with a warning.
 *
 * @returns The current WorktreeRegistry (never throws).
 */
export function readRegistry(): WorktreeRegistry {
  const registryPath = getRegistryPath()

  if (!fs.existsSync(registryPath)) return {}

  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as WorktreeRegistry
  } catch {
    // Back up the corrupted file and start fresh rather than crashing
    const backupPath = `${registryPath}.bak`
    try {
      fs.copyFileSync(registryPath, backupPath)
    } catch {
      // Ignore if backup also fails
    }
    console.warn(`⚠ Corrupted registry backed up to ${backupPath}. Starting fresh.`)
    return {}
  }
}

/**
 * Returns the next stable index to assign to a new worktree in the given repo.
 * This is a read-only peek — the index is committed to disk by `addWorktreeEntry`.
 *
 * @param mainPath - Absolute path to the main repo directory.
 * @returns The next index (1-based, monotonically increasing).
 */
export function peekNextIndex(mainPath: string): number {
  const registry = readRegistry()
  return (registry[mainPath]?.nextIndex ?? 0) + 1
}

/**
 * Adds or updates a worktree entry in the registry. Increments `nextIndex`
 * for the repo to at least the entry's index, keeping it monotonically
 * increasing even if concurrent gwit runs assigned the same peeked index.
 *
 * @param mainPath - Absolute path to the main repo directory.
 * @param entry - The complete WorktreeEntry to persist.
 */
export async function addWorktreeEntry(mainPath: string, entry: WorktreeEntry): Promise<void> {
  const registry = readRegistry()

  if (!registry[mainPath]) {
    registry[mainPath] = { nextIndex: 0, worktrees: {} }
  }

  const repo = registry[mainPath]!
  repo.nextIndex = Math.max(repo.nextIndex, entry.index)
  repo.worktrees[entry.branch] = entry

  await writeRegistry(registry)
}

/**
 * Removes a worktree entry from the registry. No-ops if the entry does not exist.
 *
 * @param mainPath - Absolute path to the main repo directory.
 * @param branch - Branch name of the worktree to remove.
 */
export async function removeWorktreeEntry(mainPath: string, branch: string): Promise<void> {
  const registry = readRegistry()
  const repo = registry[mainPath]
  if (repo) delete repo.worktrees[branch]
  await writeRegistry(registry)
}

/**
 * Returns a single worktree entry, or `undefined` if not found.
 *
 * @param mainPath - Absolute path to the main repo directory.
 * @param branch - Branch name to look up.
 * @returns The WorktreeEntry, or undefined.
 */
export function getWorktreeEntry(mainPath: string, branch: string): WorktreeEntry | undefined {
  const registry = readRegistry()
  return registry[mainPath]?.worktrees[branch]
}

/**
 * Returns all worktree entries registered for the given repo.
 *
 * @param mainPath - Absolute path to the main repo directory.
 * @returns Array of WorktreeEntry objects (empty if none registered).
 */
export function listWorktreeEntries(mainPath: string): WorktreeEntry[] {
  const registry = readRegistry()
  const repo = registry[mainPath]
  if (!repo) return []
  return Object.values(repo.worktrees)
}

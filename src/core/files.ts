import * as fs from 'fs'
import * as path from 'path'

import { runArgsSafe } from '../lib/shell'
import { ui } from '../lib/ui'

// ─── Constants ────────────────────────────────────────────────────────────────

const GWITINCLUDE_FILE = '.gwitinclude'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses the raw text content of a `.gwitinclude` file into an array of
 * entry strings. Exported with `_` prefix for unit testing only.
 *
 * Rules: skip blank lines and lines starting with `#`; trim each line.
 *
 * @param content - Raw file content.
 * @returns Array of non-empty, non-comment entry strings.
 */
export function _parseLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

/**
 * Returns true if the given path is gitignored in the repo at `cwd`.
 * `git check-ignore` exits 0 for ignored files, 1 for non-ignored — so a
 * non-zero exit is an expected outcome, not an error.
 *
 * @param entryPath - Relative path to check (from repo root).
 * @param cwd - The repo root to run the check from.
 * @returns True if git considers the path ignored.
 */
function isGitIgnored(entryPath: string, cwd: string): boolean {
  return runArgsSafe('git', ['check-ignore', '-q', entryPath], { cwd }).success
}

/**
 * Returns true if the given path is tracked by git in the repo at `cwd`.
 * Belt-and-suspenders guard: we skip tracked files even if they appear in
 * `.gwitinclude`, because git already handles them in the worktree.
 *
 * @param entryPath - Relative path to check.
 * @param cwd - The repo root to run the check from.
 * @returns True if git is tracking the path.
 */
function isGitTracked(entryPath: string, cwd: string): boolean {
  const result = runArgsSafe('git', ['ls-files', entryPath], { cwd })
  return result.success && result.stdout.length > 0
}

/**
 * Copies a single source entry (file or directory) to the destination.
 * Creates any missing parent directories before copying.
 *
 * @param src - Absolute source path.
 * @param dest - Absolute destination path.
 */
function copyEntry(src: string, dest: string): void {
  const stat = fs.statSync(src)

  if (stat.isDirectory()) {
    // dereference: false (the default) prevents following symlinks outside the tree;
    // fs.cpSync is stable in Node 20+ and handles deep trees in one call
    fs.cpSync(src, dest, { recursive: true, preserveTimestamps: true, dereference: false })
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    // COPYFILE_EXCL not set intentionally — overwriting is the desired behaviour
    fs.copyFileSync(src, dest)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads and parses the `.gwitinclude` file from the main worktree root.
 * Returns an empty array if the file does not exist (it is optional).
 *
 * @param mainPath - Absolute path to the main worktree.
 * @returns Array of entry strings listed in `.gwitinclude`.
 */
export function parseGwitInclude(mainPath: string): string[] {
  const includePath = path.join(mainPath, GWITINCLUDE_FILE)
  if (!fs.existsSync(includePath)) return []
  return _parseLines(fs.readFileSync(includePath, 'utf-8'))
}

/**
 * Copies gitignored files listed in `.gwitinclude` from the main worktree to
 * a newly created worktree. Each entry is validated before copying:
 *
 * - Must exist in the main worktree
 * - Must be gitignored (only gitignored files need manual copying)
 * - Must not be git-tracked (tracked files are already in the worktree)
 *
 * Entries that fail any check are skipped silently.
 *
 * @param mainPath - Absolute path to the main (source) worktree.
 * @param worktreePath - Absolute path to the new (destination) worktree.
 * @returns Array of entry paths that were actually copied, for user feedback.
 */
export function copyIncludedFiles(mainPath: string, worktreePath: string): string[] {
  const entries = parseGwitInclude(mainPath)

  if (entries.length === 0) return []

  const copied: string[] = []

  for (const entry of entries) {
    // Trailing slash is a human-readability hint; strip it for path resolution
    const entryPath = entry.replace(/\/$/, '')

    // ── Path traversal guard ─────────────────────────────────────────────────

    // Reject absolute paths outright (path.join would collapse them to the
    // absolute path, bypassing mainPath entirely)
    if (path.isAbsolute(entryPath)) {
      ui.dim(`  skip ${entry} (absolute path not allowed)`)
      continue
    }

    // Resolve and verify the entry stays inside the main worktree — guards
    // against entries like "../../etc/passwd" or Windows-style UNC paths
    const mainResolved = path.resolve(mainPath)
    const resolvedSrc = path.resolve(mainPath, entryPath)
    const rel = path.relative(mainResolved, resolvedSrc)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      ui.dim(`  skip ${entry} (path escapes repo)`)
      continue
    }

    const src = resolvedSrc
    const dest = path.resolve(worktreePath, entryPath)

    // ── Guards ──────────────────────────────────────────────────────────────

    if (!fs.existsSync(src)) {
      // File may not exist on this machine (e.g. .env.local is optional)
      ui.dim(`  skip ${entry} (not found)`)
      continue
    }

    if (!isGitIgnored(entryPath, mainPath)) {
      // Tracked files are already present in the worktree; no copy needed
      ui.dim(`  skip ${entry} (not gitignored)`)
      continue
    }

    if (isGitTracked(entryPath, mainPath)) {
      // Shouldn't normally happen, but guard against misconfigured .gwitinclude
      ui.dim(`  skip ${entry} (tracked by git)`)
      continue
    }

    // ── Copy ─────────────────────────────────────────────────────────────────

    copyEntry(src, dest)
    copied.push(entry)
  }

  return copied
}

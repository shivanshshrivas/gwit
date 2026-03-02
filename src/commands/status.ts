import * as fs from 'fs'

import { GwitError } from '../types'
import { ui } from '../lib/ui'
import {
  isGitRepo,
  getMainWorktreePath,
  getDefaultBranch,
  getAheadBehind,
  hasUncommittedChanges,
} from '../core/git'
import { listWorktreeEntries } from '../core/registry'
import { isGhAvailable, getPrInfo } from '../core/gh'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StatusOptions {
  /** Output as JSON for scripting. */
  json?: boolean
}

interface StatusRow {
  branch: string
  path: string
  port: number
  ahead: number
  behind: number
  dirty: boolean
  pr: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a status row for a single worktree entry.
 *
 * @param branch - The branch name.
 * @param entryPath - Absolute path to the worktree.
 * @param port - Assigned port number.
 * @param defaultBranch - The repo's default branch for ahead/behind.
 * @param ghAvailable - Whether the gh CLI is available.
 * @returns A StatusRow object.
 */
function buildRow(
  branch: string,
  entryPath: string,
  port: number,
  defaultBranch: string,
  ghAvailable: boolean
): StatusRow {
  const exists = fs.existsSync(entryPath)
  const { ahead, behind } = exists
    ? getAheadBehind(branch, defaultBranch, entryPath)
    : { ahead: 0, behind: 0 }
  const dirty = exists ? hasUncommittedChanges(entryPath) : false

  let pr = '—'
  if (ghAvailable) {
    const info = getPrInfo(branch)
    if (info) {
      const draft = info.isDraft ? ' draft' : ''
      const checks = info.checksStatus ? ` (checks: ${info.checksStatus})` : ''
      pr = `#${info.number} ${info.state.toLowerCase()}${draft}${checks}`
    }
  }

  return { branch, path: entryPath, port, ahead, behind, dirty, pr }
}

/**
 * Formats status rows as an aligned table for terminal output.
 *
 * @param rows - Array of status rows to format.
 */
function printTable(rows: StatusRow[]): void {
  // Column headers
  const headers = ['Branch', 'Port', 'Ahead/Behind', 'Changes', 'PR']
  const formatted = rows.map((r) => [
    r.branch,
    String(r.port),
    `+${r.ahead} / -${r.behind}`,
    r.dirty ? 'dirty' : 'clean',
    r.pr,
  ])

  // Compute column widths
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...formatted.map((row) => (row[i] ?? '').length))
  )

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join('  ')
  console.log(`  ${ui.bold(headerLine)}`)

  // Print rows
  for (const row of formatted) {
    const line = row.map((cell, i) => (cell ?? '').padEnd(widths[i] ?? 0)).join('  ')
    console.log(`  ${line}`)
  }
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Displays the status of all active gwit worktrees for the current repo.
 * Shows branch, port, ahead/behind, dirty state, and PR info (if gh available).
 *
 * @param options - Command flags.
 */
export function statusCommand(options: StatusOptions): void {
  if (!isGitRepo()) {
    throw new GwitError(
      'Not a git repository.',
      'Run gwit status from inside a git repo (or any of its worktrees).'
    )
  }

  const mainPath = getMainWorktreePath()
  const entries = listWorktreeEntries(mainPath)

  if (entries.length === 0) {
    ui.info('No active gwit worktrees.')
    return
  }

  const defaultBranch = getDefaultBranch()
  const ghAvail = isGhAvailable()

  const rows = entries.map((e) => buildRow(e.branch, e.path, e.port, defaultBranch, ghAvail))

  if (options.json) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }

  console.log()
  printTable(rows)
  console.log()
}

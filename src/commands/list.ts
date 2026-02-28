import { GwitError } from '../types'
import { ui } from '../lib/ui'
import { isGitRepo, getMainWorktreePath } from '../core/git'
import { listWorktreeEntries } from '../core/registry'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Renders a fixed-width table to stdout. Column widths are derived from the
 * widest value in each column (including the header).
 *
 * @param headers - Column header strings.
 * @param rows - Data rows; each inner array must match the header length.
 */
function printTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)))

  const pad = (s: string, w: number) => s.padEnd(w)
  const divider = widths.map((w) => '─'.repeat(w)).join('  ')
  const header = headers.map((h, i) => pad(h, widths[i] ?? h.length)).join('  ')

  console.log()
  console.log(`  ${ui.bold(header)}`)
  console.log(`  ${divider}`)
  for (const row of rows) {
    console.log(`  ${row.map((cell, i) => pad(cell, widths[i] ?? cell.length)).join('  ')}`)
  }
  console.log()
}

// ─── Command ──────────────────────────────────────────────────────────────────

/**
 * Lists all gwit-managed worktrees for the current repo, showing branch name,
 * worktree path, and assigned port. Reads from `~/.gwit/worktrees.json`.
 */
export function listCommand(): void {
  if (!isGitRepo()) {
    throw new GwitError(
      'Not a git repository.',
      'Run gwit from inside a git repo (or any of its worktrees).'
    )
  }

  const mainPath = getMainWorktreePath()
  const entries = listWorktreeEntries(mainPath)

  if (entries.length === 0) {
    console.log()
    ui.dim('  No active gwit worktrees.')
    ui.dim(`  Run 'gwit <branch>' to create one.`)
    console.log()
    return
  }

  const rows = entries
    .sort((a, b) => a.index - b.index)
    .map((e) => [e.branch, e.path, String(e.port)])

  printTable(['BRANCH', 'PATH', 'PORT'], rows)
}

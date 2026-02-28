import { spawnSync, spawn } from 'child_process'

import { ui } from '../lib/ui'

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Editors that run inside the terminal and must block until the user exits.
 * All other editors are treated as GUI apps and launched detached.
 */
const TERMINAL_EDITORS = new Set(['vim', 'nvim', 'vi', 'nano', 'emacs'])

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Opens the given directory in the configured editor.
 *
 * - Terminal editors (vim, nvim, etc.) are launched synchronously so they
 *   take over the terminal; gwit waits for the user to exit.
 * - GUI editors (code, cursor, zed, etc.) are launched detached so gwit
 *   exits immediately without waiting for the editor to close.
 *
 * If the editor binary is not found in PATH, a warning is printed and
 * execution continues — the worktree is already created at this point.
 *
 * @param editor - The editor command (e.g. "code", "cursor", "nvim").
 * @param worktreePath - Absolute path to the directory to open.
 */
export function launchEditor(editor: string, worktreePath: string): void {
  if (TERMINAL_EDITORS.has(editor)) {
    // Block until the user quits the terminal editor
    spawnSync(editor, [worktreePath], { stdio: 'inherit', shell: true })
    return
  }

  // GUI editor: fire-and-forget, do not hold the process open
  // shell: true is required on Windows where editors like 'code' are .cmd scripts
  const child = spawn(editor, [worktreePath], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  })

  child.on('error', () => {
    // Editor not found in PATH — warn but don't fail; worktree already exists
    ui.warn(`Editor '${editor}' not found in PATH.`)
    ui.dim(`  Change it with: gwit config set editor <name>`)
  })

  child.unref()
}

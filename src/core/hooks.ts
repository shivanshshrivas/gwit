import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

import { type GwitEnvironment, GwitError } from '../types'
import { ui } from '../lib/ui'

// ─── Constants ────────────────────────────────────────────────────────────────

const GWITCOMMAND_FILE = '.gwitcommand'
const GWITCLEANUP_FILE = '.gwitcleanup'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses the raw text content of a `.gwitcommand` or `.gwitcleanup` file
 * into an ordered list of shell commands.
 * Exported with `_` prefix for unit testing only.
 *
 * Rules: skip blank lines and lines starting with `#`; trim each line.
 *
 * @param content - Raw file content.
 * @returns Array of non-empty, non-comment command strings.
 */
export function _parseHookLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}

/**
 * Reads a hook file and returns its parsed commands.
 * Returns an empty array if the file does not exist.
 *
 * @param mainPath - Absolute path to the main worktree (where hook files live).
 * @param filename - The hook filename (e.g. ".gwitcommand").
 * @returns Array of shell command strings.
 */
function readHookFile(mainPath: string, filename: string): string[] {
  const filePath = path.join(mainPath, filename)
  if (!fs.existsSync(filePath)) return []
  return _parseHookLines(fs.readFileSync(filePath, 'utf-8'))
}

/**
 * Executes a list of shell commands sequentially inside the worktree directory,
 * with all `$GWIT_*` variables available in the environment.
 *
 * Logs each command and its execution time before running it.
 * The `$GWIT_*` vars are injected via the `env` option — never interpolated
 * into the command string — so user scripts reference them via shell expansion.
 *
 * @param commands - Ordered list of shell commands to run.
 * @param worktreePath - Working directory for all commands.
 * @param env - The GwitEnvironment to inject alongside process.env.
 * @param stopOnError - If true, throws on first failure; if false, warns and continues.
 * @param label - Hook file name shown in error messages (e.g. ".gwitcommand").
 */
function executeCommands(
  commands: string[],
  worktreePath: string,
  env: GwitEnvironment,
  stopOnError: boolean,
  label: string
): void {
  const mergedEnv = { ...process.env, ...env }

  for (const command of commands) {
    ui.step(command)
    const start = Date.now()

    try {
      execSync(command, {
        cwd: worktreePath,
        env: mergedEnv,
        stdio: 'inherit',
      })
      ui.dim(`  ✓ ${Date.now() - start}ms`)
    } catch {
      if (stopOnError) {
        throw new GwitError(
          `${label} command failed: ${command}`,
          'The worktree is intact — cd into it to debug.'
        )
      }
      // Cleanup hooks warn and continue so all teardown steps still run
      ui.warn(`Command failed (continuing): ${command}`)
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads `.gwitcommand` from the main worktree and runs each command inside
 * the new worktree. Stops on the first failure.
 *
 * Typical uses: `npm install`, `createdb myapp$GWIT_DB_SUFFIX`, `cp .env.example .env`.
 *
 * @param mainPath - Absolute path to the main worktree (where `.gwitcommand` lives).
 * @param worktreePath - Absolute path to the new worktree where commands run.
 * @param env - The GwitEnvironment to inject (port, slug, DB suffix, etc.).
 */
export function runSetupHooks(mainPath: string, worktreePath: string, env: GwitEnvironment): void {
  const commands = readHookFile(mainPath, GWITCOMMAND_FILE)
  if (commands.length === 0) return

  ui.step(
    `Running ${GWITCOMMAND_FILE} (${commands.length} command${commands.length === 1 ? '' : 's'})…`
  )
  executeCommands(commands, worktreePath, env, true, GWITCOMMAND_FILE)
}

/**
 * Reads `.gwitcleanup` from the main worktree and runs each command inside
 * the worktree being removed. Warns on failure but continues so all teardown
 * steps run regardless.
 *
 * Typical uses: `dropdb myapp$GWIT_DB_SUFFIX`, `docker compose down`.
 *
 * @param mainPath - Absolute path to the main worktree (where `.gwitcleanup` lives).
 * @param worktreePath - Absolute path to the worktree being removed.
 * @param env - The GwitEnvironment to inject (port, slug, DB suffix, etc.).
 */
export function runCleanupHooks(
  mainPath: string,
  worktreePath: string,
  env: GwitEnvironment
): void {
  const commands = readHookFile(mainPath, GWITCLEANUP_FILE)
  if (commands.length === 0) return

  ui.step(
    `Running ${GWITCLEANUP_FILE} (${commands.length} command${commands.length === 1 ? '' : 's'})…`
  )
  executeCommands(commands, worktreePath, env, false, GWITCLEANUP_FILE)
}

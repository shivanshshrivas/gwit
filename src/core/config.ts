import * as fs from 'fs'

import inquirer from 'inquirer'

import { type GwitConfig, GwitError } from '../types'
import { getConfigPath, getGwitDir } from '../lib/paths'
import { ui } from '../lib/ui'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: GwitConfig = {
  editor: 'code',
  location: 'sibling',
  basePort: 3001,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Runs the interactive first-time setup wizard using inquirer.
 * Saves the resulting config to `~/.gwitrc` and creates `~/.gwit/`.
 *
 * @returns The newly created GwitConfig.
 */
async function runFirstTimeSetup(): Promise<GwitConfig> {
  console.log()
  ui.info('Welcome to gwit! Quick setup before we begin.\n')

  // ── Editor ────────────────────────────────────────────────────────────────

  const { editorChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'editorChoice',
      message: 'Which editor do you use?',
      choices: [
        { name: 'VS Code   (code)', value: 'code' },
        { name: 'Cursor    (cursor)', value: 'cursor' },
        { name: 'Zed       (zed)', value: 'zed' },
        { name: 'Vim       (vim)', value: 'vim' },
        { name: 'Neovim    (nvim)', value: 'nvim' },
        { name: 'Other — enter command', value: 'other' },
      ],
    },
  ])

  let editor: string = editorChoice
  if (editorChoice === 'other') {
    const { customEditor } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customEditor',
        message: 'Editor command (e.g. "subl", "hx"):',
        validate: (v: string) => v.trim().length > 0 || 'Please enter a command',
      },
    ])
    editor = (customEditor as string).trim()
  }

  // ── Location ──────────────────────────────────────────────────────────────

  const { location } = await inquirer.prompt([
    {
      type: 'list',
      name: 'location',
      message: 'Where should worktrees be placed?',
      choices: [
        { name: 'Sibling dir     ../repo-branch  (recommended)', value: 'sibling' },
        { name: 'Subdirectory    repo/.worktrees/branch', value: 'subdirectory' },
      ],
    },
  ])

  // ── Base port ─────────────────────────────────────────────────────────────

  const { basePortStr } = await inquirer.prompt([
    {
      type: 'input',
      name: 'basePortStr',
      message: 'Base port for auto-assignment:',
      default: String(DEFAULT_CONFIG.basePort),
      validate: (v: string) => {
        const n = parseInt(v, 10)
        return (Number.isInteger(n) && n > 0 && n < 65536) || 'Enter a valid port (1–65535)'
      },
    },
  ])

  const config: GwitConfig = {
    editor,
    location: location as 'sibling' | 'subdirectory',
    basePort: parseInt(basePortStr as string, 10),
  }

  // Ensure ~/.gwit exists so the registry can be written in Phase 4
  // mode 0o700: owner-only access — worktree paths and ports are private
  const gwitDir = getGwitDir()
  if (!fs.existsSync(gwitDir)) {
    fs.mkdirSync(gwitDir, { recursive: true, mode: 0o700 })
  }

  saveConfig(config)
  console.log()
  ui.success(`Config saved to ~/.gwitrc`)
  console.log()

  return config
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads `~/.gwitrc` and returns the parsed config, merged over defaults.
 * Does NOT trigger the first-run wizard — call `ensureConfig()` for that.
 *
 * @returns The current GwitConfig.
 * @throws {GwitError} If the file exists but cannot be parsed.
 */
export function loadConfig(): GwitConfig {
  const configPath = getConfigPath()

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG }
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<GwitConfig>) }
  } catch {
    throw new GwitError(
      `Failed to parse config at ${configPath}.`,
      `Remove it and run gwit again: rm ${configPath}`
    )
  }
}

/**
 * Writes a GwitConfig object to `~/.gwitrc` as formatted JSON.
 * @param config - The config to persist.
 */
export function saveConfig(config: GwitConfig): void {
  const configPath = getConfigPath()
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  // 0o600: owner read/write only — config contains editor command and ports
  try {
    fs.chmodSync(configPath, 0o600)
  } catch {
    // Windows does not support Unix-style mode bits; chmod is best-effort
  }
}

/**
 * Loads the config, running the interactive first-time setup wizard if
 * `~/.gwitrc` does not yet exist.
 *
 * @returns A resolved GwitConfig (either loaded or freshly created).
 */
export async function ensureConfig(): Promise<GwitConfig> {
  if (!fs.existsSync(getConfigPath())) {
    return runFirstTimeSetup()
  }
  return loadConfig()
}

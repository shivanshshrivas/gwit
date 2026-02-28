import { GwitError } from '../types'
import { ui } from '../lib/ui'
import { loadConfig, saveConfig } from '../core/config'

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_KEYS = ['editor', 'location', 'basePort'] as const
type ConfigKey = (typeof VALID_KEYS)[number]

// ─── Sub-validators ───────────────────────────────────────────────────────────

/** @returns Error message, or null if valid. */
function validateEditor(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'editor cannot be empty'
  // Reject shell metacharacters — launchEditor uses spawn() so they are not
  // interpreted now, but defence-in-depth guards against future regressions
  // or the value being used in a string-interpolated execSync elsewhere.
  if (/[;&|`$(){}[\]<>"'\\]/.test(trimmed)) {
    return 'editor command cannot contain shell metacharacters (; & | ` $ etc.)'
  }
  return null
}

/** @returns Error message, or null if valid. */
function validateLocation(value: string): string | null {
  return value === 'sibling' || value === 'subdirectory'
    ? null
    : `location must be 'sibling' or 'subdirectory'`
}

/** @returns Error message, or null if valid. */
function validateBasePort(value: string): string | null {
  const n = parseInt(value, 10)
  return Number.isInteger(n) && n >= 1 && n <= 65535
    ? null
    : 'basePort must be an integer between 1 and 65535'
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates a key/value pair for `gwit config set`. Exported with `_` prefix
 * for unit testing only.
 *
 * @param key - The config key to validate.
 * @param value - The proposed value.
 * @returns An error message string, or null if valid.
 */
export function _validateConfigPatch(key: string, value: string): string | null {
  if (!VALID_KEYS.includes(key as ConfigKey)) {
    return `Unknown key '${key}'. Valid keys: ${VALID_KEYS.join(', ')}`
  }
  if (key === 'editor') return validateEditor(value)
  if (key === 'location') return validateLocation(value)
  if (key === 'basePort') return validateBasePort(value)
  return null
}

/**
 * Displays all current configuration values from `~/.gwitrc`.
 */
export function configShowCommand(): void {
  const config = loadConfig()
  console.log()
  console.log(`  ${ui.bold('editor')}    ${config.editor}`)
  console.log(`  ${ui.bold('location')}  ${config.location}`)
  console.log(`  ${ui.bold('basePort')}  ${config.basePort}`)
  console.log()
}

/**
 * Prints the value for a single config key.
 *
 * @param key - The config key to read.
 * @throws {GwitError} If the key is not recognised.
 */
export function configGetCommand(key: string): void {
  if (!VALID_KEYS.includes(key as ConfigKey)) {
    throw new GwitError(`Unknown config key '${key}'.`, `Valid keys: ${VALID_KEYS.join(', ')}`)
  }
  const config = loadConfig()
  console.log(config[key as ConfigKey])
}

/**
 * Updates a single key in `~/.gwitrc` and saves it.
 *
 * @param key - The config key to update.
 * @param value - The new value (as a raw string; parsed where needed).
 * @throws {GwitError} If the key or value fails validation.
 */
export function configSetCommand(key: string, value: string): void {
  const error = _validateConfigPatch(key, value)
  if (error) throw new GwitError(error)

  const config = loadConfig()

  if (key === 'basePort') {
    config.basePort = parseInt(value, 10)
  } else if (key === 'location') {
    config.location = value as 'sibling' | 'subdirectory'
  } else {
    config.editor = value
  }

  saveConfig(config)
  ui.success(`Set ${ui.bold(key)} = ${value}`)
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** ANSI escape codes. Applied only when stdout is a TTY. */
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wraps text in an ANSI code, but only when stdout is a real TTY. */
function colorize(text: string, code: string): string {
  if (!process.stdout.isTTY) return text
  return `${code}${text}${ANSI.reset}`
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Convenience methods for consistent terminal output across all commands. */
export const ui = {
  /** Prints a green success line prefixed with ✓. */
  success: (msg: string) => console.log(colorize(`✓ ${msg}`, ANSI.green)),
  /** Prints a red error line to stderr prefixed with ✗. */
  error: (msg: string) => console.error(colorize(`✗ ${msg}`, ANSI.red)),
  /** Prints a yellow warning line to stderr prefixed with ⚠. */
  warn: (msg: string) => console.warn(colorize(`⚠ ${msg}`, ANSI.yellow)),
  /** Prints a cyan informational line. */
  info: (msg: string) => console.log(colorize(`  ${msg}`, ANSI.cyan)),
  /** Prints a cyan step line prefixed with →. */
  step: (msg: string) => console.log(colorize(`→ ${msg}`, ANSI.cyan)),
  /** Prints a dimmed line (secondary information). */
  dim: (msg: string) => console.log(colorize(msg, ANSI.dim)),
  /** Returns bold-wrapped text (for embedding in other strings). */
  bold: (text: string) => colorize(text, ANSI.bold),
  /** Returns gray-wrapped text (for embedding in other strings). */
  gray: (text: string) => colorize(text, ANSI.gray),
}

/**
 * Formats an unknown thrown value into a user-readable string.
 * Appends a hint line when the error carries a `suggestion` property.
 *
 * @param err - The caught error value (any type).
 * @returns A formatted error string suitable for display.
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) {
    const suggestion = (err as { suggestion?: string }).suggestion
    return suggestion ? `${err.message}\n  Hint: ${suggestion}` : err.message
  }
  return String(err)
}

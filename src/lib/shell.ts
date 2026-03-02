import { execSync, spawnSync } from 'child_process'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunOptions {
  cwd?: string
  /** Additional env vars merged on top of process.env. */
  env?: Record<string, string>
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs a shell command and returns trimmed stdout as a string.
 * Throws if the command exits with a non-zero code.
 *
 * @param command - The shell command to execute.
 * @param options - Optional cwd and env overrides.
 * @returns Trimmed stdout string.
 */
export function run(command: string, options?: RunOptions): string {
  return execSync(command, {
    encoding: 'utf-8',
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

/**
 * Runs a shell command with stdio inherited so output flows directly to the
 * terminal. Throws if the command exits with a non-zero code.
 *
 * @param command - The shell command to execute.
 * @param options - Optional cwd and env overrides.
 */
export function runInherited(command: string, options?: RunOptions): void {
  execSync(command, {
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : process.env,
    stdio: 'inherit',
  })
}

/**
 * Runs a command by passing arguments as an array, bypassing shell
 * interpretation. Use this instead of `run()` whenever arguments contain
 * user-provided data (branch names, paths) to prevent injection.
 *
 * @param cmd - The executable to run (e.g. "git").
 * @param args - Arguments passed directly to the process, not through a shell.
 * @param options - Optional cwd and env overrides.
 * @returns Trimmed stdout string.
 */
export function runArgs(cmd: string, args: string[], options?: RunOptions): string {
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? ''
    throw new Error(stderr || `Command failed: ${cmd} ${args.join(' ')}`)
  }
  return (result.stdout ?? '').trim()
}

/**
 * Same as `runArgs` but with stdio inherited so output flows to the terminal.
 *
 * @param cmd - The executable to run.
 * @param args - Arguments passed directly to the process.
 * @param options - Optional cwd and env overrides.
 */
export function runArgsInherited(cmd: string, args: string[], options?: RunOptions): void {
  const result = spawnSync(cmd, args, {
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : process.env,
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}`)
  }
}

/**
 * Same as `runArgs` but never throws. Use when a non-zero exit code is an
 * expected outcome (e.g. `git check-ignore` returns 1 for unignored files).
 *
 * @param cmd - The executable to run.
 * @param args - Arguments passed directly to the process.
 * @param options - Optional cwd and env overrides.
 * @returns `{ stdout, success }` — stdout is empty string on failure.
 */
export function runArgsSafe(
  cmd: string,
  args: string[],
  options?: RunOptions
): { stdout: string; success: boolean } {
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const stdout = (result.stdout ?? '').trim()
  return { stdout, success: result.status === 0 }
}

/**
 * Same as `runArgs` but returns the process exit code instead of throwing.
 * Useful when a non-zero code carries semantic meaning (e.g. conflict count).
 *
 * @param cmd - The executable to run.
 * @param args - Arguments passed directly to the process.
 * @param options - Optional cwd and env overrides.
 * @returns `{ stdout, exitCode }`.
 */
export function runArgsWithExitCode(
  cmd: string,
  args: string[],
  options?: RunOptions
): { stdout: string; exitCode: number } {
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    cwd: options?.cwd,
    env: options?.env ? { ...process.env, ...options.env } : process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  return {
    stdout: (result.stdout ?? '').trim(),
    exitCode: result.status ?? 1,
  }
}

/**
 * Runs a shell command silently and returns a result object.
 * Never throws — command failures are returned as `{ success: false }`.
 *
 * @param command - The shell command to execute.
 * @param options - Optional cwd and env overrides.
 * @returns `{ stdout, success }` — stdout is empty string on failure.
 */
export function runSafe(
  command: string,
  options?: RunOptions
): { stdout: string; success: boolean } {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return { stdout, success: true }
  } catch {
    return { stdout: '', success: false }
  }
}

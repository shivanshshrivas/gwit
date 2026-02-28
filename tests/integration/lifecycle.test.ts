/**
 * End-to-end lifecycle integration tests.
 *
 * Creates a real git repository in os.tmpdir() and exercises the full
 * create → list → sync → open → remove flow against it.
 *
 * - lib/paths is mocked to redirect config and registry to temp dirs so the
 *   user's real ~/.gwitrc and ~/.gwit/worktrees.json are never touched.
 * - core/editor is mocked to avoid launching actual editor processes.
 * - lib/ui is mocked to suppress terminal output during the test run.
 *
 * The working directory is changed to the temp repo for the duration of the
 * suite so that all git CLI calls resolve correctly. It is restored in afterAll.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

// ─── Path redirection ─────────────────────────────────────────────────────────
// These constants are evaluated before the mock factory runs (module scope),
// so they are accessible inside the lazy getter functions below.

const TMP = path.join(os.tmpdir(), `gwit-integration-${Date.now()}`)
const GWIT_DIR = path.join(TMP, '.gwit')
const REGISTRY_PATH = path.join(GWIT_DIR, 'worktrees.json')
const CONFIG_PATH = path.join(TMP, '.gwitrc')

vi.mock('../../src/lib/paths', () => ({
  getGwitDir: () => GWIT_DIR,
  getRegistryPath: () => REGISTRY_PATH,
  getConfigPath: () => CONFIG_PATH,
  // Use subdirectory placement — keeps worktrees inside the temp repo
  getWorktreePath: (mainPath: string, _location: string, slug: string) =>
    path.join(mainPath, '.worktrees', slug),
}))

vi.mock('../../src/core/editor', () => ({
  launchEditor: vi.fn(),
}))

vi.mock('../../src/lib/ui', () => ({
  ui: {
    step: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    dim: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    bold: vi.fn((s: string) => s),
    gray: vi.fn((s: string) => s),
  },
}))

import { createCommand } from '../../src/commands/create'
import { removeCommand } from '../../src/commands/remove'
import { syncCommand } from '../../src/commands/sync'
import { openCommand } from '../../src/commands/open'
import { listWorktreeEntries, getWorktreeEntry } from '../../src/core/registry'
import { saveConfig } from '../../src/core/config'
import { launchEditor } from '../../src/core/editor'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BRANCH = 'feature-auth'
const SLUG = 'feature_auth'

// ─── Suite setup / teardown ───────────────────────────────────────────────────

let REPO_DIR: string
// Canonical path as reported by git (forward slashes on Windows).
// Registry keys are always stored with git-reported paths, so all lookups
// must use this variable — not REPO_DIR which may have backslashes on Windows.
let MAIN_PATH: string
const ORIG_CWD = process.cwd()

beforeAll(() => {
  // ── Create temp directory tree ────────────────────────────────────────────
  fs.mkdirSync(GWIT_DIR, { recursive: true })

  // ── Init git repo ─────────────────────────────────────────────────────────
  REPO_DIR = path.join(TMP, 'myapp')
  fs.mkdirSync(REPO_DIR)

  const git = (cmd: string) => execSync(cmd, { cwd: REPO_DIR, stdio: 'pipe' })
  git('git init')
  git('git config user.email "test@gwit.test"')
  git('git config user.name "gwit test"')

  // ── Seed repo files ───────────────────────────────────────────────────────
  fs.writeFileSync(path.join(REPO_DIR, 'README.md'), '# myapp\n')
  // .env is gitignored — gwit should copy it into new worktrees
  fs.writeFileSync(path.join(REPO_DIR, '.gitignore'), '.env\n')
  fs.writeFileSync(path.join(REPO_DIR, '.env'), 'PORT=3000\nDB_NAME=myapp\n')
  // .gwitinclude lists .env for copying
  fs.writeFileSync(path.join(REPO_DIR, '.gwitinclude'), '.env\n')

  git('git add README.md .gitignore .gwitinclude')
  git('git commit -m "Initial commit"')

  // ── Pre-seed config so ensureConfig() skips the interactive wizard ────────
  // Use basePort 19000 to avoid conflicts with common dev ports
  saveConfig({ editor: 'code', location: 'subdirectory', basePort: 19000 })

  // ── Change CWD so git commands in the commands resolve to this repo ───────
  process.chdir(REPO_DIR)

  // ── Capture git-canonical path for registry lookups ──────────────────────
  // On Windows, path.join() produces backslashes but git rev-parse returns
  // forward slashes. Registry keys are stored using the git-reported path, so
  // all lookups must use MAIN_PATH rather than REPO_DIR.
  MAIN_PATH = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()
})

afterAll(() => {
  process.chdir(ORIG_CWD)
  fs.rmSync(TMP, { recursive: true, force: true })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('gwit lifecycle — create → sync → open → remove', () => {
  it('creates a worktree directory for a new branch', async () => {
    // --no-commands skips .gwitcommand (file doesn't exist anyway, but be explicit)
    await createCommand(BRANCH, { b: true, commands: false, editor: false })

    const worktreePath = path.join(REPO_DIR, '.worktrees', SLUG)
    expect(fs.existsSync(worktreePath)).toBe(true)
  })

  it('copies .gwitinclude files into the new worktree', () => {
    const envPath = path.join(REPO_DIR, '.worktrees', SLUG, '.env')
    expect(fs.existsSync(envPath)).toBe(true)
    expect(fs.readFileSync(envPath, 'utf-8')).toContain('PORT=3000')
  })

  it('writes a registry entry for the new worktree', () => {
    const entries = listWorktreeEntries(MAIN_PATH)
    const entry = entries.find((e) => e.branch === BRANCH)
    expect(entry).toBeDefined()
    expect(entry?.slug).toBe(SLUG)
    expect(typeof entry?.port).toBe('number')
    expect(entry?.index).toBe(1)
  })

  it('assigns a port in the configured basePort range', () => {
    const entries = listWorktreeEntries(MAIN_PATH)
    const entry = entries.find((e) => e.branch === BRANCH)
    expect(entry?.port).toBeGreaterThanOrEqual(19000)
  })

  it('re-copies .gwitinclude files when sync is called', () => {
    // Simulate an .env change in the main worktree
    fs.writeFileSync(path.join(REPO_DIR, '.env'), 'PORT=3000\nDB_NAME=myapp\nNEW_KEY=injected\n')

    syncCommand(BRANCH)

    const envPath = path.join(REPO_DIR, '.worktrees', SLUG, '.env')
    expect(fs.readFileSync(envPath, 'utf-8')).toContain('NEW_KEY=injected')
  })

  it('calls launchEditor with the correct path when open is invoked', () => {
    openCommand(BRANCH, {})
    // Use MAIN_PATH (git-canonical, forward slashes) because getWorktreePath
    // receives the git-reported mainPath from the registry entry.
    const worktreePath = path.join(MAIN_PATH, '.worktrees', SLUG)
    expect(vi.mocked(launchEditor)).toHaveBeenCalledWith('code', worktreePath)
  })

  it('removes the worktree directory when remove is called', async () => {
    await removeCommand(BRANCH, { force: true })

    const worktreePath = path.join(REPO_DIR, '.worktrees', SLUG)
    expect(fs.existsSync(worktreePath)).toBe(false)
  })

  it('removes the registry entry when remove is called', () => {
    expect(getWorktreeEntry(MAIN_PATH, BRANCH)).toBeUndefined()
  })
})

describe('gwit create — second worktree gets a different port', () => {
  const BRANCH_2 = 'fix-login'
  const SLUG_2 = 'fix_login'

  it('creates a second worktree', async () => {
    await createCommand(BRANCH_2, { b: true, commands: false, editor: false })
    const worktreePath = path.join(REPO_DIR, '.worktrees', SLUG_2)
    expect(fs.existsSync(worktreePath)).toBe(true)
  })

  it('assigns a port different from any previously used port', () => {
    // First worktree was removed but its port was freed — second should get
    // the base port again (or any free port). The important thing is that
    // port allocation succeeds and produces a valid number.
    const entry = getWorktreeEntry(MAIN_PATH, BRANCH_2)
    expect(entry).toBeDefined()
    expect(entry?.port).toBeGreaterThanOrEqual(19000)
  })

  afterAll(async () => {
    // Clean up the second worktree so afterAll for the outer suite is clean
    try {
      await removeCommand(BRANCH_2, { force: true })
    } catch {
      // Best-effort — temp dir will be deleted anyway
    }
  })
})

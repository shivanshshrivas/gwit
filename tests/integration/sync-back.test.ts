import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'

import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest'

const TMP = path.join(os.tmpdir(), `gwit-sync-back-${Date.now()}`)
const GWIT_DIR = path.join(TMP, '.gwit')
const REGISTRY_PATH = path.join(GWIT_DIR, 'worktrees.json')
const CONFIG_PATH = path.join(TMP, '.gwitrc')
const SNAPSHOTS_DIR = path.join(GWIT_DIR, 'snapshots')

vi.mock('../../src/lib/paths', () => ({
  getGwitDir: () => GWIT_DIR,
  getRegistryPath: () => REGISTRY_PATH,
  getConfigPath: () => CONFIG_PATH,
  getSnapshotsDir: () => SNAPSHOTS_DIR,
  getSnapshotDir: (slug: string) => path.join(SNAPSHOTS_DIR, slug),
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
import { saveConfig } from '../../src/core/config'

const BRANCH = 'feature-sync-back'
const SLUG = 'feature_sync_back'
const ORIG_CWD = process.cwd()

let REPO_DIR: string

beforeAll(async () => {
  fs.mkdirSync(GWIT_DIR, { recursive: true })

  REPO_DIR = path.join(TMP, 'repo')
  fs.mkdirSync(REPO_DIR, { recursive: true })

  const git = (cmd: string) => execSync(cmd, { cwd: REPO_DIR, stdio: 'pipe' })
  git('git init')
  git('git config user.email "test@gwit.test"')
  git('git config user.name "gwit test"')

  fs.writeFileSync(path.join(REPO_DIR, 'README.md'), '# sync-back integration\n', 'utf-8')
  fs.writeFileSync(path.join(REPO_DIR, '.gitignore'), '.env\n.local.env\n.private/docs/\n', 'utf-8')
  fs.writeFileSync(
    path.join(REPO_DIR, '.gwitinclude'),
    '.env\n.local.env\n.private/docs/\n',
    'utf-8'
  )
  fs.writeFileSync(path.join(REPO_DIR, '.env'), 'A=1\nB=1\nC=1\n', 'utf-8')
  fs.writeFileSync(path.join(REPO_DIR, '.local.env'), 'TOKEN=base\n', 'utf-8')
  fs.mkdirSync(path.join(REPO_DIR, '.private', 'docs'), { recursive: true })
  fs.writeFileSync(path.join(REPO_DIR, '.private', 'docs', 'somefile.md'), 'base-doc\n', 'utf-8')

  git('git add README.md .gitignore .gwitinclude')
  git('git commit -m "init"')

  saveConfig({ editor: 'code', location: 'subdirectory', basePort: 22000 })
  process.chdir(REPO_DIR)
  await createCommand(BRANCH, { b: true, commands: false, editor: false })
})

afterAll(async () => {
  try {
    await removeCommand(BRANCH, { force: true })
  } catch {
    // Best effort cleanup.
  }

  process.chdir(ORIG_CWD)
  fs.rmSync(TMP, { recursive: true, force: true })
})

describe('gwit sync --back', () => {
  it('creates a snapshot for copied .gwitinclude files', async () => {
    const manifestPath = path.join(SNAPSHOTS_DIR, SLUG, 'manifest.json')
    expect(fs.existsSync(manifestPath)).toBe(true)
  })

  it('performs three-way merge with clean merges and conflict markers', () => {
    const worktreePath = path.join(REPO_DIR, '.worktrees', SLUG)

    // Clean merge case: each side edits a different line.
    fs.writeFileSync(path.join(REPO_DIR, '.env'), 'A=2\nB=1\nC=1\n', 'utf-8')
    fs.writeFileSync(path.join(worktreePath, '.env'), 'A=1\nB=1\nC=2\n', 'utf-8')

    // Conflict case: both sides edit the same line differently.
    fs.writeFileSync(path.join(REPO_DIR, '.local.env'), 'TOKEN=main\n', 'utf-8')
    fs.writeFileSync(path.join(worktreePath, '.local.env'), 'TOKEN=worktree\n', 'utf-8')

    syncCommand(BRANCH, { back: true })

    const mergedEnv = fs.readFileSync(path.join(REPO_DIR, '.env'), 'utf-8')
    expect(mergedEnv).toContain('A=2')
    expect(mergedEnv).toContain('C=2')
    expect(mergedEnv).not.toContain('<<<<<<<')

    const conflicted = fs.readFileSync(path.join(REPO_DIR, '.local.env'), 'utf-8')
    expect(conflicted).toContain('<<<<<<< main')
    expect(conflicted).toContain('=======')
    expect(conflicted).toContain('>>>>>>>')
  })

  it('syncs updates and new files in an included ignored directory', () => {
    const worktreePath = path.join(REPO_DIR, '.worktrees', SLUG)
    const mainDocsDir = path.join(REPO_DIR, '.private', 'docs')
    const worktreeDocsDir = path.join(worktreePath, '.private', 'docs')

    fs.writeFileSync(path.join(worktreeDocsDir, 'somefile.md'), 'updated-doc\n', 'utf-8')
    fs.writeFileSync(path.join(worktreeDocsDir, 'somefile1.md'), 'new-doc\n', 'utf-8')

    syncCommand(BRANCH, { back: true })

    expect(fs.readFileSync(path.join(mainDocsDir, 'somefile.md'), 'utf-8')).toBe('updated-doc\n')
    expect(fs.readFileSync(path.join(mainDocsDir, 'somefile1.md'), 'utf-8')).toBe('new-doc\n')
  })

  it('falls back to direct reverse copy when snapshot is missing', () => {
    const worktreePath = path.join(REPO_DIR, '.worktrees', SLUG)
    fs.rmSync(path.join(SNAPSHOTS_DIR, SLUG), { recursive: true, force: true })

    fs.writeFileSync(path.join(worktreePath, '.env'), 'A=from_worktree\n', 'utf-8')
    fs.writeFileSync(path.join(REPO_DIR, '.env'), 'A=from_main\n', 'utf-8')

    syncCommand(BRANCH, { back: true })

    expect(fs.readFileSync(path.join(REPO_DIR, '.env'), 'utf-8')).toBe('A=from_worktree\n')
  })
})

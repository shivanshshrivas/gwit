import * as fs from 'fs'

import { vi, describe, it, expect, beforeEach } from 'vitest'

// vi.mock calls are hoisted before all imports by Vitest.
// 'fs' is mocked so sync.ts's fs.existsSync call can be controlled per-test.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: vi.fn() }
})

vi.mock('../../src/core/git', () => ({
  isGitRepo: vi.fn(),
  getMainWorktreePath: vi.fn(),
  getRepoRoot: vi.fn(),
  listWorktrees: vi.fn(),
}))

vi.mock('../../src/core/registry', () => ({
  getWorktreeEntry: vi.fn(),
}))

vi.mock('../../src/core/config', () => ({
  loadConfig: vi.fn(),
}))

vi.mock('../../src/core/editor', () => ({
  launchEditor: vi.fn(),
}))

vi.mock('../../src/core/files', () => ({
  copyIncludedFiles: vi.fn(),
  reverseCopyIncludedFiles: vi.fn(),
}))

vi.mock('../../src/core/merge', () => ({
  mergeBackIncludedFiles: vi.fn(),
}))

vi.mock('../../src/core/snapshot', () => ({
  readSnapshot: vi.fn(),
}))

vi.mock('../../src/lib/ui', () => ({
  ui: {
    step: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    dim: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    bold: vi.fn((s: string) => s),
  },
}))

import { openCommand } from '../../src/commands/open'
import { syncCommand } from '../../src/commands/sync'
import { GwitError } from '../../src/types'
import { isGitRepo, getMainWorktreePath, getRepoRoot, listWorktrees } from '../../src/core/git'
import { getWorktreeEntry } from '../../src/core/registry'
import { loadConfig } from '../../src/core/config'
import { launchEditor } from '../../src/core/editor'
import { copyIncludedFiles, reverseCopyIncludedFiles } from '../../src/core/files'
import { mergeBackIncludedFiles } from '../../src/core/merge'
import { readSnapshot } from '../../src/core/snapshot'
import { ui } from '../../src/lib/ui'

// ─── Typed mock aliases ────────────────────────────────────────────────────────

const mockIsGitRepo = vi.mocked(isGitRepo)
const mockGetMainWorktreePath = vi.mocked(getMainWorktreePath)
const mockGetRepoRoot = vi.mocked(getRepoRoot)
const mockListWorktrees = vi.mocked(listWorktrees)
const mockGetWorktreeEntry = vi.mocked(getWorktreeEntry)
const mockLoadConfig = vi.mocked(loadConfig)
const mockLaunchEditor = vi.mocked(launchEditor)
const mockCopyIncludedFiles = vi.mocked(copyIncludedFiles)
const mockReverseCopyIncludedFiles = vi.mocked(reverseCopyIncludedFiles)
const mockMergeBackIncludedFiles = vi.mocked(mergeBackIncludedFiles)
const mockReadSnapshot = vi.mocked(readSnapshot)
const mockExistsSync = vi.mocked(fs.existsSync)
const mockUi = vi.mocked(ui)

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MAIN_PATH = '/home/user/myapp'
const ENTRY_PATH = '/home/user/myapp-feature'

const stubEntry = {
  path: ENTRY_PATH,
  port: 3001,
  branch: 'feature',
  slug: 'feature',
  index: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const stubConfig = {
  editor: 'code',
  location: 'sibling' as const,
  basePort: 3000,
}

// ─── openCommand ──────────────────────────────────────────────────────────────

describe('openCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsGitRepo.mockReturnValue(true)
    mockGetMainWorktreePath.mockReturnValue(MAIN_PATH)
    mockGetWorktreeEntry.mockReturnValue(stubEntry)
    mockLoadConfig.mockReturnValue(stubConfig)
  })

  it('throws GwitError when not in a git repository', () => {
    mockIsGitRepo.mockReturnValue(false)
    expect(() => openCommand('feature', {})).toThrow(GwitError)
  })

  it('error message mentions the repository requirement', () => {
    mockIsGitRepo.mockReturnValue(false)
    expect(() => openCommand('feature', {})).toThrow('Not a git repository')
  })

  it('throws GwitError when branch has no registered worktree', () => {
    mockGetWorktreeEntry.mockReturnValue(undefined)
    expect(() => openCommand('feature', {})).toThrow(GwitError)
  })

  it('error message names the missing branch', () => {
    mockGetWorktreeEntry.mockReturnValue(undefined)
    expect(() => openCommand('feature', {})).toThrow("No gwit worktree found for 'feature'")
  })

  it('opens the configured editor at the worktree path when no override is given', () => {
    openCommand('feature', {})
    expect(mockLaunchEditor).toHaveBeenCalledWith('code', ENTRY_PATH)
  })

  it('opens the override editor when options.editor is supplied', () => {
    openCommand('feature', { editor: 'cursor' })
    expect(mockLaunchEditor).toHaveBeenCalledWith('cursor', ENTRY_PATH)
  })
})

// ─── syncCommand ──────────────────────────────────────────────────────────────

describe('syncCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsGitRepo.mockReturnValue(true)
    mockGetMainWorktreePath.mockReturnValue(MAIN_PATH)
    mockGetRepoRoot.mockReturnValue(ENTRY_PATH)
    mockListWorktrees.mockReturnValue([{ path: ENTRY_PATH, head: 'abc123', branch: 'feature' }])
    mockGetWorktreeEntry.mockReturnValue(stubEntry)
    mockCopyIncludedFiles.mockReturnValue([])
    mockReverseCopyIncludedFiles.mockReturnValue([])
    mockMergeBackIncludedFiles.mockReturnValue({
      copied: [],
      merged: [],
      conflicts: [],
      skipped: [],
      binarySkipped: [],
    })
    mockReadSnapshot.mockReturnValue({
      branch: 'feature',
      createdAt: '2026-01-01T00:00:00.000Z',
      files: {},
    })
    mockExistsSync.mockReturnValue(true)
  })

  it('throws GwitError when not in a git repository', () => {
    mockIsGitRepo.mockReturnValue(false)
    expect(() => syncCommand('feature')).toThrow(GwitError)
  })

  it('throws when no branch is given and the shell is in the main worktree', () => {
    mockGetRepoRoot.mockReturnValue(MAIN_PATH)
    expect(() => syncCommand()).toThrow('No branch specified and you are in the main worktree')
  })

  it('throws when no branch is given and the current path is not a known worktree', () => {
    mockListWorktrees.mockReturnValue([])
    expect(() => syncCommand()).toThrow('Could not detect the current worktree')
  })

  it('throws when no branch is given and the current worktree is in detached HEAD state', () => {
    mockListWorktrees.mockReturnValue([{ path: ENTRY_PATH, head: 'abc123', branch: null }])
    expect(() => syncCommand()).toThrow('detached HEAD')
  })

  it('auto-detects the branch from the current linked worktree when no branch is given', () => {
    syncCommand()
    expect(mockGetWorktreeEntry).toHaveBeenCalledWith(MAIN_PATH, 'feature')
  })

  it('uses the provided branch argument directly without running auto-detect', () => {
    syncCommand('feature')
    // getRepoRoot / listWorktrees are only called during auto-detect
    expect(mockGetRepoRoot).not.toHaveBeenCalled()
    expect(mockGetWorktreeEntry).toHaveBeenCalledWith(MAIN_PATH, 'feature')
  })

  it('throws when the branch is not found in the registry', () => {
    mockGetWorktreeEntry.mockReturnValue(undefined)
    expect(() => syncCommand('feature')).toThrow("No gwit worktree found for 'feature'")
  })

  it('throws when the worktree directory no longer exists on disk', () => {
    mockExistsSync.mockReturnValue(false)
    expect(() => syncCommand('feature')).toThrow('Worktree path no longer exists')
  })

  it('reports the number of synced files when files are copied', () => {
    mockCopyIncludedFiles.mockReturnValue(['.env', 'certs/cert.pem'])
    syncCommand('feature')
    expect(mockUi.success).toHaveBeenCalledWith(expect.stringContaining('2 files'))
  })

  it('uses singular "file" when exactly one file is synced', () => {
    mockCopyIncludedFiles.mockReturnValue(['.env'])
    syncCommand('feature')
    expect(mockUi.success).toHaveBeenCalledWith(expect.stringContaining('1 file'))
  })

  it('reports nothing to sync when no files are copied', () => {
    mockCopyIncludedFiles.mockReturnValue([])
    syncCommand('feature')
    expect(mockUi.info).toHaveBeenCalledWith(expect.stringContaining('Nothing to sync'))
  })

  it('uses snapshot-based three-way merge when --back is enabled and snapshot exists', () => {
    syncCommand('feature', { back: true })
    expect(mockMergeBackIncludedFiles).toHaveBeenCalledWith(ENTRY_PATH, MAIN_PATH, 'feature')
    expect(mockReverseCopyIncludedFiles).not.toHaveBeenCalled()
  })

  it('falls back to direct reverse copy when --back is enabled but snapshot is missing', () => {
    mockReadSnapshot.mockReturnValue(undefined)
    mockReverseCopyIncludedFiles.mockReturnValue(['.env'])

    syncCommand('feature', { back: true })

    expect(mockMergeBackIncludedFiles).not.toHaveBeenCalled()
    expect(mockReverseCopyIncludedFiles).toHaveBeenCalledWith(ENTRY_PATH, MAIN_PATH)
    expect(mockUi.warn).toHaveBeenCalledWith(expect.stringContaining('No snapshot found'))
  })
})

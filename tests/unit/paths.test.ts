import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import {
  getGwitDir,
  getRegistryPath,
  getSnapshotsDir,
  getSnapshotDir,
  getConfigPath,
  getWorktreePath,
} from '../../src/lib/paths'

describe('getGwitDir', () => {
  it('returns ~/.gwit', () => {
    expect(getGwitDir()).toBe(path.join(os.homedir(), '.gwit'))
  })
})

describe('getRegistryPath', () => {
  it('returns ~/.gwit/worktrees.json', () => {
    expect(getRegistryPath()).toBe(path.join(os.homedir(), '.gwit', 'worktrees.json'))
  })
})

describe('getSnapshotsDir', () => {
  it('returns ~/.gwit/snapshots', () => {
    expect(getSnapshotsDir()).toBe(path.join(os.homedir(), '.gwit', 'snapshots'))
  })
})

describe('getSnapshotDir', () => {
  it('returns ~/.gwit/snapshots/{slug}', () => {
    expect(getSnapshotDir('feature_auth')).toBe(
      path.join(os.homedir(), '.gwit', 'snapshots', 'feature_auth')
    )
  })
})

describe('getConfigPath', () => {
  it('returns ~/.gwitrc', () => {
    expect(getConfigPath()).toBe(path.join(os.homedir(), '.gwitrc'))
  })
})

describe('getWorktreePath', () => {
  const mainPath = path.join(os.homedir(), 'projects', 'myapp')

  it('sibling mode: creates a sibling dir with repoName-slug', () => {
    const result = getWorktreePath(mainPath, 'sibling', 'fix_auth')
    expect(result).toBe(path.join(os.homedir(), 'projects', 'myapp-fix_auth'))
  })

  it('subdirectory mode: creates .worktrees/{slug} inside main repo', () => {
    const result = getWorktreePath(mainPath, 'subdirectory', 'fix_auth')
    expect(result).toBe(path.join(mainPath, '.worktrees', 'fix_auth'))
  })

  it('sibling mode: uses slug not branch name in the directory', () => {
    const result = getWorktreePath(mainPath, 'sibling', '36_bug_store')
    expect(result).toBe(path.join(os.homedir(), 'projects', 'myapp-36_bug_store'))
  })

  it('sibling mode: handles repo names with existing hyphens', () => {
    const hyphenated = path.join(os.homedir(), 'projects', 'my-app')
    const result = getWorktreePath(hyphenated, 'sibling', 'fix_auth')
    expect(result).toBe(path.join(os.homedir(), 'projects', 'my-app-fix_auth'))
  })
})

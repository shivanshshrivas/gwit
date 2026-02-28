import { describe, it, expect } from 'vitest'
import { _parseWorktreePorcelain } from '../../src/core/git'

describe('_parseWorktreePorcelain', () => {
  it('parses a single main worktree', () => {
    const output = [
      'worktree /home/user/myapp',
      'HEAD abc123def456',
      'branch refs/heads/main',
    ].join('\n')

    const result = _parseWorktreePorcelain(output)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: '/home/user/myapp',
      head: 'abc123def456',
      branch: 'main',
    })
  })

  it('parses multiple worktrees', () => {
    const output = [
      'worktree /home/user/myapp',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      'worktree /home/user/myapp-feature',
      'HEAD def456',
      'branch refs/heads/feature/auth',
    ].join('\n')

    const result = _parseWorktreePorcelain(output)

    expect(result).toHaveLength(2)
    expect(result[1]).toMatchObject({ path: '/home/user/myapp-feature', branch: 'feature/auth' })
  })

  it('strips refs/heads/ prefix from branch names', () => {
    const output = [
      'worktree /home/user/myapp',
      'HEAD abc123',
      'branch refs/heads/36-bug-store',
    ].join('\n')

    const result = _parseWorktreePorcelain(output)
    expect(result[0]?.branch).toBe('36-bug-store')
  })

  it('returns null branch for detached HEAD worktrees', () => {
    const output = ['worktree /home/user/myapp', 'HEAD abc123', 'detached'].join('\n')

    const result = _parseWorktreePorcelain(output)
    expect(result[0]?.branch).toBeNull()
  })

  it('handles multiple blank lines between blocks', () => {
    const output = [
      'worktree /home/user/myapp',
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      '',
      'worktree /home/user/myapp-fix',
      'HEAD def456',
      'branch refs/heads/fix',
    ].join('\n')

    expect(_parseWorktreePorcelain(output)).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(_parseWorktreePorcelain('')).toEqual([])
  })
})

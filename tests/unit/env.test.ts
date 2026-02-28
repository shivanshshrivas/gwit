import { describe, it, expect } from 'vitest'
import { buildEnvironment } from '../../src/core/env'

// Shared fixture used across all assertions
const ENV = buildEnvironment(
  '36-bug-store',
  '36_bug_store',
  3001,
  '/home/user/myapp-36_bug_store',
  '/home/user/myapp',
  1
)

describe('buildEnvironment', () => {
  it('sets GWIT_BRANCH to the raw branch name', () => {
    expect(ENV.GWIT_BRANCH).toBe('36-bug-store')
  })

  it('sets GWIT_SLUG to the sanitized slug', () => {
    expect(ENV.GWIT_SLUG).toBe('36_bug_store')
  })

  it('sets GWIT_PORT as a string', () => {
    expect(ENV.GWIT_PORT).toBe('3001')
    expect(typeof ENV.GWIT_PORT).toBe('string')
  })

  it('sets GWIT_DB_SUFFIX as underscore-prefixed slug', () => {
    expect(ENV.GWIT_DB_SUFFIX).toBe('_36_bug_store')
  })

  it('sets GWIT_WORKTREE_PATH', () => {
    expect(ENV.GWIT_WORKTREE_PATH).toBe('/home/user/myapp-36_bug_store')
  })

  it('sets GWIT_MAIN_PATH', () => {
    expect(ENV.GWIT_MAIN_PATH).toBe('/home/user/myapp')
  })

  it('sets GWIT_INDEX as a string', () => {
    expect(ENV.GWIT_INDEX).toBe('1')
    expect(typeof ENV.GWIT_INDEX).toBe('string')
  })

  it('produces exactly 7 variables', () => {
    expect(Object.keys(ENV)).toHaveLength(7)
  })

  it('DB_SUFFIX always starts with an underscore', () => {
    const env2 = buildEnvironment('feat', 'feat', 3002, '/wt', '/main', 2)
    expect(env2.GWIT_DB_SUFFIX).toMatch(/^_/)
  })
})

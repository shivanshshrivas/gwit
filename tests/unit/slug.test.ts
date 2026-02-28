import { describe, it, expect } from 'vitest'
import { toSlug } from '../../src/lib/slug'
import { GwitError } from '../../src/types'

describe('toSlug', () => {
  it('replaces hyphens with underscores', () => {
    expect(toSlug('36-bug-store')).toBe('36_bug_store')
  })

  it('replaces slashes with underscores', () => {
    expect(toSlug('feature/auth')).toBe('feature_auth')
  })

  it('handles mixed slashes and hyphens', () => {
    expect(toSlug('fix/login-page')).toBe('fix_login_page')
  })

  it('lowercases the entire string', () => {
    expect(toSlug('CAPS-Branch')).toBe('caps_branch')
  })

  it('collapses consecutive special chars into one underscore', () => {
    expect(toSlug('a--b//c')).toBe('a_b_c')
  })

  it('trims leading underscores', () => {
    expect(toSlug('-leading')).toBe('leading')
  })

  it('trims trailing underscores', () => {
    expect(toSlug('trailing-')).toBe('trailing')
  })

  it('trims both ends', () => {
    expect(toSlug('-both-')).toBe('both')
  })

  it('truncates to 63 characters', () => {
    const longBranch = 'a'.repeat(100)
    const result = toSlug(longBranch)
    expect(result.length).toBe(63)
  })

  it('handles typical issue branch names', () => {
    expect(toSlug('123-fix-user-auth-bug')).toBe('123_fix_user_auth_bug')
  })

  it('handles numeric-only branch names', () => {
    expect(toSlug('1234')).toBe('1234')
  })

  it('throws for branch names that produce an empty slug', () => {
    expect(() => toSlug('---')).toThrow()
    expect(() => toSlug('///')).toThrow()
    expect(() => toSlug('!@#$%')).toThrow()
  })

  it('throws with a GwitError', () => {
    expect(() => toSlug('---')).toThrow(GwitError)
  })
})

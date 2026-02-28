import { describe, it, expect } from 'vitest'

import { _validateConfigPatch } from '../../src/commands/config'

// ─── _validateConfigPatch ─────────────────────────────────────────────────────

describe('_validateConfigPatch', () => {
  // ── Unknown keys ────────────────────────────────────────────────────────────

  it('returns an error for an unknown key', () => {
    const result = _validateConfigPatch('unknown', 'value')
    expect(result).toContain("Unknown key 'unknown'")
  })

  it('includes valid keys in the error for an unknown key', () => {
    const result = _validateConfigPatch('bogus', 'val')
    expect(result).toContain('editor')
    expect(result).toContain('location')
    expect(result).toContain('basePort')
  })

  // ── editor ───────────────────────────────────────────────────────────────

  it('accepts a non-empty editor value', () => {
    expect(_validateConfigPatch('editor', 'code')).toBeNull()
  })

  it('accepts any non-empty string as editor', () => {
    expect(_validateConfigPatch('editor', 'cursor')).toBeNull()
    expect(_validateConfigPatch('editor', 'vim')).toBeNull()
    expect(_validateConfigPatch('editor', 'my-custom-editor')).toBeNull()
  })

  it('rejects editor values containing shell metacharacters', () => {
    expect(_validateConfigPatch('editor', 'code; rm -rf ~')).not.toBeNull()
    expect(_validateConfigPatch('editor', 'code | cat /etc/passwd')).not.toBeNull()
    expect(_validateConfigPatch('editor', '$(malicious)')).not.toBeNull()
  })

  it('rejects an empty editor value', () => {
    expect(_validateConfigPatch('editor', '')).not.toBeNull()
  })

  it('rejects a whitespace-only editor value', () => {
    expect(_validateConfigPatch('editor', '   ')).not.toBeNull()
  })

  // ── location ─────────────────────────────────────────────────────────────

  it('accepts "sibling" as a location value', () => {
    expect(_validateConfigPatch('location', 'sibling')).toBeNull()
  })

  it('accepts "subdirectory" as a location value', () => {
    expect(_validateConfigPatch('location', 'subdirectory')).toBeNull()
  })

  it('rejects an invalid location value', () => {
    const result = _validateConfigPatch('location', 'adjacent')
    expect(result).not.toBeNull()
    expect(result).toContain('sibling')
    expect(result).toContain('subdirectory')
  })

  // ── basePort ─────────────────────────────────────────────────────────────

  it('accepts a valid port number string', () => {
    expect(_validateConfigPatch('basePort', '3000')).toBeNull()
  })

  it('accepts boundary port values', () => {
    expect(_validateConfigPatch('basePort', '1')).toBeNull()
    expect(_validateConfigPatch('basePort', '65535')).toBeNull()
  })

  it('rejects port 0', () => {
    expect(_validateConfigPatch('basePort', '0')).not.toBeNull()
  })

  it('rejects a port above 65535', () => {
    expect(_validateConfigPatch('basePort', '65536')).not.toBeNull()
  })

  it('rejects a non-numeric port value', () => {
    expect(_validateConfigPatch('basePort', 'abc')).not.toBeNull()
  })
})

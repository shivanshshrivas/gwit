import { describe, it, expect } from 'vitest'
import { _parseLines } from '../../src/core/files'

describe('_parseLines', () => {
  it('returns entries for plain lines', () => {
    expect(_parseLines('.env\n.env.local')).toEqual(['.env', '.env.local'])
  })

  it('skips blank lines', () => {
    expect(_parseLines('.env\n\n.env.local\n')).toEqual(['.env', '.env.local'])
  })

  it('skips comment lines starting with #', () => {
    const content = '# copy env files\n.env\n# also local\n.env.local'
    expect(_parseLines(content)).toEqual(['.env', '.env.local'])
  })

  it('trims whitespace from each line', () => {
    expect(_parseLines('  .env  \n  .env.local  ')).toEqual(['.env', '.env.local'])
  })

  it('preserves trailing slash on directory entries', () => {
    expect(_parseLines('.private/\nconfig/')).toEqual(['.private/', 'config/'])
  })

  it('handles inline comments on their own line only (no inline stripping)', () => {
    // Lines like ".env # main env" are NOT stripped — the full line is the path
    expect(_parseLines('.env # main env')).toEqual(['.env # main env'])
  })

  it('returns empty array for empty content', () => {
    expect(_parseLines('')).toEqual([])
  })

  it('returns empty array for content with only comments and blanks', () => {
    expect(_parseLines('# comment\n\n# another')).toEqual([])
  })

  it('handles Windows-style CRLF line endings', () => {
    expect(_parseLines('.env\r\n.env.local\r\n')).toEqual(['.env', '.env.local'])
  })
})

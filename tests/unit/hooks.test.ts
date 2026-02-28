import { describe, it, expect } from 'vitest'
import { _parseHookLines } from '../../src/core/hooks'

describe('_parseHookLines', () => {
  it('returns commands for plain lines', () => {
    expect(_parseHookLines('npm install\nnpm run db:setup')).toEqual([
      'npm install',
      'npm run db:setup',
    ])
  })

  it('skips blank lines', () => {
    expect(_parseHookLines('npm install\n\nnpm run db:setup\n')).toEqual([
      'npm install',
      'npm run db:setup',
    ])
  })

  it('skips comment lines starting with #', () => {
    const content = '# install deps\nnpm install\n# setup db\nnpm run db:setup'
    expect(_parseHookLines(content)).toEqual(['npm install', 'npm run db:setup'])
  })

  it('trims leading and trailing whitespace from each line', () => {
    expect(_parseHookLines('  npm install  \n  npm run db:setup  ')).toEqual([
      'npm install',
      'npm run db:setup',
    ])
  })

  it('preserves internal whitespace in commands', () => {
    expect(_parseHookLines('createdb myapp_$GWIT_DB_SUFFIX')).toEqual([
      'createdb myapp_$GWIT_DB_SUFFIX',
    ])
  })

  it('preserves commands with environment variable references', () => {
    const content = [
      '# create isolated database',
      'createdb myapp$GWIT_DB_SUFFIX',
      'PORT=$GWIT_PORT npm run dev &',
    ].join('\n')
    expect(_parseHookLines(content)).toEqual([
      'createdb myapp$GWIT_DB_SUFFIX',
      'PORT=$GWIT_PORT npm run dev &',
    ])
  })

  it('returns empty array for empty content', () => {
    expect(_parseHookLines('')).toEqual([])
  })

  it('returns empty array for content with only comments and blanks', () => {
    expect(_parseHookLines('# comment\n\n# another\n')).toEqual([])
  })

  it('handles Windows-style CRLF line endings', () => {
    expect(_parseHookLines('npm install\r\nnpm run build\r\n')).toEqual([
      'npm install',
      'npm run build',
    ])
  })
})

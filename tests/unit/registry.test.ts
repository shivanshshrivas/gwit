import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// ── Mocks ─────────────────────────────────────────────────────────────────────
// vi.mock is hoisted before imports by Vitest's transform, so the registry
// module will load using the fake paths below.

const TMP_DIR = path.join(os.tmpdir(), `gwit-registry-test-${Date.now()}`)
const REGISTRY_PATH = path.join(TMP_DIR, 'worktrees.json')

vi.mock('../../src/lib/paths', () => ({
  getRegistryPath: () => REGISTRY_PATH,
  getGwitDir: () => TMP_DIR,
  getConfigPath: () => path.join(TMP_DIR, '.gwitrc'),
  getWorktreePath: vi.fn(),
}))

import {
  readRegistry,
  peekNextIndex,
  addWorktreeEntry,
  removeWorktreeEntry,
  getWorktreeEntry,
  listWorktreeEntries,
} from '../../src/core/registry'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEntry(branch: string, port: number, index: number) {
  return {
    path: `/home/user/myapp-${branch}`,
    port,
    branch,
    slug: branch.replace(/-/g, '_'),
    index,
    createdAt: new Date().toISOString(),
  }
}

const MAIN_PATH = '/home/user/myapp'

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeAll(() => {
  fs.mkdirSync(TMP_DIR, { recursive: true })
})

beforeEach(() => {
  if (fs.existsSync(REGISTRY_PATH)) fs.unlinkSync(REGISTRY_PATH)
})

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('readRegistry', () => {
  it('returns an empty object when no file exists', () => {
    expect(readRegistry()).toEqual({})
  })

  it('parses an existing registry file', () => {
    const data = { [MAIN_PATH]: { nextIndex: 1, worktrees: {} } }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data), 'utf-8')
    expect(readRegistry()).toEqual(data)
  })

  it('recovers from a corrupted file and returns empty registry', () => {
    fs.writeFileSync(REGISTRY_PATH, '{ not valid json }', 'utf-8')
    const result = readRegistry()
    expect(result).toEqual({})
    expect(fs.existsSync(`${REGISTRY_PATH}.bak`)).toBe(true)
  })
})

describe('peekNextIndex', () => {
  it('returns 1 for a repo with no existing entries', () => {
    expect(peekNextIndex(MAIN_PATH)).toBe(1)
  })

  it('returns nextIndex + 1 for a repo with an existing counter', () => {
    const data = { [MAIN_PATH]: { nextIndex: 5, worktrees: {} } }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data), 'utf-8')
    expect(peekNextIndex(MAIN_PATH)).toBe(6)
  })
})

describe('addWorktreeEntry', () => {
  it('creates an entry and sets nextIndex', async () => {
    await addWorktreeEntry(MAIN_PATH, makeEntry('fix-auth', 3001, 1))

    const registry = readRegistry()
    expect(registry[MAIN_PATH]?.worktrees['fix-auth']).toMatchObject({ port: 3001, index: 1 })
    expect(registry[MAIN_PATH]?.nextIndex).toBe(1)
  })

  it('adds a second entry to the same repo', async () => {
    await addWorktreeEntry(MAIN_PATH, makeEntry('fix-auth', 3001, 1))
    await addWorktreeEntry(MAIN_PATH, makeEntry('feat-ui', 3002, 2))

    const entries = listWorktreeEntries(MAIN_PATH)
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.branch).sort()).toEqual(['feat-ui', 'fix-auth'])
  })

  it('bumps nextIndex to the highest index seen across concurrent runs', async () => {
    // Two concurrent runs that both peeked index=1
    await addWorktreeEntry(MAIN_PATH, makeEntry('branch-a', 3001, 1))
    await addWorktreeEntry(MAIN_PATH, makeEntry('branch-b', 3002, 1))
    expect(readRegistry()[MAIN_PATH]?.nextIndex).toBe(1)
  })
})

describe('removeWorktreeEntry', () => {
  it('removes an existing entry', async () => {
    await addWorktreeEntry(MAIN_PATH, makeEntry('fix-auth', 3001, 1))
    await removeWorktreeEntry(MAIN_PATH, 'fix-auth')
    expect(getWorktreeEntry(MAIN_PATH, 'fix-auth')).toBeUndefined()
  })

  it('no-ops when the entry does not exist', async () => {
    await expect(removeWorktreeEntry(MAIN_PATH, 'nonexistent')).resolves.not.toThrow()
  })
})

describe('getWorktreeEntry', () => {
  it('returns the entry for a known branch', async () => {
    await addWorktreeEntry(MAIN_PATH, makeEntry('fix-auth', 3001, 1))
    expect(getWorktreeEntry(MAIN_PATH, 'fix-auth')).toMatchObject({ port: 3001 })
  })

  it('returns undefined for an unknown branch', () => {
    expect(getWorktreeEntry(MAIN_PATH, 'unknown')).toBeUndefined()
  })
})

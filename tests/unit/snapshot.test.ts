import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest'

const TMP = path.join(
  os.tmpdir(),
  `gwit-snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`
)
const SNAPSHOTS_DIR = path.join(TMP, '.gwit', 'snapshots')
const MAIN_PATH = path.join(TMP, 'repo')

vi.mock('../../src/lib/paths', () => ({
  getSnapshotsDir: () => SNAPSHOTS_DIR,
  getSnapshotDir: (slug: string) => path.join(SNAPSHOTS_DIR, slug),
}))

import {
  hashFile,
  createSnapshot,
  readSnapshot,
  getSnapshotFilePath,
  deleteSnapshot,
  renameSnapshot,
} from '../../src/core/snapshot'

describe('snapshot', () => {
  beforeEach(() => {
    fs.rmSync(TMP, { recursive: true, force: true })
    fs.mkdirSync(MAIN_PATH, { recursive: true })
  })

  afterAll(() => {
    fs.rmSync(TMP, { recursive: true, force: true })
  })

  it('hashFile returns deterministic SHA-256 hex digest', () => {
    const filePath = path.join(MAIN_PATH, '.env')
    fs.writeFileSync(filePath, 'PORT=3000\n', 'utf-8')

    const hashA = hashFile(filePath)
    const hashB = hashFile(filePath)

    expect(hashA).toBe(hashB)
    expect(hashA).toMatch(/^[a-f0-9]{64}$/)
  })

  it('createSnapshot stores manifest metadata and base file copies', () => {
    fs.mkdirSync(path.join(MAIN_PATH, '.private', 'docs'), { recursive: true })
    fs.writeFileSync(path.join(MAIN_PATH, '.env'), 'API_URL=http://localhost:3000\n', 'utf-8')
    fs.writeFileSync(path.join(MAIN_PATH, '.private', 'docs', 'spec.md'), '# spec\n', 'utf-8')

    createSnapshot('feature_auth', 'feature/auth', MAIN_PATH, ['.env', '.private/'])

    const manifest = readSnapshot('feature_auth')
    expect(manifest).toBeDefined()
    expect(manifest?.branch).toBe('feature/auth')
    expect(typeof manifest?.createdAt).toBe('string')
    expect(Object.keys(manifest?.files ?? {}).sort()).toEqual(['.env', '.private/docs/spec.md'])

    const envCopy = getSnapshotFilePath('feature_auth', '.env')
    const specCopy = getSnapshotFilePath('feature_auth', '.private/docs/spec.md')
    expect(envCopy).toBeDefined()
    expect(specCopy).toBeDefined()
    expect(fs.readFileSync(envCopy!, 'utf-8')).toContain('API_URL=http://localhost:3000')
    expect(fs.readFileSync(specCopy!, 'utf-8')).toContain('# spec')
  })

  it('deleteSnapshot removes the snapshot directory', () => {
    fs.writeFileSync(path.join(MAIN_PATH, '.env'), 'PORT=3000\n', 'utf-8')
    createSnapshot('feature_auth', 'feature/auth', MAIN_PATH, ['.env'])

    expect(readSnapshot('feature_auth')).toBeDefined()
    deleteSnapshot('feature_auth')
    expect(readSnapshot('feature_auth')).toBeUndefined()
  })

  it('renameSnapshot moves the snapshot to a new slug', () => {
    fs.writeFileSync(path.join(MAIN_PATH, '.env'), 'PORT=3000\n', 'utf-8')
    createSnapshot('old_slug', 'feature/auth', MAIN_PATH, ['.env'])

    renameSnapshot('old_slug', 'new_slug')

    expect(readSnapshot('old_slug')).toBeUndefined()
    expect(readSnapshot('new_slug')).toBeDefined()
    const copied = getSnapshotFilePath('new_slug', '.env')
    expect(copied).toBeDefined()
    expect(fs.readFileSync(copied!, 'utf-8')).toContain('PORT=3000')
  })
})

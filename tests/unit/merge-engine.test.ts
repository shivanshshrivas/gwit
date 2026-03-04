import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'

import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest'

const TMP = path.join(
  os.tmpdir(),
  `gwit-merge-engine-${Date.now()}-${Math.random().toString(36).slice(2)}`
)
const SNAPSHOTS_DIR = path.join(TMP, '.gwit', 'snapshots')

vi.mock('../../src/lib/paths', () => ({
  getSnapshotsDir: () => SNAPSHOTS_DIR,
  getSnapshotDir: (slug: string) => path.join(SNAPSHOTS_DIR, slug),
}))

import { createSnapshot } from '../../src/core/snapshot'
import { mergeBackIncludedFiles } from '../../src/core/merge'

function runGit(cwd: string, args: string): void {
  execSync(`git ${args}`, { cwd, stdio: 'pipe' })
}

function setupRepo(
  caseName: string,
  baseContent: string | Buffer
): {
  mainPath: string
  worktreePath: string
  slug: string
} {
  const caseDir = path.join(TMP, caseName)
  const mainPath = path.join(caseDir, 'main')
  const worktreePath = path.join(caseDir, 'worktree')
  const slug = `${caseName}_slug`

  fs.mkdirSync(mainPath, { recursive: true })
  fs.mkdirSync(worktreePath, { recursive: true })

  runGit(mainPath, 'init')
  runGit(mainPath, 'config user.email "test@gwit.test"')
  runGit(mainPath, 'config user.name "gwit test"')

  fs.writeFileSync(path.join(mainPath, '.gitignore'), '.env\n', 'utf-8')
  fs.writeFileSync(path.join(mainPath, 'README.md'), '# merge-engine test\n', 'utf-8')
  runGit(mainPath, 'add .gitignore README.md')
  runGit(mainPath, 'commit -m "init"')

  fs.writeFileSync(path.join(mainPath, '.env'), baseContent)
  fs.writeFileSync(path.join(worktreePath, '.env'), baseContent)
  createSnapshot(slug, `feature/${caseName}`, mainPath, ['.env'])

  return { mainPath, worktreePath, slug }
}

describe('mergeBackIncludedFiles', () => {
  beforeEach(() => {
    fs.rmSync(TMP, { recursive: true, force: true })
    fs.mkdirSync(TMP, { recursive: true })
  })

  afterAll(() => {
    fs.rmSync(TMP, { recursive: true, force: true })
  })

  it('skips unchanged files', () => {
    const { mainPath, worktreePath, slug } = setupRepo('unchanged', 'KEY=base\n')

    const result = mergeBackIncludedFiles(worktreePath, mainPath, slug)

    expect(result.skipped).toContain('.env')
    expect(result.copied).toEqual([])
    expect(result.merged).toEqual([])
    expect(result.conflicts).toEqual([])
    expect(result.binarySkipped).toEqual([])
  })

  it('copies worktree-only changes when main matches snapshot', () => {
    const { mainPath, worktreePath, slug } = setupRepo('worktree_only', 'KEY=base\n')
    fs.writeFileSync(path.join(worktreePath, '.env'), 'KEY=worktree\n', 'utf-8')

    const result = mergeBackIncludedFiles(worktreePath, mainPath, slug)

    expect(result.copied).toEqual(['.env'])
    expect(fs.readFileSync(path.join(mainPath, '.env'), 'utf-8')).toBe('KEY=worktree\n')
  })

  it('skips main-only changes when worktree still matches snapshot', () => {
    const { mainPath, worktreePath, slug } = setupRepo('main_only', 'KEY=base\n')
    fs.writeFileSync(path.join(mainPath, '.env'), 'KEY=main\n', 'utf-8')

    const result = mergeBackIncludedFiles(worktreePath, mainPath, slug)

    expect(result.skipped).toContain('.env')
    expect(result.copied).toEqual([])
    expect(fs.readFileSync(path.join(mainPath, '.env'), 'utf-8')).toBe('KEY=main\n')
  })

  it('skips convergent changes when main and worktree are identical', () => {
    const { mainPath, worktreePath, slug } = setupRepo('convergent', 'KEY=base\n')
    fs.writeFileSync(path.join(mainPath, '.env'), 'KEY=aligned\n', 'utf-8')
    fs.writeFileSync(path.join(worktreePath, '.env'), 'KEY=aligned\n', 'utf-8')

    const result = mergeBackIncludedFiles(worktreePath, mainPath, slug)

    expect(result.skipped).toContain('.env')
    expect(result.merged).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it('cleanly merges divergent text changes with git merge-file', () => {
    const { mainPath, worktreePath, slug } = setupRepo('clean_merge', 'A=1\nB=1\nC=1\n')
    fs.writeFileSync(path.join(mainPath, '.env'), 'A=2\nB=1\nC=1\n', 'utf-8')
    fs.writeFileSync(path.join(worktreePath, '.env'), 'A=1\nB=1\nC=2\n', 'utf-8')

    const result = mergeBackIncludedFiles(worktreePath, mainPath, slug)

    expect(result.merged).toEqual(['.env'])
    const merged = fs.readFileSync(path.join(mainPath, '.env'), 'utf-8')
    expect(merged).toContain('A=2')
    expect(merged).toContain('C=2')
    expect(merged).not.toContain('<<<<<<<')
  })

  it('writes conflict markers for divergent text conflicts', () => {
    const { mainPath, worktreePath, slug } = setupRepo('conflict', 'KEY=base\n')
    fs.writeFileSync(path.join(mainPath, '.env'), 'KEY=main\n', 'utf-8')
    fs.writeFileSync(path.join(worktreePath, '.env'), 'KEY=worktree\n', 'utf-8')

    const result = mergeBackIncludedFiles(worktreePath, mainPath, slug)

    expect(result.conflicts).toEqual(['.env'])
    const merged = fs.readFileSync(path.join(mainPath, '.env'), 'utf-8')
    expect(merged).toContain('<<<<<<< main')
    expect(merged).toContain('=======')
    expect(merged).toContain('>>>>>>>')
  })

  it('skips divergent binary files', () => {
    const { mainPath, worktreePath, slug } = setupRepo('binary', Buffer.from([1, 0, 2, 3]))
    fs.writeFileSync(path.join(mainPath, '.env'), Buffer.from([9, 0, 2, 3]))
    fs.writeFileSync(path.join(worktreePath, '.env'), Buffer.from([8, 0, 2, 3]))

    const before = fs.readFileSync(path.join(mainPath, '.env'))
    const result = mergeBackIncludedFiles(worktreePath, mainPath, slug)
    const after = fs.readFileSync(path.join(mainPath, '.env'))

    expect(result.binarySkipped).toEqual(['.env'])
    expect(after.equals(before)).toBe(true)
  })

  it('syncs tracked updates and new files from included directories', () => {
    const caseDir = path.join(TMP, 'included_directory_new_file')
    const mainPath = path.join(caseDir, 'main')
    const worktreePath = path.join(caseDir, 'worktree')
    const slug = 'included_directory_new_file_slug'

    fs.mkdirSync(mainPath, { recursive: true })
    fs.mkdirSync(worktreePath, { recursive: true })

    runGit(mainPath, 'init')
    runGit(mainPath, 'config user.email "test@gwit.test"')
    runGit(mainPath, 'config user.name "gwit test"')

    fs.writeFileSync(path.join(mainPath, '.gitignore'), '.private/docs/\n', 'utf-8')
    fs.writeFileSync(path.join(mainPath, '.gwitinclude'), '.private/docs/\n', 'utf-8')
    fs.writeFileSync(path.join(mainPath, 'README.md'), '# merge-engine include test\n', 'utf-8')
    runGit(mainPath, 'add .gitignore .gwitinclude README.md')
    runGit(mainPath, 'commit -m "init"')

    const mainDocsDir = path.join(mainPath, '.private', 'docs')
    const worktreeDocsDir = path.join(worktreePath, '.private', 'docs')
    fs.mkdirSync(mainDocsDir, { recursive: true })
    fs.mkdirSync(worktreeDocsDir, { recursive: true })

    const mainSomeFile = path.join(mainDocsDir, 'somefile.md')
    const worktreeSomeFile = path.join(worktreeDocsDir, 'somefile.md')
    const worktreeNewFile = path.join(worktreeDocsDir, 'somefile1.md')
    const mainNewFile = path.join(mainDocsDir, 'somefile1.md')

    fs.writeFileSync(mainSomeFile, 'base-main\n', 'utf-8')
    fs.copyFileSync(mainSomeFile, worktreeSomeFile)
    createSnapshot(slug, 'feature/include-new-files', mainPath, ['.private/docs/'])

    fs.writeFileSync(worktreeSomeFile, 'updated-in-worktree\n', 'utf-8')
    fs.writeFileSync(worktreeNewFile, 'new-in-worktree\n', 'utf-8')

    const result = mergeBackIncludedFiles(worktreePath, mainPath, slug)

    expect(result.copied).toContain('.private/docs/somefile.md')
    expect(result.copied).toContain('.private/docs/somefile1.md')
    expect(fs.readFileSync(mainSomeFile, 'utf-8')).toBe('updated-in-worktree\n')
    expect(fs.readFileSync(mainNewFile, 'utf-8')).toBe('new-in-worktree\n')
  })
})

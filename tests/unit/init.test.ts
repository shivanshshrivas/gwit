import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import {
  _detectAppName,
  _detectPackageManager,
  _buildIncludeContent,
  _buildCommandContent,
  _buildCleanupContent,
} from '../../src/commands/init'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gwit-init-test-'))
}

// Minimal StackSelection with no services selected
function baseSelection() {
  return {
    packageManager: null as 'npm' | 'pnpm' | 'yarn' | 'bun' | null,
    database: null as 'postgres' | 'mysql' | null,
    appName: 'myapp',
    redis: false,
    dockerCompose: false,
    writeEnvBlock: false,
    extraSetup: [] as string[],
    extraCleanup: [] as string[],
  }
}

// ─── _detectAppName ───────────────────────────────────────────────────────────

describe('_detectAppName', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads name from package.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-app' }))
    expect(_detectAppName(tmpDir)).toBe('my-app')
  })

  it('strips npm scope prefix from package.json name', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: '@org/my-app' }))
    expect(_detectAppName(tmpDir)).toBe('my-app')
  })

  it('falls back to dirname when package.json has no name', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({}))
    expect(_detectAppName(tmpDir)).toBe(path.basename(tmpDir))
  })

  it('falls back to dirname when package.json is absent', () => {
    expect(_detectAppName(tmpDir)).toBe(path.basename(tmpDir))
  })

  it('falls back to dirname when package.json is malformed JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), 'not json')
    expect(_detectAppName(tmpDir)).toBe(path.basename(tmpDir))
  })
})

// ─── _detectPackageManager ────────────────────────────────────────────────────

describe('_detectPackageManager', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('detects bun from bun.lockb', () => {
    fs.writeFileSync(path.join(tmpDir, 'bun.lockb'), '')
    expect(_detectPackageManager(tmpDir)).toBe('bun')
  })

  it('detects pnpm from pnpm-lock.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
    expect(_detectPackageManager(tmpDir)).toBe('pnpm')
  })

  it('detects yarn from yarn.lock', () => {
    fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
    expect(_detectPackageManager(tmpDir)).toBe('yarn')
  })

  it('detects npm from package.json when no other lock file exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}')
    expect(_detectPackageManager(tmpDir)).toBe('npm')
  })

  it('returns null when no package manager indicators are found', () => {
    expect(_detectPackageManager(tmpDir)).toBeNull()
  })

  it('prefers bun over pnpm when both lock files exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'bun.lockb'), '')
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
    expect(_detectPackageManager(tmpDir)).toBe('bun')
  })
})

// ─── _buildIncludeContent ─────────────────────────────────────────────────────

describe('_buildIncludeContent', () => {
  it('contains the header comment', () => {
    const content = _buildIncludeContent([])
    expect(content).toContain('# Files and directories to copy into each new worktree.')
  })

  it('produces only the header when no entries are given', () => {
    const content = _buildIncludeContent([])
    const lines = content.split('\n').filter((l) => l.length > 0 && !l.startsWith('#'))
    expect(lines).toHaveLength(0)
  })

  it('includes all provided entries', () => {
    const content = _buildIncludeContent(['.env', 'node_modules/', 'secrets/'])
    expect(content).toContain('.env')
    expect(content).toContain('node_modules/')
    expect(content).toContain('secrets/')
  })

  it('ends with a newline', () => {
    expect(_buildIncludeContent([])).toMatch(/\n$/)
    expect(_buildIncludeContent(['.env'])).toMatch(/\n$/)
  })
})

// ─── _buildCommandContent ─────────────────────────────────────────────────────

describe('_buildCommandContent', () => {
  it('contains the header with variable documentation', () => {
    const content = _buildCommandContent('myapp', baseSelection())
    expect(content).toContain('$GWIT_PORT')
    expect(content).toContain('$GWIT_DB_SUFFIX')
  })

  it('produces only the header when no services are selected', () => {
    const content = _buildCommandContent('myapp', baseSelection())
    const commands = content.split('\n').filter((l) => l.length > 0 && !l.startsWith('#'))
    expect(commands).toHaveLength(0)
  })

  it('includes npm install when packageManager is npm', () => {
    const sel = { ...baseSelection(), packageManager: 'npm' as const }
    expect(_buildCommandContent('myapp', sel)).toContain('npm install')
  })

  it('includes pnpm install when packageManager is pnpm', () => {
    const sel = { ...baseSelection(), packageManager: 'pnpm' as const }
    expect(_buildCommandContent('myapp', sel)).toContain('pnpm install')
  })

  it('includes createdb with app name for postgres', () => {
    const sel = { ...baseSelection(), database: 'postgres' as const }
    const content = _buildCommandContent('myapp', sel)
    expect(content).toContain('createdb myapp$GWIT_DB_SUFFIX')
  })

  it('includes mysql create for mysql', () => {
    const sel = { ...baseSelection(), database: 'mysql' as const }
    const content = _buildCommandContent('myapp', sel)
    expect(content).toContain('CREATE DATABASE IF NOT EXISTS myapp$GWIT_DB_SUFFIX')
  })

  it('includes docker compose up when dockerCompose is true', () => {
    const sel = { ...baseSelection(), dockerCompose: true }
    const content = _buildCommandContent('myapp', sel)
    expect(content).toContain('COMPOSE_PROJECT_NAME=myapp_$GWIT_SLUG')
    expect(content).toContain('docker compose up -d')
  })

  it('writes PORT to .env when writeEnvBlock is true', () => {
    const sel = { ...baseSelection(), writeEnvBlock: true }
    expect(_buildCommandContent('myapp', sel)).toContain('echo "PORT=$GWIT_PORT" >> .env')
  })

  it('writes DATABASE_URL to .env for postgres when writeEnvBlock is true', () => {
    const sel = { ...baseSelection(), database: 'postgres' as const, writeEnvBlock: true }
    expect(_buildCommandContent('myapp', sel)).toContain('DATABASE_URL=postgres://')
  })

  it('writes REDIS_URL to .env when redis and writeEnvBlock are true', () => {
    const sel = { ...baseSelection(), redis: true, writeEnvBlock: true }
    expect(_buildCommandContent('myapp', sel)).toContain(
      'REDIS_URL=redis://localhost:6379/$GWIT_INDEX'
    )
  })

  it('includes extra setup commands', () => {
    const sel = { ...baseSelection(), extraSetup: ['npm run seed', 'npm run fixtures'] }
    const content = _buildCommandContent('myapp', sel)
    expect(content).toContain('npm run seed')
    expect(content).toContain('npm run fixtures')
  })

  it('uses the provided appName in database commands', () => {
    const sel = { ...baseSelection(), database: 'postgres' as const, appName: 'coolapp' }
    expect(_buildCommandContent('coolapp', sel)).toContain('coolapp$GWIT_DB_SUFFIX')
  })

  it('ends with a newline', () => {
    expect(_buildCommandContent('myapp', baseSelection())).toMatch(/\n$/)
  })
})

// ─── _buildCleanupContent ─────────────────────────────────────────────────────

describe('_buildCleanupContent', () => {
  it('contains the cleanup header', () => {
    const content = _buildCleanupContent('myapp', baseSelection())
    expect(content).toContain('# Commands run inside the worktree before gwit remove.')
  })

  it('includes a placeholder comment when no teardown commands are configured', () => {
    const content = _buildCleanupContent('myapp', baseSelection())
    expect(content).toContain('# No teardown commands configured.')
  })

  it('includes dropdb for postgres', () => {
    const sel = { ...baseSelection(), database: 'postgres' as const }
    expect(_buildCleanupContent('myapp', sel)).toContain('dropdb --if-exists myapp$GWIT_DB_SUFFIX')
  })

  it('includes mysql drop for mysql', () => {
    const sel = { ...baseSelection(), database: 'mysql' as const }
    expect(_buildCleanupContent('myapp', sel)).toContain(
      'DROP DATABASE IF EXISTS myapp$GWIT_DB_SUFFIX'
    )
  })

  it('includes docker compose down -v when dockerCompose is true', () => {
    const sel = { ...baseSelection(), dockerCompose: true }
    const content = _buildCleanupContent('myapp', sel)
    expect(content).toContain('docker compose down -v')
    expect(content).toContain('COMPOSE_PROJECT_NAME=myapp_$GWIT_SLUG')
  })

  it('includes extra cleanup commands', () => {
    const sel = { ...baseSelection(), extraCleanup: ['rm -rf tmp/', 'docker volume prune -f'] }
    const content = _buildCleanupContent('myapp', sel)
    expect(content).toContain('rm -rf tmp/')
    expect(content).toContain('docker volume prune -f')
  })

  it('does not include placeholder when real commands are present', () => {
    const sel = { ...baseSelection(), database: 'postgres' as const }
    expect(_buildCleanupContent('myapp', sel)).not.toContain('# No teardown commands configured.')
  })

  it('ends with a newline', () => {
    expect(_buildCleanupContent('myapp', baseSelection())).toMatch(/\n$/)
  })
})

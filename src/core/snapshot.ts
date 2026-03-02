import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'

import type { SnapshotManifest } from '../types'
import { getSnapshotDir, getSnapshotsDir } from '../lib/paths'

// ─── Constants ────────────────────────────────────────────────────────────────

const FILES_DIR_NAME = 'files'
const MANIFEST_FILE_NAME = 'manifest.json'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/')
}

function tryChmod(filePath: string, mode: number): void {
  try {
    fs.chmodSync(filePath, mode)
  } catch {
    // Windows and some filesystems do not support POSIX mode bits.
  }
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 })
  tryChmod(dirPath, 0o700)
}

function getManifestPath(slug: string): string {
  return path.join(getSnapshotDir(slug), MANIFEST_FILE_NAME)
}

function getSnapshotFilesDir(slug: string): string {
  return path.join(getSnapshotDir(slug), FILES_DIR_NAME)
}

function collectEntryFiles(entryPath: string, mainPath: string): string[] {
  const resolvedMain = path.resolve(mainPath)
  const resolvedEntry = path.resolve(entryPath)
  const relToMain = path.relative(resolvedMain, resolvedEntry)
  if (relToMain.startsWith('..') || path.isAbsolute(relToMain)) {
    return []
  }

  const stat = fs.statSync(resolvedEntry)
  if (stat.isFile()) {
    return [normalizeRelPath(relToMain)]
  }

  const files: string[] = []
  const stack = [resolvedEntry]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const childPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(childPath)
        continue
      }

      if (entry.isFile()) {
        const rel = path.relative(resolvedMain, childPath)
        if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
          files.push(normalizeRelPath(rel))
        }
      }
    }
  }

  return files
}

function writeManifestAtomic(slug: string, manifest: SnapshotManifest): void {
  const snapshotDir = getSnapshotDir(slug)
  const manifestPath = getManifestPath(slug)
  const tmpPath = path.join(
    snapshotDir,
    `${MANIFEST_FILE_NAME}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`
  )

  fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), 'utf-8')
  tryChmod(tmpPath, 0o600)
  fs.renameSync(tmpPath, manifestPath)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Computes a stable SHA-256 hex digest of a file's bytes.
 * @param filePath - Absolute path to a file on disk.
 * @returns SHA-256 hex digest.
 */
export function hashFile(filePath: string): string {
  const data = fs.readFileSync(filePath)
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Captures a base snapshot for copied `.gwitinclude` files at create-time.
 *
 * Stores:
 * - `manifest.json` with per-file hashes/sizes
 * - `files/` directory with raw base file copies
 *
 * @param slug - Worktree slug used as the snapshot key.
 * @param branch - Branch associated with the worktree.
 * @param mainPath - Absolute path to the main repo.
 * @param copiedFiles - Entries that were copied during worktree creation.
 */
export function createSnapshot(
  slug: string,
  branch: string,
  mainPath: string,
  copiedFiles: string[]
): void {
  const snapshotsDir = getSnapshotsDir()
  const snapshotDir = getSnapshotDir(slug)
  const filesDir = getSnapshotFilesDir(slug)

  ensureDir(snapshotsDir)

  if (fs.existsSync(snapshotDir)) {
    fs.rmSync(snapshotDir, { recursive: true, force: true })
  }

  ensureDir(snapshotDir)
  ensureDir(filesDir)

  const relPaths = new Set<string>()
  for (const entry of copiedFiles) {
    const entryPath = entry.replace(/\/$/, '')
    if (entryPath.length === 0) continue

    const sourcePath = path.resolve(mainPath, entryPath)
    if (!fs.existsSync(sourcePath)) continue

    for (const relPath of collectEntryFiles(sourcePath, mainPath)) {
      relPaths.add(relPath)
    }
  }

  const manifest: SnapshotManifest = {
    branch,
    createdAt: new Date().toISOString(),
    files: {},
  }

  for (const relPath of [...relPaths].sort()) {
    const sourcePath = path.resolve(mainPath, relPath)
    if (!fs.existsSync(sourcePath)) continue

    const destPath = path.join(filesDir, relPath)
    ensureDir(path.dirname(destPath))
    fs.copyFileSync(sourcePath, destPath)
    tryChmod(destPath, 0o600)

    const stat = fs.statSync(sourcePath)
    manifest.files[relPath] = {
      hash: hashFile(sourcePath),
      size: stat.size,
    }
  }

  writeManifestAtomic(slug, manifest)
}

/**
 * Reads the snapshot manifest for a worktree slug.
 * @param slug - Worktree slug used as the snapshot key.
 * @returns Parsed manifest or undefined if not found / invalid.
 */
export function readSnapshot(slug: string): SnapshotManifest | undefined {
  const manifestPath = getManifestPath(slug)
  if (!fs.existsSync(manifestPath)) return undefined

  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as SnapshotManifest
  } catch {
    return undefined
  }
}

/**
 * Resolves a stored base-copy file path from a snapshot.
 * @param slug - Worktree slug used as the snapshot key.
 * @param relPath - Repo-relative file path from the snapshot manifest.
 * @returns Absolute path to snapshot file, or undefined if missing/invalid.
 */
export function getSnapshotFilePath(slug: string, relPath: string): string | undefined {
  const filesDir = path.resolve(getSnapshotFilesDir(slug))
  const targetPath = path.resolve(filesDir, relPath)
  const relToRoot = path.relative(filesDir, targetPath)
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
    return undefined
  }
  return fs.existsSync(targetPath) ? targetPath : undefined
}

/**
 * Deletes a snapshot directory and all contents.
 * @param slug - Worktree slug used as the snapshot key.
 */
export function deleteSnapshot(slug: string): void {
  const snapshotDir = getSnapshotDir(slug)
  if (!fs.existsSync(snapshotDir)) return
  fs.rmSync(snapshotDir, { recursive: true, force: true })
}

/**
 * Renames a snapshot directory when a worktree slug changes.
 * @param oldSlug - Existing snapshot slug.
 * @param newSlug - New snapshot slug.
 */
export function renameSnapshot(oldSlug: string, newSlug: string): void {
  const oldDir = getSnapshotDir(oldSlug)
  const newDir = getSnapshotDir(newSlug)

  if (!fs.existsSync(oldDir)) return

  ensureDir(getSnapshotsDir())
  if (fs.existsSync(newDir)) {
    fs.rmSync(newDir, { recursive: true, force: true })
  }

  fs.renameSync(oldDir, newDir)
}

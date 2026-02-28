import * as net from 'net'

import { GwitError } from '../types'
import { readRegistry } from './registry'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PORT_SCAN = 100

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Checks whether a port is free by attempting to bind a TCP server to it.
 * Exported with `_` prefix for unit testing only.
 *
 * @param port - The port number to probe.
 * @returns True if the port is available to bind.
 */
export function _isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    // Close the server on error (e.g. EACCES) to avoid leaking the socket
    // handle — without this, the underlying fd stays open until GC
    server.once('error', () => server.close(() => resolve(false)))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Finds and returns the lowest free port starting from `basePort`.
 *
 * Skips ports already assigned to any gwit worktree across all repos (from
 * the registry) AND ports currently in use by non-gwit processes (TCP probe).
 * Scans up to MAX_PORT_SCAN (100) ports before giving up.
 *
 * @param basePort - The port to start scanning from (from user config).
 * @returns The first available port number.
 * @throws {GwitError} If no free port is found within the scan range.
 */
export async function allocatePort(basePort: number): Promise<number> {
  const registry = readRegistry()

  // Collect ports assigned to ALL gwit worktrees across all repos so that
  // separate projects running in parallel don't receive the same port
  const assignedPorts = new Set<number>()
  for (const repo of Object.values(registry)) {
    for (const entry of Object.values(repo.worktrees)) {
      assignedPorts.add(entry.port)
    }
  }

  for (let port = basePort; port < basePort + MAX_PORT_SCAN; port++) {
    if (assignedPorts.has(port)) continue
    if (await _isPortFree(port)) return port
  }

  throw new GwitError(
    `No free port found in range ${basePort}–${basePort + MAX_PORT_SCAN - 1}.`,
    `Change your base port: gwit config set basePort 4000`
  )
}

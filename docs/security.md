# Security

This document describes gwit's threat model, the security controls built into the tool,
the trust boundaries it operates within, and how to report vulnerabilities.

---

## Table of Contents

1. [Threat Model](#threat-model)
2. [Shell Injection Prevention](#shell-injection-prevention)
3. [Environment Variable Safety](#environment-variable-safety)
4. [Path Traversal Prevention](#path-traversal-prevention)
5. [File Permissions](#file-permissions)
6. [Hook Execution — Trust Model](#hook-execution--trust-model)
7. [Registry Integrity](#registry-integrity)
8. [Port Allocation](#port-allocation)
9. [Input Validation](#input-validation)
10. [Merge Command Safety](#merge-command-safety)
11. [Dependency Surface](#dependency-surface)
12. [Reporting a Vulnerability](#reporting-a-vulnerability)

---

## Threat Model

gwit is a **local developer tool** that runs under your own user account. It does not
run as a server, does not accept network connections, and does not store credentials.

### What gwit protects against

- **Shell injection** via branch names, paths, or config values reaching `execSync`
- **Path traversal** in `.gwitinclude` file lists escaping the repository
- **Env var injection** of `$GWIT_*` values into shell command strings
- **World-readable secrets** in config (`~/.gwitrc`) and registry (`~/.gwit/`)
- **Socket leaks** during port probing

### What gwit does not protect against

- **Malicious hook files** — `.gwitcommand` and `.gwitcleanup` are shell scripts
  committed to your repository. If you clone a repository from an untrusted source
  and run `gwit`, those files will execute. See [Hook Execution](#hook-execution--trust-model).
- **Concurrent write races** — if two `gwit` processes write the registry at exactly
  the same millisecond, one write may win. The write-and-rename strategy makes this
  safe for single-process use; multi-process locking is deferred to a future release.
- **Compromised `git` binary** — all git operations shell out to the `git` CLI on
  `$PATH`. A malicious `git` binary could intercept any command.
- **Privilege escalation** — gwit runs as the invoking user and performs no
  `sudo` or `setuid` operations.

---

## Shell Injection Prevention

gwit calls the git CLI for every repository operation. The central risk is a branch
name or path containing shell metacharacters (`;`, `|`, `&&`, `$(...)`, backticks)
reaching an `execSync` string interpolation.

### The two function families in `lib/shell.ts`

| Function | Underlying API | Shell involved? | Use case |
|---|---|---|---|
| `run(string)` | `execSync` | **Yes** — `/bin/sh -c` | Static commands with no user input |
| `runSafe(string)` | `execSync` | **Yes** | Same, returns `{success}` instead of throwing |
| `runArgs(cmd, args[])` | `spawnSync` | **No** — direct `execve` | Any command that takes user-provided data |
| `runArgsSafe(cmd, args[])` | `spawnSync` | **No** | Same, never throws |
| `runArgsInherited(cmd, args[])` | `spawnSync` | **No** | Output piped to terminal |

### Policy

All functions that accept user-controlled data — branch names, worktree paths, ref
names — use the `runArgs` / `runArgsSafe` family. The string-interpolating `run` and
`runSafe` are used only for static, literal commands with no external input.

**Example — safe branch checkout:**

```typescript
// BAD — branch name reaches the shell
run(`git worktree add ${worktreePath} ${branch}`)

// GOOD — arguments are passed as an array, never seen by a shell
runArgs('git', ['worktree', 'add', worktreePath, branch])
```

### Audit scope

All git call sites in `src/core/git.ts` use the `runArgs` / `runArgsSafe` /
`runArgsInherited` family for any command that includes user-provided data (branch
names, paths, ref names). The string-interpolating `run` / `runSafe` functions are
used only for static commands with no external input (e.g. `git rev-parse --git-dir`).

---

## Environment Variable Safety

gwit injects seven `$GWIT_*` environment variables into each worktree process:

| Variable | Example value |
|---|---|
| `GWIT_BRANCH` | `feature/auth` |
| `GWIT_SLUG` | `feature_auth` |
| `GWIT_PORT` | `3002` |
| `GWIT_DB_SUFFIX` | `_feature_auth` |
| `GWIT_WORKTREE_PATH` | `/home/user/myapp-feature_auth` |
| `GWIT_MAIN_PATH` | `/home/user/myapp` |
| `GWIT_INDEX` | `2` |

### Injection rule

These values are **always passed via the `env` option** to `execSync` / `spawnSync`,
never string-interpolated into a command string:

```typescript
// BAD — GWIT_PORT inside a shell string is a shell variable expansion,
//       but if the value contained metacharacters it could inject commands
execSync(`createdb myapp_${env.GWIT_DB_SUFFIX}`)

// GOOD — the shell expands $GWIT_DB_SUFFIX from the environment,
//         the value never touches the command string at all
execSync('createdb myapp$GWIT_DB_SUFFIX', {
  env: { ...process.env, ...env },
})
```

Your hook scripts in `.gwitcommand` and `.gwitcleanup` receive these variables in
their environment and reference them with normal shell `$VAR` syntax. The values gwit
produces are derived from branch names, which are validated by git itself before the
worktree is created.

---

## Path Traversal Prevention

### `.gwitinclude` file copying

`gwit create` copies gitignored files listed in `.gwitinclude` from your main worktree
into the new one (e.g. `.env`, `node_modules/`, local databases). Each entry goes
through three guards before any filesystem operation:

1. **Absolute path rejection** — entries starting with `/` or a drive letter are
   skipped immediately. `path.join` would otherwise collapse them to an absolute path
   that escapes the repository.

2. **Containment check** — the resolved path is compared to the repository root using
   `path.relative()`. If the relative path begins with `..` or is itself absolute,
   the entry is skipped. This catches inputs like `../../etc/passwd` regardless of
   how many traversal components they use.

3. **Symlink safety** — `fs.cpSync` is called with `dereference: false` (the default
   in Node 20+, now also explicit). Symlinks inside a copied directory are reproduced
   as symlinks in the destination, not followed to their targets.

```
Entry: "../../etc/passwd"
→ path.relative('/home/user/myapp', '/etc/passwd') → '../../etc/passwd'
→ starts with '..' → SKIP (path escapes repo)

Entry: "/etc/passwd"
→ path.isAbsolute('/etc/passwd') === true → SKIP (absolute path not allowed)

Entry: ".env"
→ relative('.env') → '.env'  (stays inside repo) → PROCEED
```

### Worktree placement

Worktree paths are constructed from the main repo path and a sanitised slug derived
from the branch name. `toSlug()` reduces branch names to `[a-z0-9_]` characters
before any path is constructed, so directory traversal via a crafted branch name is
not possible.

---

## File Permissions

gwit stores two user-specific files on disk:

| File | Content | Mode |
|---|---|---|
| `~/.gwitrc` | editor command, base port, worktree location | `0o600` (owner read/write) |
| `~/.gwit/worktrees.json` | all active worktree paths, ports, slugs | `0o600` |
| `~/.gwit/` directory | contains the registry | `0o700` (owner only) |

Permissions are applied with `fs.chmodSync` after every write. On Windows, where
Unix-style mode bits are not supported, the `chmod` call is wrapped in a `try/catch`
and silently skipped — the NTFS ACL model is relied on instead.

The registry temp file (`worktrees.json.tmp.<pid>.<random>`) is also `chmod`-ed to
`0o600` **before** it is renamed over the target, ensuring the target is never
transiently world-readable even on systems with a permissive umask.

---

## Hook Execution — Trust Model

### What hooks are

gwit supports two hook files committed to your repository root:

| File | When it runs | Failure behaviour |
|---|---|---|
| `.gwitcommand` | After `gwit create` — inside the new worktree | Stops on first error |
| `.gwitcleanup` | During `gwit remove` — inside the worktree being removed | Warns and continues |

Typical uses: `npm install`, `createdb myapp$GWIT_DB_SUFFIX`, `cp .env.example .env`.

### The trust requirement

Because hook commands are arbitrary shell strings executed with `execSync`, **gwit
treats the repository as fully trusted**. Before running `gwit create` in a repository
you did not author or review, inspect these files:

```bash
cat .gwitcommand
cat .gwitcleanup
```

This is the same trust model as `npm install` (which runs `postinstall` scripts) and
`make` (which runs arbitrary Makefile targets).

### Disabling hooks

If you want to create a worktree without running hook commands:

```bash
gwit create <branch> --no-commands   # skip .gwitcommand
```

Cleanup hooks can be reviewed before `gwit remove` by reading `.gwitcleanup` in the
main worktree.

### What hooks cannot do

- Hooks cannot inject data into gwit's own process or registry — they run in a child
  process after the worktree is fully created.
- The `$GWIT_*` environment variables are read-only from the hook's perspective;
  any changes the hook makes to them are not visible to gwit.
- Hook failures during setup leave the worktree directory intact so you can debug
  without losing work.

---

## Registry Integrity

The registry (`~/.gwit/worktrees.json`) tracks all active worktrees across all
repositories. It is a JSON file managed exclusively by gwit.

### Atomic writes

The registry is updated using a **write-and-rename** strategy to prevent corruption
from interrupted writes:

1. A temp file is written: `worktrees.json.tmp.<pid>.<random>` — the PID and random
   suffix prevent collisions between concurrent gwit processes.
2. `fs.renameSync` atomically replaces the target. On POSIX this is an atomic
   `rename(2)` syscall. On Windows it uses `MoveFileEx` with
   `MOVEFILE_REPLACE_EXISTING`, which is atomic for same-volume moves.
3. If rename fails (e.g. cross-device move), it retries up to three times with a
   100 ms delay before giving up and cleaning up the temp file.

### Corrupt registry recovery

If the registry file contains invalid JSON (e.g. truncated by a crash):

1. The file is copied to `worktrees.json.bak` before being discarded.
2. gwit starts with an empty registry and logs a warning.
3. Existing worktree directories are not affected — they can be re-registered with
   `gwit create` or removed with `gwit remove`.

To restore manually: `cp ~/.gwit/worktrees.json.bak ~/.gwit/worktrees.json`

---

## Port Allocation

`gwit create` assigns each worktree a unique TCP port for its development server.

### Allocation strategy

1. All ports currently assigned to any registered gwit worktree across all repos are
   collected from the registry.
2. Starting from `basePort` (default: 3001), each candidate port is checked:
   - Skipped if already in the assigned set.
   - Probed with a TCP `net.createServer().listen()` to confirm it is not already
     in use by another process.
3. The scan covers at most 100 ports. If none are free, gwit exits with an error.

### Probe safety

- The probe server binds to `127.0.0.1` only, never `0.0.0.0`, to avoid briefly
  exposing the port on the network.
- The server is closed immediately after a successful bind — it holds the port for
  less than one event loop tick.
- On `EACCES` or other socket errors, the server is explicitly closed before the
  promise resolves to prevent file descriptor leaks.

---

## Input Validation

### Branch names

Branch names are validated indirectly by git itself: `git worktree add` rejects any
name that git considers invalid. gwit does not impose additional restrictions beyond
requiring the branch resolves to a local or remote ref.

### Config values (`gwit config set`)

| Key | Validation |
|---|---|
| `editor` | Non-empty string; shell metacharacters (`;`, `&`, `\|`, `` ` ``, `$`, `(`, `)`, etc.) are rejected to guard against injection if the value is later used in a string-interpolated context. |
| `location` | Enum — must be exactly `sibling` or `subdirectory`. |
| `basePort` | Integer in range 1–65535 (`parseInt` + range check). |

### `.gwitinclude` entries

Entries are trimmed and blank/comment lines are stripped. Absolute paths and
path-traversal sequences are rejected as described in
[Path Traversal Prevention](#path-traversal-prevention).

Glob patterns (`*`, `?`, `[...]`, `**`) are expanded via `minimatch` against the
set of gitignored files returned by `git ls-files --others --ignored`. The expansion
is always scoped to the repository — glob results that resolve outside the repo root
are filtered out by the same containment check applied to literal entries. Patterns
cannot match tracked files because the input set only contains ignored files.

---

## Merge Command Safety

`gwit merge` combines git merge operations with reverse `.gwitinclude` file syncing.
Both operations have security considerations:

### Reverse `.gwitinclude` copy

`gwit merge` can copy gitignored files **from the worktree back to the main worktree**
(the reverse of what `gwit create` does). This reverse copy applies the same three
guards as the forward copy:

1. **Absolute path rejection** — entries starting with `/` or a drive letter are skipped.
2. **Containment check** — resolved paths must stay within the worktree root.
3. **Symlink safety** — `fs.cpSync` with `dereference: false`.

The `--no-sync-back` flag disables reverse copying entirely if not needed.

### Git merge operations

All git merge commands (`merge`, `rebase`, `checkout`) use the `runArgs` /
`runArgsInherited` family — branch names and paths are passed as array arguments,
never string-interpolated. Merge conflict errors are caught and surfaced as
`GwitError` with a suggestion to resolve manually.

### Cleanup after merge

When `--cleanup` is used, `gwit merge` removes the worktree after a successful
merge. This follows the same cleanup path as `gwit remove`: cleanup hooks run first,
then `git worktree remove`, then the registry is updated.

---

## Dependency Surface

gwit's runtime dependency tree is intentionally minimal:

| Package | Version | Purpose |
|---|---|---|
| `commander` | ^12.1.0 | CLI argument parsing |
| `inquirer` | ^8.2.6 | Interactive first-run setup |
| `minimatch` | ^10.0.1 | Glob pattern matching for `.gwitinclude` |

No network requests are made at runtime. No eval or dynamic code loading occurs.
All git operations shell out to the `git` binary already present on the system.

`minimatch` is used only to match file paths against glob patterns within the
repository. Patterns are user-authored (committed in `.gwitinclude`) and the match
input is the output of `git ls-files`, so both sides are controlled by the
repository owner.

Dependencies are pinned to minor-version ranges (`^`) to receive patch security
fixes automatically via `npm update`, while avoiding unintentional major-version
breaking changes.

---

## Reporting a Vulnerability

If you discover a security issue in gwit, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Open a [GitHub Security Advisory](https://github.com/shriv/gwit/security/advisories/new)
   on the repository, or email the maintainer directly if you cannot find a contact.
3. Include: affected version, steps to reproduce, impact assessment, and a suggested
   fix if you have one.

We aim to acknowledge reports within 48 hours and publish a fix within 14 days for
confirmed vulnerabilities.

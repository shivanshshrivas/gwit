# gwit

> One command. Fully isolated git worktrees.

gwit wraps `git worktree` to turn a fresh checkout into a fully working environment — gitignored files copied, unique port assigned, per-worktree env vars injected, and setup scripts run. All in one shot.

Built for parallel development with multiple branches and AI coding agents — no database collisions, no port conflicts, no manual setup.

---

## Install

```sh
npm install -g gwit
```

Requires **Node.js ≥ 20** and **git ≥ 2.5**.

---

## Quick start

```sh
# Set up gwit for this repo (run once, commit the output)
gwit init

# Create an isolated worktree
gwit feature/auth             # existing branch
gwit -b fix/login-page        # create a new branch from HEAD

# Day-to-day
gwit list                     # show all active worktrees
gwit sync feature/auth        # re-copy files after .env changes
gwit open feature/auth        # re-open editor for an existing worktree
gwit remove feature/auth      # run cleanup hooks and remove worktree
```

---

## How it works

gwit adds three layers on top of `git worktree add`:

1. **Files** — copies gitignored files listed in `.gwitinclude` (`.env`, `node_modules/`, certs) so the new worktree starts complete instead of broken.

2. **Isolation** — assigns a unique port and injects `$GWIT_*` env vars into your setup scripts, so each worktree can create its own database, Docker project, Redis namespace, and anything else your stack needs.

3. **Automation** — runs `.gwitcommand` after creation and `.gwitcleanup` before removal, giving your team a shared, repeatable isolation setup committed to the repo.

---

## Commands

### `gwit <branch>`

Create an isolated worktree for `branch` (local or remote).

```sh
gwit feature/auth                    # check out existing branch
gwit -b fix/login-page               # create a new branch from HEAD
gwit feature/auth --editor cursor    # override editor for this run
gwit feature/auth --no-editor        # skip opening editor
gwit feature/auth --no-commands      # skip .gwitcommand
```

**What it does, in order:**

1. Resolves the branch (local → remote tracking → error)
2. Runs `git worktree add`
3. Copies files listed in `.gwitinclude` from the main worktree
4. Allocates a unique port (scans from `basePort`, up to 100 ports)
5. Injects `$GWIT_*` variables and runs `.gwitcommand` inside the new worktree
6. Writes the registry entry to `~/.gwit/worktrees.json`
7. Opens the editor

---

### `gwit init`

Interactive wizard that scaffolds the three per-repo hook files. Run once per repo and commit the output so every teammate gets the same isolation setup automatically.

```sh
gwit init           # creates .gwitinclude, .gwitcommand, .gwitcleanup
gwit init --force   # overwrite existing files
```

The wizard:

- Shows a checklist of gitignored files/directories to copy (pre-selects `.env*`)
- Asks about your package manager, database, Redis, Docker Compose
- Asks for any extra setup and teardown commands
- Generates ready-to-edit hook files

---

### `gwit list`

Show all active worktrees for this repo.

```
Branch              Path                              Port   Index  Created
feature/auth        ../myapp-feature_auth             3001   1      2026-01-15
fix/login-page      ../myapp-fix_login_page           3002   2      2026-01-16
```

---

### `gwit remove <branch>`

Run cleanup hooks, remove the worktree, and free the port from the registry.

```sh
gwit remove feature/auth
gwit remove feature/auth --force   # skip uncommitted-changes check
```

---

### `gwit sync [branch]`

Re-copy `.gwitinclude` files into an existing worktree. Use this when your `.env` gains a new key, certs rotate, or `node_modules` is updated.

```sh
gwit sync feature/auth   # sync a specific branch
gwit sync                # auto-detect from current directory (when inside a worktree)
```

---

### `gwit open <branch>`

Re-open the editor for an existing worktree. Useful when the editor window was closed.

```sh
gwit open feature/auth
gwit open feature/auth --editor cursor
```

---

### `gwit config`

Show or update global configuration stored in `~/.gwitrc`.

```sh
gwit config                        # show all settings
gwit config get editor             # get one setting
gwit config set editor cursor      # change editor
gwit config set location sibling   # or: subdirectory
gwit config set basePort 4000      # starting port for auto-assignment
```

| Key        | Values                     | Default   |
| ---------- | -------------------------- | --------- |
| `editor`   | any editor command         | `code`    |
| `location` | `sibling` · `subdirectory` | `sibling` |
| `basePort` | 1–65535                    | `3001`    |

**`location`** controls where worktrees are placed:

- `sibling` — next to the repo: `../myapp-feature_auth`
- `subdirectory` — inside the repo: `myapp/.worktrees/feature_auth`

---

## File formats

### `.gwitinclude`

List of gitignored files and directories to copy into every new worktree. One entry per line, comments with `#` ignored.

```
# .gwitinclude — files to copy into each new worktree
.env
.env.local
certs/
```

Only gitignored files are eligible to copy. Tracked files are silently skipped — gwit is an allowlist for files that must be present but cannot be committed.

---

### `.gwitcommand`

Shell commands run inside the worktree after creation. One command per line.

```sh
# .gwitcommand — setup commands
# $GWIT_* variables are available here
npm install
createdb myapp$GWIT_DB_SUFFIX
npm run db:migrate
echo "PORT=$GWIT_PORT"                                         >> .env
echo "DATABASE_URL=postgres://localhost/myapp$GWIT_DB_SUFFIX"  >> .env
echo "REDIS_URL=redis://localhost:6379/$GWIT_INDEX"            >> .env
```

Commands run sequentially. If any command fails, the rest are skipped and gwit exits with an error.

---

### `.gwitcleanup`

Shell commands run inside the worktree before removal. Mirrors `.gwitcommand`.

```sh
# .gwitcleanup — teardown commands
dropdb --if-exists myapp$GWIT_DB_SUFFIX
```

Commands run sequentially. Errors are printed as warnings and execution continues — cleanup is best-effort.

---

## Environment variables

All `$GWIT_*` variables are available inside `.gwitcommand` and `.gwitcleanup`:

| Variable              | Example value                   | Description                           |
| --------------------- | ------------------------------- | ------------------------------------- |
| `$GWIT_BRANCH`        | `feature/auth`                  | Raw branch name                       |
| `$GWIT_SLUG`          | `feature_auth`                  | Filesystem/DB-safe slug               |
| `$GWIT_PORT`          | `3001`                          | Auto-assigned unique port             |
| `$GWIT_DB_SUFFIX`     | `_feature_auth`                 | Underscore-prefixed slug for DB names |
| `$GWIT_WORKTREE_PATH` | `/home/user/myapp-feature_auth` | Absolute path to this worktree        |
| `$GWIT_MAIN_PATH`     | `/home/user/myapp`              | Absolute path to the main repo        |
| `$GWIT_INDEX`         | `1`                             | Stable, never-reused index per repo   |

`$GWIT_INDEX` is monotonically increasing and never reused after removal — safe to use as a Redis DB number, a Docker Compose project suffix, or any resource that must survive across separate worktree sessions.

---

## Example: full-stack isolation

A complete setup for a Node.js app with Postgres and Redis:

**`.gwitinclude`**
```
.env
```

**`.gwitcommand`**
```sh
npm install
createdb myapp$GWIT_DB_SUFFIX
npm run db:migrate
echo "PORT=$GWIT_PORT"                                         >> .env
echo "DATABASE_URL=postgres://localhost/myapp$GWIT_DB_SUFFIX"  >> .env
echo "REDIS_URL=redis://localhost:6379/$GWIT_INDEX"            >> .env
```

**`.gwitcleanup`**
```sh
dropdb --if-exists myapp$GWIT_DB_SUFFIX
```

With this setup, `gwit feature/auth` spins up a worktree with its own database (`myapp_feature_auth`), its own Redis DB (`redis://…/1`), and its own port (`3001`) — no collisions, no manual steps.

---

## Registry and config files

| File                     | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `~/.gwitrc`              | Global config (editor, location, basePort)        |
| `~/.gwit/worktrees.json` | Active worktrees registry (paths, ports, indices) |

Both files are user-owned and never shared. The registry is written atomically using a write-and-rename strategy to handle concurrent `gwit` runs safely.

---

## License

MIT

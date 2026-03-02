// Node stdlib
import * as fs from 'fs'
import * as path from 'path'

// External packages
import { Command } from 'commander'

// Internal
import { GwitError } from './types'
import { ui, formatError } from './lib/ui'
import { createCommand } from './commands/create'
import { listCommand } from './commands/list'
import { removeCommand } from './commands/remove'
import { configShowCommand, configGetCommand, configSetCommand } from './commands/config'
import { initCommand } from './commands/init'
import { openCommand } from './commands/open'
import { syncCommand } from './commands/sync'
import { mergeCommand } from './commands/merge'
import { statusCommand } from './commands/status'
import { sweepCommand } from './commands/sweep'
import { renameCommand } from './commands/rename'

// ─── Commands ─────────────────────────────────────────────────────────────────

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string
}

const program = new Command()

program
  .name('gwit')
  .description('Fully isolated git worktrees for parallel development')
  .version(pkg.version)

// Default command: gwit [branch]
program
  .argument('[branch]', 'Branch name (local or remote)')
  .option('-b', 'Create a new branch from HEAD')
  .option('--editor <name>', 'Override editor for this invocation')
  .option('--no-editor', 'Skip opening editor')
  .option('--no-commands', 'Skip .gwitcommand execution')
  .action(async (branch: string | undefined, options) => {
    if (!branch) {
      program.help()
      return
    }
    await createCommand(branch, options)
  })

program
  .command('init')
  .description('Set up gwit for this repo — scaffolds .gwitinclude, .gwitcommand, .gwitcleanup')
  .option('--force', 'Overwrite existing hook files')
  .action(async (options) => {
    await initCommand(options)
  })

program
  .command('list')
  .description('List all active gwit worktrees')
  .action(() => {
    listCommand()
  })

program
  .command('remove <branch>')
  .description('Remove a worktree and run cleanup hooks')
  .option('--force', 'Skip confirmation for uncommitted changes')
  .action(async (branch: string, options) => {
    await removeCommand(branch, options)
  })

const configCmd = program.command('config').description('Show or update global configuration')

configCmd
  .command('set <key> <value>')
  .description('Set a configuration value  (keys: editor, location, basePort)')
  .action((key: string, value: string) => {
    configSetCommand(key, value)
  })

configCmd
  .command('get <key>')
  .description('Get a configuration value')
  .action((key: string) => {
    configGetCommand(key)
  })

configCmd.action(() => {
  configShowCommand()
})

program
  .command('open <branch>')
  .description('Re-open the editor for an existing gwit worktree')
  .option('--editor <name>', 'Override editor for this invocation')
  .action((branch: string, options) => {
    openCommand(branch, options)
  })

program
  .command('sync [branch]')
  .description('Re-copy .gwitinclude files into an existing worktree')
  .action((branch: string | undefined) => {
    syncCommand(branch)
  })

program
  .command('merge <branch>')
  .description('Merge a worktree branch back into the target branch')
  .option('--into <target>', 'Target branch (default: repo default branch)')
  .option('--squash', 'Squash all commits into one before merging')
  .option('--rebase', 'Rebase feature onto target, then fast-forward')
  .option('--no-ff', 'Force a merge commit even when fast-forward is possible')
  .option('--cleanup', 'Remove worktree after successful merge')
  .option('--no-sync-back', 'Skip reverse-copying .gwitinclude files')
  .action(async (branch: string, options) => {
    await mergeCommand(branch, options)
  })

program
  .command('status')
  .description('Show status of all active gwit worktrees')
  .option('--json', 'Output as JSON')
  .action((options) => {
    statusCommand(options)
  })

program
  .command('sweep')
  .description('Remove worktrees whose branches are merged')
  .option('--dry-run', 'Show what would be removed without removing')
  .option('--force', 'Skip confirmation prompt')
  .action(async (options) => {
    await sweepCommand(options)
  })

program
  .command('rename <old-branch> <new-branch>')
  .description('Rename a worktree branch')
  .action(async (oldBranch: string, newBranch: string) => {
    await renameCommand(oldBranch, newBranch)
  })

// ─── Entry point ──────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof GwitError) {
    ui.error(err.message)
    if (err.suggestion) ui.dim(`  Hint: ${err.suggestion}`)
    process.exit(err.exitCode)
  }
  ui.error(formatError(err))
  process.exit(1)
})

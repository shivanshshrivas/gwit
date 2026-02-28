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

// ─── Commands ─────────────────────────────────────────────────────────────────

const program = new Command()

program
  .name('gwit')
  .description('Fully isolated git worktrees for parallel development')
  .version('0.1.0')

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

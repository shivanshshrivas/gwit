import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Use forked child processes so integration tests can call process.chdir().
    // Worker threads (the default pool) do not support process.chdir().
    pool: 'forks',
  },
})

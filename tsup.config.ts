import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  outDir: 'dist',
  clean: true,
  shims: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
})

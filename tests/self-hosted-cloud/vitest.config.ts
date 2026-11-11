import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { createWorkspaceSourceResolver } from '../../config/scripts/workspace/source-exports/workspace-source-exports.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')

// Separate from the unit suite: these tests boot real cloud servers from cloud/,
// so they only run where the cloud workspace is installed (pnpm test:self-hosted-cloud).
export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: [
      ...createWorkspaceSourceResolver().aliases,
      { find: 'fs/promises', replacement: 'node:fs/promises' },
      { find: 'fs', replacement: 'node:fs' },
      { find: 'os', replacement: 'node:os' }
    ]
  },
  test: {
    environment: 'node',
    include: ['tests/self-hosted-cloud/**/*.e2e.test.ts'],
    server: { deps: { inline: ['zod'] } },
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 90_000
  }
})

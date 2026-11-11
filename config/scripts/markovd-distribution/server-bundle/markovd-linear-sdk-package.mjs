import { build } from 'esbuild'
import { join } from 'node:path'
import { MARKOVD_LINEAR_SDK_ENTRY } from '../../../../src/shared/markovd-artifacts.ts'
import { MARKOVD_SERVER_BUILD_TARGET } from './markovd-entry-build.mjs'

// Bundle @linear/sdk into one CJS file for lazy require: copying would expose chunk names that change each release.
export async function stageMarkovdLinearSdk(root, outputDir) {
  await build({
    stdin: {
      contents: "module.exports = require('@linear/sdk')",
      resolveDir: root,
      sourcefile: 'markovd-linear-sdk-entry.js'
    },
    bundle: true,
    platform: 'node',
    target: MARKOVD_SERVER_BUILD_TARGET,
    format: 'cjs',
    outfile: join(outputDir, MARKOVD_LINEAR_SDK_ENTRY),
    minify: true,
    sourcemap: false,
    logLevel: 'error'
  })
}

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  classifyNodeServerChanges,
  collectNodeServerInputs
} from '../../node-server/qualification/node-server-change-scope.mjs'
import {
  MARKOVD_CHILD_ENTRY_POINTS,
  MARKOVD_ENTRY_POINT,
  MARKOVD_LAUNCHER_ENTRY_POINT
} from '../server-bundle/markovd-entry-build.mjs'

const ENTRY_POINTS = [
  MARKOVD_ENTRY_POINT,
  MARKOVD_LAUNCHER_ENTRY_POINT,
  ...Object.values(MARKOVD_CHILD_ENTRY_POINTS),
  'src/cli/index.ts',
  'config/scripts/markovd-distribution/prebuilds/build-markovd-node.mjs',
  'config/scripts/markovd-distribution/prebuilds/build-markovd-prebuilds.mjs',
  'config/scripts/markovd-distribution/server-bundle/build-markovd.mjs',
  'config/scripts/native-build/node-addons/ensure-native-runtime.mjs',
  'config/scripts/native-build/node-addons/rebuild-native-deps.mjs',
  'config/scripts/cli-build/verify-cli-bin.mjs',
  'config/scripts/development/setup/install-dev-cli.mjs',
  'config/scripts/development/launch/markov-dev.mjs',
  'config/scripts/runtime-verification/daemon-lifecycle/runtime-serve-terminal-smoke.mjs',
  'config/scripts/markovd-distribution/qualification/markovd-terminal-smoke-change-scope.mjs'
]

export function collectMarkovdTerminalSmokeInputs() {
  return collectNodeServerInputs({ entryPoints: ENTRY_POINTS })
}

export async function classifyMarkovdTerminalSmokeChanges(
  changedFiles,
  collect = collectMarkovdTerminalSmokeInputs
) {
  const forced = changedFiles.find(
    (file) =>
      ENTRY_POINTS.includes(file) ||
      file === '.github/workflows/pr.yml' ||
      file.startsWith('config/scripts/markovd-terminal-smoke-') ||
      file.startsWith(
        'config/scripts/markovd-distribution/qualification/markovd-terminal-smoke-'
      ) ||
      file.startsWith('config/scripts/runtime-serve-terminal-smoke') ||
      file.startsWith(
        'config/scripts/runtime-verification/daemon-lifecycle/runtime-serve-terminal-smoke'
      ) ||
      // createRequire-loaded native probes are invisible to esbuild's import graph.
      (file.startsWith('config/scripts/') && file.endsWith('.cjs')) ||
      // CLI emit and runtime resources include files opened by path, outside the import graph.
      file.startsWith('src/cli/') ||
      file.startsWith('src/shared/') ||
      file.startsWith('resources/')
  )
  if (forced) {
    return { shouldRun: true, reason: `Smoke input changed: ${forced}` }
  }
  // Retain the headless-server gate's native, worker, toolchain and failed-analysis safeguards.
  return classifyNodeServerChanges(changedFiles, collect)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changedFiles = readFileSync(process.argv[2], 'utf8').split('\0').filter(Boolean)
  const result = await classifyMarkovdTerminalSmokeChanges(changedFiles)
  console.error(result.reason)
  process.stdout.write(`${result.shouldRun}\n`)
}

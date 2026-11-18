// Markov's own Codex: the official release package, pinned by checksum, for a computer that has no
// whole Codex of its own. The package keeps `codex` beside the helper it runs every command through.

import { join } from 'node:path'
import type { ManagedRuntime, ManagedRuntimePin } from '../node-runtime/managed-runtime-release'
import { resolveInstalledRuntimeRelease } from '../node-runtime/managed-runtime-release'
import { readAgentCliVersion } from '../agent-launch/preflight/agent-cli-version-probe'
import { parseCodexCliVersion } from '../../shared/codex-cli-installation'
import { CODEX_COMMAND_HELPER } from './whole-codex-command'

// Checksums are GitHub's published digests for this release; move every platform together.
const VERSION = '0.167.1'
const RELEASES = `https://github.com/openai/codex/releases/download/rust-v${VERSION}`

type Pinned = {
  target: string
  archive: string
  archiveBytes: number
  codex: string
  codexBytes: number
  helper: string
  helperBytes: number
}
const PINNED: Record<string, Pinned> = {
  'darwin-arm64': {
    target: 'aarch64-apple-darwin',
    archive: '5bcbc5866cbca19f9299f7884e9b39b9ccb5469969c170b1f2d2cd6fc4b1ee72',
    archiveBytes: 166615534,
    codex: 'ebabe5f0d79145a9e61274ce9ecf7c02c9021b7b04bfa59b7e61ad4461c32b0b',
    codexBytes: 271011440,
    helper: 'ab573dc5cbb3d378e82bf4d568ad606b071ff2a284808fc206fddbe1ae677405',
    helperBytes: 70309600
  },
  'darwin-x64': {
    target: 'x86_64-apple-darwin',
    archive: 'ade991ce7fef5b4f4af884c154b9455d493cd0caf13789fc3ff9f842897b55d3',
    archiveBytes: 180452942,
    codex: '9c87b197bd7475ff99e5b8952fa30009365f3acc0bbbfd5f5a8daa77e0cf94b0',
    codexBytes: 289668464,
    helper: '503d793a726bbd94b7b7849e8b6780dfe8833db89eba94dac22c3aa1795e5b72',
    helperBytes: 74402432
  },
  'linux-x64': {
    target: 'x86_64-unknown-linux-musl',
    archive: 'a945df3df83e849dd7b74787e27f8a459c1946b0e3afe3dc8eef8a8d1845fd4f',
    archiveBytes: 200235863,
    codex: 'dd5bfdf19d794dcc6fb482d2d5a2d9fb31d11f6caa44b303bb72890d461e8a02',
    codexBytes: 320186856,
    helper: 'cd8de3a734f67ecab31fd6064e3aa8a68dac7785f5135bbb1709981b09a8b6a8',
    helperBytes: 79217936
  },
  'linux-arm64': {
    target: 'aarch64-unknown-linux-musl',
    archive: 'ef3e1443a7795d596f1601a533d7225a1030488d60c965af1f0610ab95889031',
    archiveBytes: 187977851,
    codex: 'c912f1179d0d8b8e18ee8c4dd856d92bd54a98f1b430b243da819f2a4e63841f',
    codexBytes: 279384472,
    helper: '8c3cc2490a29af4baa9dd8bc894812efaa735a033f55a840ee57b3decce73198',
    helperBytes: 71952736
  },
  'win32-x64': {
    target: 'x86_64-pc-windows-msvc',
    archive: 'a327ba32f46e39079486ffa29e160e9da9ab2b2f73744d6101509729c26c1c1b',
    archiveBytes: 201602950,
    codex: 'c12aca02de615a9fcb76f955bf005a33f4b10b577f8a1730161953f57a1155b3',
    codexBytes: 369078064,
    helper: '04d0d08f2001b8a2cb6f08a3872fc51d15373303817972f35e21177dbed44d08',
    helperBytes: 80327984
  },
  'win32-arm64': {
    target: 'aarch64-pc-windows-msvc',
    archive: '5c6fb7ceb1145e4cc505375404f915d97d12e4d5720dec43c348545204b1e472',
    archiveBytes: 186785886,
    codex: '91a28945eff7e22562f0541989b24a5033525271624ac90bbdd8c46752c9d3cf',
    codexBytes: 311500592,
    helper: 'c79696cea19ac84c93bf63eb32481bcda84d91fdf8bdfd18db553d7ada2ec0c4',
    helperBytes: 74705200
  }
}

function executable(name: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? `${name}.exe` : name
}

function pin(): ManagedRuntimePin | null {
  const pinned = PINNED[`${process.platform}-${process.arch}`]
  return pinned
    ? {
        version: VERSION,
        url: `${RELEASES}/codex-package-${pinned.target}.tar.gz`,
        archiveSha256: pinned.archive,
        archiveBytes: pinned.archiveBytes,
        // Why whole: the package also carries the sandbox and search programs Codex looks for beside it.
        extractWholeArchive: true,
        members: [
          {
            path: `bin/${executable('codex', process.platform)}`,
            sha256: pinned.codex,
            bytes: pinned.codexBytes
          },
          {
            path: `bin/${executable(CODEX_COMMAND_HELPER, process.platform)}`,
            sha256: pinned.helper,
            bytes: pinned.helperBytes
          }
        ]
      }
    : null
}

export const CODEX_MANAGED_RUNTIME: ManagedRuntime = {
  label: 'Codex',
  root: (dataDirectory) => join(dataDirectory, 'agent-runtimes', 'codex'),
  pin,
  validate: async (folder, pinned) => {
    const program = join(folder, 'bin', executable('codex', process.platform))
    const { version } = await readAgentCliVersion({ program, cwd: folder }, parseCodexCliVersion)
    if (version !== pinned.version) {
      throw new Error(`Codex at ${program} reported ${version ?? 'no version'}`)
    }
  }
}

/** The `codex` of Markov's installed release, whole by its receipt; null when none is installed. */
export function managedCodexCommand(dataDirectory: string): string | null {
  const { release } = resolveInstalledRuntimeRelease(
    CODEX_MANAGED_RUNTIME.root(dataDirectory),
    CODEX_MANAGED_RUNTIME.pin()
  )
  return release ? join(release.folder, 'bin', executable('codex', process.platform)) : null
}

/** The pinned release as installed: the checksum that identifies its `codex`, and its helper file.
 *  Null unless the release on disk is the pinned one. */
export function installedPinnedCodexRelease(
  dataDirectory: string
): { codexSha256: string; codexBytes: number; helper: string } | null {
  const pinned = CODEX_MANAGED_RUNTIME.pin()
  const { release } = resolveInstalledRuntimeRelease(
    CODEX_MANAGED_RUNTIME.root(dataDirectory),
    pinned
  )
  const [codex, helper] = pinned?.members ?? []
  return release?.current && codex && helper
    ? {
        codexSha256: codex.sha256,
        codexBytes: codex.bytes,
        helper: join(release.folder, ...helper.path.split('/'))
      }
    : null
}

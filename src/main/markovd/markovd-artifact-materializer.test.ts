import { createHash } from 'node:crypto'
import type * as NodeFs from 'node:fs'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { pinnedNodeRuntimeAsset, type NodeRuntimeTarget } from '../../shared/node-runtime-pin'
import {
  MARKOVD_MOBILE_WEB_MANIFEST,
  MARKOVD_NODE_RUNTIME_MARKER_FILENAME,
  MARKOVD_SERVER_TARGET_FILENAME,
  MARKOVD_TEMPLATE_MANIFEST_FILENAME,
  MARKOVD_TEMPLATE_TARGETS_DIR,
  markovdRipgrepArtifact,
  markovdTemplateCommonFilenames,
  markovdTemplateTargetFilenames
} from '../../shared/markovd-artifacts'
import {
  getAppEnvironment,
  hasAppEnvironment,
  setAppEnvironment,
  type AppEnvironment
} from '../../shared/app-environment'
import {
  assembleMarkovdArtifact,
  getMarkovdTemplateCandidates,
  materializeMarkovdArtifact,
  resetMarkovdArtifactMaterializationsForTests
} from './markovd-artifact-materializer'

const TARGET = 'linux-x64-glibc' as const
const PAGE_ASSETS = ['out/mobile-web/index.html']
const fileReads = vi.hoisted(() => ({ count: 0 }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>()
  return {
    ...actual,
    createReadStream: (...args: Parameters<typeof actual.createReadStream>) => {
      fileReads.count += 1
      return actual.createReadStream(...args)
    }
  }
})
const temporaryDirs: string[] = []

afterEach(() => {
  resetMarkovdArtifactMaterializationsForTests()
  vi.clearAllMocks()
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function write(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
}

const ManifestSchema = z
  .object({
    targets: z.record(
      z.string(),
      z.object({ files: z.record(z.string(), z.string()) }).passthrough()
    ),
    commonSha256: z.record(z.string(), z.string())
  })
  .passthrough()

function targetContents(target: NodeRuntimeTarget, filename: string): string {
  if (filename === MARKOVD_SERVER_TARGET_FILENAME) {
    return `${target}\n`
  }
  if (filename === MARKOVD_NODE_RUNTIME_MARKER_FILENAME) {
    return `${pinnedNodeRuntimeAsset(target).executableSha256}\n`
  }
  return `${target}:${filename}`
}

function commonContents(filename: string): string {
  if (filename === MARKOVD_MOBILE_WEB_MANIFEST) {
    return JSON.stringify({ assets: [{ path: 'index.html' }] })
  }
  return filename === 'markovd.js' ? 'markovd-entry' : filename
}

function createTemplate(target: NodeRuntimeTarget = TARGET): {
  templateDir: string
  cacheRoot: string
} {
  const root = mkdtempSync(join(tmpdir(), 'markovd-artifact-template-'))
  temporaryDirs.push(root)
  const templateDir = join(root, 'template')
  const cacheRoot = join(root, 'cache')
  const commonSha256: Record<string, string> = {}
  for (const filename of markovdTemplateCommonFilenames(PAGE_ASSETS)) {
    write(join(templateDir, filename), commonContents(filename))
    commonSha256[filename] = sha256(join(templateDir, filename))
  }
  const targetDir = join(templateDir, MARKOVD_TEMPLATE_TARGETS_DIR, target)
  const files: Record<string, string> = {}
  for (const filename of markovdTemplateTargetFilenames(target)) {
    write(join(targetDir, filename), targetContents(target, filename))
    files[filename] = sha256(join(targetDir, filename))
  }
  write(join(targetDir, 'agent-browser-linux-x64'), 'browser')
  write(
    join(templateDir, MARKOVD_TEMPLATE_MANIFEST_FILENAME),
    JSON.stringify({
      schemaVersion: 3,
      commonSha256,
      targets: {
        [target]: {
          files,
          browserName: 'agent-browser-linux-x64',
          browserSha256: sha256(join(targetDir, 'agent-browser-linux-x64'))
        }
      }
    })
  )
  return { templateDir, cacheRoot }
}

function rewriteManifest(
  templateDir: string,
  change: (manifest: z.infer<typeof ManifestSchema>) => void
): void {
  const manifestPath = join(templateDir, MARKOVD_TEMPLATE_MANIFEST_FILENAME)
  const manifest = ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')))
  change(manifest)
  write(manifestPath, JSON.stringify(manifest))
}

describe('assembleMarkovdArtifact', () => {
  it.skipIf(process.platform === 'win32')(
    'restores executable modes from a template copied without them',
    async () => {
      const target = 'darwin-arm64' as const
      const fixture = createTemplate(target)
      const executables = [
        markovdRipgrepArtifact(target),
        'node_modules/node-pty/build/Release/spawn-helper'
      ]
      for (const filename of executables) {
        chmodSync(join(fixture.templateDir, MARKOVD_TEMPLATE_TARGETS_DIR, target, filename), 0o644)
      }
      const artifactDir = await assembleMarkovdArtifact({ ...fixture, target })
      for (const filename of executables) {
        expect(statSync(join(artifactDir, filename)).mode & 0o777).toBe(0o755)
      }
    }
  )

  it('rejects a packaged native file that does not match its manifest', async () => {
    const fixture = createTemplate()
    write(
      join(
        fixture.templateDir,
        MARKOVD_TEMPLATE_TARGETS_DIR,
        TARGET,
        'node_modules/node-pty/build/Release/pty.node'
      ),
      'corrupted'
    )

    await expect(assembleMarkovdArtifact({ ...fixture, target: TARGET })).rejects.toThrow(
      'node_modules/node-pty/build/Release/pty.node checksum mismatch'
    )
  })

  it('refuses a template page asset name that escapes the slot', async () => {
    const fixture = createTemplate()
    rewriteManifest(fixture.templateDir, (manifest) => {
      manifest.commonSha256['out/mobile-web/../../escape.js'] = sha256(
        join(fixture.templateDir, 'out/mobile-web/index.html')
      )
    })
    await expect(assembleMarkovdArtifact({ ...fixture, target: TARGET })).rejects.toThrow(
      'unsafe page asset: out/mobile-web/../../escape.js'
    )
  })

  it('rejects a self-consistent target marker for a different native slot', async () => {
    const fixture = createTemplate()
    const targetPath = join(
      fixture.templateDir,
      MARKOVD_TEMPLATE_TARGETS_DIR,
      TARGET,
      MARKOVD_SERVER_TARGET_FILENAME
    )
    write(targetPath, 'linux-x64-musl\n')
    rewriteManifest(fixture.templateDir, (manifest) => {
      manifest.targets[TARGET]!.files[MARKOVD_SERVER_TARGET_FILENAME] = sha256(targetPath)
    })

    await expect(assembleMarkovdArtifact({ ...fixture, target: TARGET })).rejects.toThrow(
      'target identity does not match'
    )
  })

  it('rejects a self-consistent runtime reference to another Node', async () => {
    const fixture = createTemplate()
    const markerPath = join(
      fixture.templateDir,
      MARKOVD_TEMPLATE_TARGETS_DIR,
      TARGET,
      MARKOVD_NODE_RUNTIME_MARKER_FILENAME
    )
    write(markerPath, `${'0'.repeat(64)}\n`)
    rewriteManifest(fixture.templateDir, (manifest) => {
      manifest.targets[TARGET]!.files[MARKOVD_NODE_RUNTIME_MARKER_FILENAME] = sha256(markerPath)
    })

    await expect(assembleMarkovdArtifact({ ...fixture, target: TARGET })).rejects.toThrow(
      'does not reference the pinned Node'
    )
  })

  it('repairs corrupt artifacts beside the old entry and reuses the repair', async () => {
    const fixture = createTemplate()
    const first = await assembleMarkovdArtifact({ ...fixture, target: TARGET })
    write(join(first, 'markovd.js'), 'corrupted-cache-entry')

    const repaired = await assembleMarkovdArtifact({ ...fixture, target: TARGET })
    expect(repaired).not.toBe(first)
    expect(readFileSync(join(repaired, 'markovd.js'))).toEqual(
      readFileSync(join(fixture.templateDir, 'markovd.js'))
    )
    expect(await assembleMarkovdArtifact({ ...fixture, target: TARGET })).toBe(repaired)
    expect(readFileSync(join(first, 'markovd.js'), 'utf8')).toBe('corrupted-cache-entry')
  })

  // Desktop templates omit drivers; the app's resources copy must still reach the slot (#33846).
  it("copies the app's own driver into the slot when the template references it", async () => {
    const fixture = createTemplate()
    renameSync(
      join(fixture.templateDir, MARKOVD_TEMPLATE_TARGETS_DIR, TARGET, 'agent-browser-linux-x64'),
      join(dirname(fixture.templateDir), 'agent-browser-linux-x64')
    )
    rewriteManifest(fixture.templateDir, (manifest) => {
      Object.assign(manifest.targets[TARGET]!, { packagedBrowser: true })
    })

    const artifactDir = await assembleMarkovdArtifact({ ...fixture, target: TARGET })

    expect(readFileSync(join(artifactDir, 'agent-browser-linux-x64'), 'utf8')).toBe('browser')
  })
})

describe('assembleMarkovdArtifact verification record', () => {
  // Move the clock beyond fixture writes so signatures count as settled.
  const later = (): number => Date.now() + 60_000

  async function assembleUntilSlotRecorded(fixture: {
    templateDir: string
    cacheRoot: string
  }): Promise<string> {
    const first = await assembleMarkovdArtifact({
      ...fixture,
      target: TARGET,
      now: later,
      trustVerificationRecord: true
    })
    expect(
      await assembleMarkovdArtifact({
        ...fixture,
        target: TARGET,
        now: later,
        trustVerificationRecord: true
      })
    ).toBe(first)
    return first
  }

  it('hashes again when a template file is rewritten in place at the same size', async () => {
    const fixture = createTemplate()
    await assembleUntilSlotRecorded(fixture)
    const templateEntry = join(fixture.templateDir, 'markovd.js')
    writeFileSync(templateEntry, 'markovd-ENTRY')

    await expect(
      assembleMarkovdArtifact({
        ...fixture,
        target: TARGET,
        now: later,
        trustVerificationRecord: true
      })
    ).rejects.toThrow('markovd template markovd.js checksum mismatch')
  })

  it('hashes again when the manifest no longer lists the recorded digest', async () => {
    const fixture = createTemplate()
    await assembleUntilSlotRecorded(fixture)
    rewriteManifest(fixture.templateDir, (manifest) => {
      manifest.commonSha256['markovd.js'] = 'f'.repeat(64)
    })

    await expect(
      assembleMarkovdArtifact({
        ...fixture,
        target: TARGET,
        now: later,
        trustVerificationRecord: true
      })
    ).rejects.toThrow('markovd template markovd.js checksum mismatch')
  })

  it('repairs a recorded slot whose file was rewritten in place at the same size', async () => {
    const fixture = createTemplate()
    const slot = await assembleUntilSlotRecorded(fixture)
    writeFileSync(join(slot, 'markovd.js'), 'markovd-ENTRY')

    const repaired = await assembleMarkovdArtifact({
      ...fixture,
      target: TARGET,
      now: later,
      trustVerificationRecord: true
    })
    expect(repaired).toBe(`${slot}.repair-1`)
    expect(readFileSync(join(repaired, 'markovd.js'), 'utf8')).toBe('markovd-entry')
  })
})

describe('materializeMarkovdArtifact cancellation', () => {
  it('detaches a cancelled caller without cancelling the shared cache fill', async () => {
    const fixture = createTemplate()
    const first = new AbortController()
    const one = materializeMarkovdArtifact(TARGET, { ...fixture, signal: first.signal })
    const two = materializeMarkovdArtifact(TARGET, fixture)
    first.abort(new Error('first cancelled'))
    await expect(one).rejects.toThrow('first cancelled')
    const artifact = await two
    expect(readFileSync(join(artifact, 'markovd.js'), 'utf8')).toBe('markovd-entry')
  })
})

describe('packaged template lookup', () => {
  const originalResourcesPath = process.resourcesPath
  const originalTemplatePath = process.env.MARKOV_MARKOVD_TEMPLATE_PATH
  let previousEnvironment: AppEnvironment | null = null

  afterEach(() => {
    Object.defineProperty(process, 'resourcesPath', {
      value: originalResourcesPath,
      configurable: true,
      writable: true
    })
    if (originalTemplatePath === undefined) {
      delete process.env.MARKOV_MARKOVD_TEMPLATE_PATH
    } else {
      process.env.MARKOV_MARKOVD_TEMPLATE_PATH = originalTemplatePath
    }
    if (previousEnvironment) {
      setAppEnvironment(previousEnvironment)
    }
  })

  function installPackagedApp(): { resourcesDir: string; userData: string } {
    const fixture = createTemplate()
    const root = dirname(fixture.templateDir)
    const resourcesDir = join(root, 'Resources')
    mkdirSync(resourcesDir)
    renameSync(fixture.templateDir, join(resourcesDir, 'markovd-template'))
    const userData = join(root, 'userData')
    delete process.env.MARKOV_MARKOVD_TEMPLATE_PATH
    Object.defineProperty(process, 'resourcesPath', {
      value: resourcesDir,
      configurable: true,
      writable: true
    })
    previousEnvironment = hasAppEnvironment() ? getAppEnvironment() : null
    setAppEnvironment({
      getPath: () => userData,
      getAppPath: () => join(resourcesDir, 'app.asar'),
      getVersion: () => '0.0.0-test',
      isPackaged: () => true,
      onWillQuit: () => {},
      exit: () => {},
      getAppMetrics: () => []
    })
    return { resourcesDir, userData }
  }

  it('materializes from Resources/markovd-template into userData with no explicit paths', async () => {
    const { resourcesDir, userData } = installPackagedApp()

    expect(getMarkovdTemplateCandidates()[0]).toBe(join(resourcesDir, 'markovd-template'))
    const artifact = await materializeMarkovdArtifact(TARGET)
    expect(dirname(dirname(artifact))).toBe(join(userData, 'markovd-artifacts'))
    expect(readFileSync(join(artifact, 'markovd.js'), 'utf8')).toBe('markovd-entry')
  })
})

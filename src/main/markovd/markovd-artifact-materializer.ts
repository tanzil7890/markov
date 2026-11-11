import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, copyFile, mkdir, readFile, rename, rm, utimes, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { waitForPromiseWithSignal } from '../../shared/abort-signal-reason'
import {
  MARKOVD_MOBILE_WEB_DIR,
  MARKOVD_MOBILE_WEB_MANIFEST,
  MARKOVD_NODE_RUNTIME_MARKER_FILENAME,
  MARKOVD_SERVER_TARGET_FILENAME,
  MARKOVD_TEMPLATE_MANIFEST_FILENAME,
  MARKOVD_TEMPLATE_TARGETS_DIR,
  MARKOVD_VERSION_FILENAME,
  compareCodeUnits,
  isMarkovdMobileWebAssetPath,
  markovdArtifactFilenames,
  markovdTemplateCommonFilenames,
  markovdTemplatePackagedRipgrep,
  markovdTemplateTargetFilenames
} from '../../shared/markovd-artifacts'
import { pinnedNodeRuntimeAsset, type NodeRuntimeTarget } from '../../shared/node-runtime-pin'
import { findMarkovdCachePath } from '../node-runtime/markovd-cache-path'
import type { PinnedRuntimeMaterializeOptions } from '../node-runtime/pinned-runtime-materializer'
import { readMarkovdArtifactVerificationRecord } from './markovd-artifact-verification-record'
import { markovdArtifactSlotName } from './markovd-artifact-slot-name'
import {
  isCompleteArtifact,
  rememberVerification,
  sameHashes,
  signSlot,
  slotMatchesRecord,
  verifiedArtifactIdentity,
  type ArtifactSource,
  type ExpectedSha256
} from './markovd-artifact-source-verification'
import {
  MarkovdTemplateManifestSchema,
  type MarkovdTemplateManifest
} from './markovd-template-manifest'
import {
  MarkovdArtifactsUnavailableError,
  MarkovdHostUnsupportedError
} from './markovd-host-unavailable'

type MaterializeOptions = PinnedRuntimeMaterializeOptions & {
  templateDir?: string
  cacheRoot?: string
  /** WSL wake only: trust recorded stat signatures instead of rehashing bytes. */
  trustVerificationRecord?: boolean
}

const materializations = new Map<string, Promise<string>>()
// Retain handed-out slots: concurrent deployments may still be reading them.
const materializedVersions = new Set<string>()

export function materializedMarkovdArtifactVersions(): ReadonlySet<string> {
  return materializedVersions
}

/** Reference the runtime separately from the verified slot. */
export async function materializeMarkovdArtifact(
  target: NodeRuntimeTarget,
  options: MaterializeOptions = {}
): Promise<string> {
  options.signal?.throwIfAborted()
  const templateDir = options.templateDir ?? resolveMarkovdTemplateDir()
  const cacheRoot =
    options.cacheRoot ?? join(getAppEnvironment().getPath('userData'), 'markovd-artifacts')
  const trustVerificationRecord = options.trustVerificationRecord === true
  // SSH/local callers must not join fills that trust verification records.
  const key = `${templateDir}\0${cacheRoot}\0${target}\0${trustVerificationRecord}`
  const existing = materializations.get(key)
  if (existing) {
    return waitForPromiseWithSignal(existing, options.signal)
  }
  // Cancellation detaches one caller; the bounded cache fill still serves other deployments.
  const pending = assembleMarkovdArtifact({
    templateDir,
    cacheRoot,
    target,
    trustVerificationRecord
  }).finally(() => materializations.delete(key))
  materializations.set(key, pending)
  return waitForPromiseWithSignal(pending, options.signal)
}

export async function assembleMarkovdArtifact(args: {
  templateDir: string
  cacheRoot: string
  target: NodeRuntimeTarget
  manifest?: MarkovdTemplateManifest
  now?: () => number
  /** Disabled for SSH/local serve: hash every launch without reading/writing records. */
  trustVerificationRecord?: boolean
}): Promise<string> {
  const trust = args.trustVerificationRecord === true
  const manifest = args.manifest ?? (await readTemplateManifest(args.templateDir))
  const mobileWebAssets = templateMobileWebAssets(manifest)
  const sources = artifactSources(args.templateDir, args.target, manifest, mobileWebAssets)
  const expected = expectedTemplateSha256(args.target, manifest, mobileWebAssets)
  const targetRoot = join(args.cacheRoot, args.target)
  const nowMs = (args.now ?? Date.now)()
  const record = trust ? await readMarkovdArtifactVerificationRecord(targetRoot) : null
  const identity = await verifiedArtifactIdentity(sources, expected, record, nowMs, trust)
  await verifyTemplateMarkers(args.templateDir, args.target)
  const { fullVersion, sourceHashes } = identity
  const recordedSlot =
    record && record.contentDigest === identity.contentDigest && sameHashes(record, sourceHashes)
      ? record.slot
      : null
  let slotFromRecord = false
  const cached = await findMarkovdCachePath(
    (attempt) => join(targetRoot, markovdArtifactSlotName(fullVersion, attempt)),
    async (path) => {
      slotFromRecord = await slotMatchesRecord(path, fullVersion, sources, recordedSlot, nowMs)
      return slotFromRecord || isCompleteArtifact(path, fullVersion, sources, sourceHashes)
    }
  )
  const targetDir = cached.path
  materializedVersions.add(fullVersion)
  if (cached.verified) {
    const now = new Date()
    await utimes(targetDir, now, now).catch(() => undefined)
    if (trust) {
      const slot = slotFromRecord ? recordedSlot : await signSlot(targetDir, sources, nowMs)
      await rememberVerification(targetRoot, record, identity, slot)
    }
    return targetDir
  }
  await mkdir(targetRoot, { recursive: true })
  const stagingDir = join(targetRoot, `.staging-${process.pid}-${randomUUID()}`)
  try {
    for (const source of sources) {
      const destination = join(stagingDir, source.filename)
      await mkdir(dirname(destination), { recursive: true })
      await copyFile(source.path, destination)
      if (source.executable && !args.target.startsWith('win32-')) {
        await chmod(destination, 0o755)
      }
    }
    await writeFile(join(stagingDir, MARKOVD_VERSION_FILENAME), `${fullVersion}\n`, { mode: 0o600 })
    if (!(await isCompleteArtifact(stagingDir, fullVersion, sources, sourceHashes))) {
      throw new Error('Markovd artifact sources changed while copying')
    }
    try {
      await rename(stagingDir, targetDir)
    } catch (error) {
      if (!(await isCompleteArtifact(targetDir, fullVersion, sources, sourceHashes))) {
        throw new Error(`Markovd artifact cache entry is unavailable or corrupted: ${targetDir}`, {
          cause: error
        })
      }
    }
    if (trust) {
      // Fresh copies are unsettled, so the next launch must hash again.
      await rememberVerification(targetRoot, record, identity, null)
    }
    return targetDir
  } finally {
    await rm(stagingDir, { recursive: true, force: true })
  }
}

function isExecutableArtifact(filename: string): boolean {
  return /(?:^|\/)(?:rg|spawn-helper)$/.test(filename)
}

function artifactSources(
  templateDir: string,
  target: NodeRuntimeTarget,
  manifest: MarkovdTemplateManifest,
  mobileWebAssets: readonly string[]
): ArtifactSource[] {
  const targetDir = join(templateDir, MARKOVD_TEMPLATE_TARGETS_DIR, target)
  const targetManifest = manifest.targets[target]
  if (!targetManifest) {
    throw new MarkovdHostUnsupportedError(`Packaged markovd template does not support ${target}`)
  }
  const packagedRipgrep = markovdTemplatePackagedRipgrep(
    manifest.schemaVersion,
    target,
    targetManifest.packagedRipgrep
  )
  const targetFiles = new Set(markovdTemplateTargetFilenames(target))
  const required = markovdArtifactFilenames(target, mobileWebAssets).map((filename) => ({
    filename,
    path: join(
      filename === packagedRipgrep
        ? dirname(templateDir)
        : targetFiles.has(filename)
          ? targetDir
          : templateDir,
      ...filename.split('/')
    ),
    executable: isExecutableArtifact(filename)
  }))
  if (!targetManifest.browserName) {
    return required
  }
  return [
    ...required,
    {
      filename: targetManifest.browserName,
      path: join(
        targetManifest.packagedBrowser ? dirname(templateDir) : targetDir,
        targetManifest.browserName
      ),
      executable: true
    }
  ]
}

function expectedTemplateSha256(
  target: NodeRuntimeTarget,
  manifest: MarkovdTemplateManifest,
  mobileWebAssets: readonly string[]
): Map<string, ExpectedSha256> {
  const targetManifest = manifest.targets[target]
  if (!targetManifest) {
    throw new MarkovdHostUnsupportedError(`Packaged markovd template does not support ${target}`)
  }
  const expected = new Map<string, ExpectedSha256>()
  for (const filename of markovdTemplateCommonFilenames(mobileWebAssets)) {
    const sha256 = manifest.commonSha256[filename]
    if (!sha256) {
      throw new Error(`Packaged markovd template manifest omits ${filename}`)
    }
    expected.set(filename, { sha256, label: `markovd template ${filename}` })
  }
  for (const filename of markovdTemplateTargetFilenames(target)) {
    const sha256 = targetManifest.files[filename]
    if (!sha256) {
      throw new Error(`Packaged markovd template manifest omits ${target} ${filename}`)
    }
    expected.set(filename, { sha256, label: `${target} ${filename}` })
  }
  if (targetManifest.browserName && targetManifest.browserSha256) {
    // Browser names must not override required-file digests.
    if (expected.has(targetManifest.browserName)) {
      throw new Error(`Packaged markovd template ${target} browser name collides with a slot file`)
    }
    expected.set(targetManifest.browserName, {
      sha256: targetManifest.browserSha256,
      label: `${target} browser`
    })
  }
  return expected
}

/** Read asset names from the verified template manifest without extra WSL-wake file reads. */
function templateMobileWebAssets(manifest: MarkovdTemplateManifest): string[] {
  const prefix = `${MARKOVD_MOBILE_WEB_DIR}/`
  const assets = Object.keys(manifest.commonSha256).filter(
    (filename) => filename.startsWith(prefix) && filename !== MARKOVD_MOBILE_WEB_MANIFEST
  )
  // Asset names become slot copy destinations; reject paths that escape.
  const unsafe = assets.find(
    (filename) => !isMarkovdMobileWebAssetPath(filename.slice(prefix.length))
  )
  if (unsafe) {
    throw new Error(`Packaged markovd template names an unsafe page asset: ${unsafe}`)
  }
  return assets.sort(compareCodeUnits)
}

async function readTemplateManifest(templateDir: string): Promise<MarkovdTemplateManifest> {
  return MarkovdTemplateManifestSchema.parse(
    JSON.parse(await readFile(join(templateDir, MARKOVD_TEMPLATE_MANIFEST_FILENAME), 'utf8'))
  )
}

async function verifyTemplateMarkers(
  templateDir: string,
  target: NodeRuntimeTarget
): Promise<void> {
  const targetDir = join(templateDir, MARKOVD_TEMPLATE_TARGETS_DIR, target)
  if ((await readFile(join(targetDir, MARKOVD_SERVER_TARGET_FILENAME), 'utf8')).trim() !== target) {
    throw new Error(`Packaged markovd template target identity does not match ${target}`)
  }
  // Match this client’s runtime pin: it is the runtime the client will upload.
  const runtimeReference = await readFile(
    join(targetDir, MARKOVD_NODE_RUNTIME_MARKER_FILENAME),
    'utf8'
  )
  if (runtimeReference.trim() !== pinnedNodeRuntimeAsset(target).executableSha256) {
    throw new Error(`Packaged markovd template ${target} does not reference the pinned Node`)
  }
}

export function getMarkovdTemplateCandidates(): string[] {
  const candidates: string[] = []
  if (process.env.MARKOV_MARKOVD_TEMPLATE_PATH) {
    candidates.push(process.env.MARKOV_MARKOVD_TEMPLATE_PATH)
  }
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'markovd-template'))
  }
  const appPath = getAppEnvironment().getAppPath()
  candidates.push(
    join(appPath, 'out', 'markovd-template'),
    join(appPath, 'resources', 'markovd-template')
  )
  return [...new Set(candidates)]
}

export function hasMarkovdTemplate(): boolean {
  return getMarkovdTemplateCandidates().some((candidate) => existsSync(candidate))
}

function resolveMarkovdTemplateDir(): string {
  const found = getMarkovdTemplateCandidates().find((candidate) => existsSync(candidate))
  if (!found) {
    throw new MarkovdArtifactsUnavailableError(
      'The packaged markovd deployment template is missing'
    )
  }
  return found
}

export function resetMarkovdArtifactMaterializationsForTests(): void {
  materializations.clear()
}

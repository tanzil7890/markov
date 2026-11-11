// Desktop deployment template ships JS/addons for every target, with no Node runtime (D2); SSH/managed deployments materialize its slots.
// Reseal SignPath-modified binaries: node config/scripts/packaged-markovd-template.cjs --reseal-signed <appDir> <signedListFile>.
const { createHash } = require('node:crypto')
const {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  writeFileSync
} = require('node:fs')
const { join, relative, resolve, sep } = require('node:path')
const {
  MARKOVD_TEMPLATE_MANIFEST_FILENAME,
  MARKOVD_TEMPLATE_TARGETS_DIR
} = require('../../../../src/shared/markovd-artifacts.ts')
const { verifyPackagedMarkovdTemplate } = require('./verify-packaged-markovd-template.cjs')
const {
  compactPackagedMarkovdRipgrep,
  resealSignedPackagedRipgrep
} = require('./compact-packaged-markovd-ripgrep.cjs')
const {
  referencePackagedMarkovdBrowser,
  resealSignedPackagedBrowser
} = require('./packaged-markovd-browser.cjs')

const MARKOVD_TEMPLATE_RESOURCE_DIR = 'markovd-template'
const markovdTemplateExtraResource = {
  from: 'out/markovd-template',
  to: MARKOVD_TEMPLATE_RESOURCE_DIR
}
// Why a second entry: electron-builder's copy filter always drops a source's root node_modules.
const markovdTemplateNodeModulesExtraResource = {
  from: `${markovdTemplateExtraResource.from}/node_modules`,
  to: `${MARKOVD_TEMPLATE_RESOURCE_DIR}/node_modules`
}
// Exclude whole tree from automatic codesign (ELF/PE); afterPack signs darwin files and reseals their hashes before app signing.
const markovdTemplateMacSignIgnore = ['/markovd-template/']

// Mach-O thin (both byte orders, 32/64-bit) and fat headers.
const MACH_O_MAGICS = new Set(['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe'])

/** Release packaging sets it; dev and local builds may ship without the template. */
function isMarkovdTemplateRequired(env = process.env) {
  return env.MARKOV_REQUIRE_MARKOVD_TEMPLATE === '1'
}

// Why: electron-builder only warns on a missing extraResources source.
function assertMarkovdTemplateBuilt(
  projectDir = join(__dirname, '../../..', '..'),
  env = process.env
) {
  const manifest = join(
    projectDir,
    markovdTemplateExtraResource.from,
    MARKOVD_TEMPLATE_MANIFEST_FILENAME
  )
  if (isMarkovdTemplateRequired(env) && !existsSync(manifest)) {
    throw new Error(
      `MARKOV_REQUIRE_MARKOVD_TEMPLATE=1 but ${manifest} is missing; download the merged template ` +
        'from the release template job, or build it with `pnpm build:markovd-template`.'
    )
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function isMachO(path) {
  const fd = openSync(path, 'r')
  try {
    const header = Buffer.alloc(4)
    return readSync(fd, header, 0, 4, 0) === 4 && MACH_O_MAGICS.has(header.toString('hex'))
  } finally {
    closeSync(fd)
  }
}

/** Template-relative paths of the darwin targets' Mach-O files, which macOS signing rewrites. */
function findMarkovdTemplateMachOFiles(templateDir) {
  const targetsDir = join(templateDir, MARKOVD_TEMPLATE_TARGETS_DIR)
  return readdirSync(targetsDir)
    .filter((target) => target.startsWith('darwin-'))
    .flatMap((target) =>
      readdirSync(join(targetsDir, target), { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && isMachO(join(entry.parentPath, entry.name)))
        .map((entry) =>
          relative(templateDir, join(entry.parentPath, entry.name)).split(sep).join('/')
        )
    )
    .sort()
}

// Reseal only signer-named files; verify all others against build hashes so resealing cannot launder unrelated changes.
function resealMarkovdTemplateManifest(templateDir, signedPaths) {
  const manifestPath = join(templateDir, MARKOVD_TEMPLATE_MANIFEST_FILENAME)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const path of signedPaths) {
    const segments = path.split('/')
    const target =
      segments[0] === MARKOVD_TEMPLATE_TARGETS_DIR ? manifest.targets?.[segments[1]] : undefined
    const filename = segments.slice(2).join('/')
    const digest = () => sha256(join(templateDir, ...segments))
    if (target?.files && Object.hasOwn(target.files, filename)) {
      target.files[filename] = digest()
    } else if (target && target.browserName === filename) {
      target.browserSha256 = digest()
    } else if (!target && Object.hasOwn(manifest.commonSha256 ?? {}, path)) {
      manifest.commonSha256[path] = digest()
    } else {
      throw new Error(`[packaged-markovd-template] ${path} is not a template manifest entry`)
    }
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

// Notarization requires Developer ID on nested Mach-O: afterPack signs, reseals and verifies exact shipped bytes.
async function finalizePackagedMarkovdTemplate(resourcesDir, options) {
  const { platform, env = process.env, signMacBinary } = options
  const templateDir = join(resourcesDir, MARKOVD_TEMPLATE_RESOURCE_DIR)
  if (!existsSync(templateDir)) {
    if (isMarkovdTemplateRequired(env)) {
      throw new Error(`Packaged app is missing the markovd deployment template: ${templateDir}`)
    }
    console.log('[packaged-markovd-template] skipped: this build ships no markovd template')
    return
  }
  if (platform === 'darwin') {
    const machO = findMarkovdTemplateMachOFiles(templateDir)
    for (const path of machO) {
      await signMacBinary(join(templateDir, ...path.split('/')))
    }
    resealMarkovdTemplateManifest(templateDir, machO)
  }
  compactPackagedMarkovdRipgrep(resourcesDir)
  referencePackagedMarkovdBrowser(resourcesDir)
}

/** `inner-signing-list.txt` lines are app-relative Windows paths; keep the template's. */
function resealSignedWindowsApp(appDir, signedListFile) {
  const prefix = `resources/${MARKOVD_TEMPLATE_RESOURCE_DIR}/`
  const signedAppPaths = readFileSync(signedListFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll('\\', '/'))
  const signed = signedAppPaths
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length))
  const resourcesDir = join(appDir, 'resources')
  if (!existsSync(join(resourcesDir, MARKOVD_TEMPLATE_RESOURCE_DIR))) {
    if (isMarkovdTemplateRequired()) {
      throw new Error(`Signed app is missing the markovd deployment template under ${resourcesDir}`)
    }
    console.log('[packaged-markovd-template] skipped reseal: this build ships no markovd template')
    return
  }
  resealMarkovdTemplateManifest(join(resourcesDir, MARKOVD_TEMPLATE_RESOURCE_DIR), signed)
  const signedResources = signedAppPaths
    .filter((path) => path.startsWith('resources/'))
    .map((path) => path.slice(10))
  resealSignedPackagedRipgrep(resourcesDir, signedResources)
  resealSignedPackagedBrowser(resourcesDir, signedResources)
  verifyPackagedMarkovdTemplate(resourcesDir)
  console.log(`[packaged-markovd-template] resealed ${signed.length} signed template file(s)`)
}

module.exports = {
  MARKOVD_TEMPLATE_RESOURCE_DIR,
  assertMarkovdTemplateBuilt,
  finalizePackagedMarkovdTemplate,
  findMarkovdTemplateMachOFiles,
  isMarkovdTemplateRequired,
  markovdTemplateExtraResource,
  markovdTemplateNodeModulesExtraResource,
  markovdTemplateMacSignIgnore,
  resealMarkovdTemplateManifest,
  resealSignedWindowsApp
}

if (require.main === module) {
  const [flag, appDir, signedListFile] = process.argv.slice(2)
  if (flag !== '--reseal-signed' || !appDir || !signedListFile) {
    console.error('usage: packaged-markovd-template.cjs --reseal-signed <appDir> <signedListFile>')
    process.exit(2)
  }
  resealSignedWindowsApp(resolve(appDir), resolve(signedListFile))
}

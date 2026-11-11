import { createAdaptorServer } from '@hono/node-server'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { CloudDatabase } from '@markov-cloud/cloud-database'
import { z } from 'zod'
import { AccountsCallerLookup } from './accounts-caller-lookup.js'
import { ARTIFACT_PAGE_CSP, artifactNotFoundPage } from './artifact-page.js'
import { ArtifactStore, ArtifactWriteSchema } from './artifact-store.js'
import type { SharingConfig } from './config.js'
import { DatabaseFileStorage } from './database-file-storage.js'
import type { FileStorage } from './file-storage.js'
import { multipartBoundary, parseMultipartForm, readBodyUpTo } from './multipart-form.js'
import { ID_PATTERN } from './opaque-token.js'
import { inspectSkillBundleArchive } from './skill-bundle-archive.js'
import { BUNDLE_NAME_PATTERN, type SkillBundleManifestV1 } from './skill-bundle-manifest.js'
import { SkillPackageStore } from './skill-package-store.js'
import { SKILL_SHARE_PAGE_CSP, skillShareNotFoundPage, skillSharePage } from './skill-share-page.js'
import { SkillShareStore } from './skill-share-store.js'
import { SkillUploadStore, UPLOAD_TOKEN_FIELD } from './skill-upload-store.js'
import { SharingError } from './sharing-error.js'

const SMALL_JSON_BODY_BYTES = 64 * 1024
const ARTIFACT_BODY_BYTES = 11 * 1024 * 1024
const MAX_SKILL_ARCHIVE_BYTES = 40 * 1024 * 1024
const MULTIPART_OVERHEAD_BYTES = 64 * 1024
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,200}$/
const GRANT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const SKILL_PACKAGE_CONTENT_TYPE = 'application/vnd.markov.skill+tar+gzip'
const API_CSP = "default-src 'none'; frame-ancestors 'none'"

const IdSchema = z.string().regex(ID_PATTERN)
const UploadCreateSchema = z.object({
  expectedArchiveSha256: z.string().regex(/^[a-f0-9]{64}$/),
  expectedCompressedBytes: z.number().int().positive()
})
const FinalizeSchema = z.object({ releaseNotes: z.string().max(10_000).default('') })
const ShareCreateSchema = z.object({ pinnedVersionId: IdSchema.optional() })
const GrantSchema = z.object({
  versionId: IdSchema.optional(),
  installTarget: z.enum(['local', 'remote']).optional()
})

type SharingEnv = { Variables: { userId: string } }

export type SharingServerDependencies = {
  config: SharingConfig
  database: CloudDatabase
  storage?: FileStorage
  fetch?: typeof fetch
  now?: () => number
}

function readBearer(header: string | undefined): string | null {
  if (!header) return null
  const [scheme, ...rest] = header.split(' ')
  const token = rest.join(' ').trim()
  return scheme?.toLowerCase() === 'bearer' && token.length > 0 ? token : null
}

async function readJson<T extends z.ZodType>(context: Context, schema: T): Promise<z.infer<T>> {
  const body: unknown = await context.req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new SharingError(400, 'invalid_request')
  return parsed.data
}

function idempotencyKey(context: Context): string {
  const key = context.req.header('idempotency-key') ?? ''
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new SharingError(400, 'idempotency_key_invalid', 'Send an idempotency-key header such as a UUID.')
  }
  return key
}

// An id outside the desktop's pattern cannot name a real object.
function pathId(context: Context, name: string, notFoundCode: string): string {
  const value = context.req.param(name) ?? ''
  if (!ID_PATTERN.test(value)) throw new SharingError(404, notFoundCode)
  return value
}

export function createSharingApp(dependencies: SharingServerDependencies) {
  const { config, database } = dependencies
  const now = dependencies.now ?? Date.now
  const storage = dependencies.storage ?? new DatabaseFileStorage(database, now)
  const callers = new AccountsCallerLookup(
    config.accountsUrl,
    dependencies.fetch ?? fetch,
    now,
    config.callerCacheMs
  )
  const artifacts = new ArtifactStore(database, storage, now, {
    publicUrl: config.publicUrl,
    ttlMs: config.artifactTtlMs,
    retentionMs: config.artifactRetentionMs
  })
  const uploads = new SkillUploadStore(database, storage, now, {
    publicUrl: config.publicUrl,
    ttlMs: config.uploadPolicyTtlMs
  })
  const packages = new SkillPackageStore(database, storage, now, { publicUrl: config.publicUrl })
  const shares = new SkillShareStore(database, storage, packages, now, {
    publicUrl: config.publicUrl,
    grantTtlMs: config.downloadGrantTtlMs
  })
  const app = new Hono<SharingEnv>()

  const tooLarge = (context: Context) => context.json({ code: 'request_too_large' }, 413)
  const smallBody = bodyLimit({ maxSize: SMALL_JSON_BODY_BYTES, onError: tooLarge })
  const artifactBody = bodyLimit({ maxSize: ARTIFACT_BODY_BYTES, onError: tooLarge })

  // 401 only for a missing or rejected token: the desktop signs out after repeated 401s.
  const requireCaller: MiddlewareHandler<SharingEnv> = async (context, next) => {
    const token = readBearer(context.req.header('authorization'))
    const caller = token ? await callers.lookup(token) : ({ status: 'unauthorized' } as const)
    if (caller.status === 'unauthorized') {
      context.header('www-authenticate', 'Bearer error="invalid_token"')
      return context.json({ code: 'unauthorized' }, 401)
    }
    if (caller.status === 'unavailable') {
      return context.json({ code: 'accounts_unavailable', message: 'Sign-in could not be checked.' }, 503)
    }
    context.set('userId', caller.userId)
    await next()
  }

  app.use('*', async (context, next) => {
    await next()
    context.header('cache-control', 'no-store')
    context.header('x-content-type-options', 'nosniff')
    context.header('referrer-policy', 'no-referrer')
    if (!context.res.headers.has('content-security-policy')) {
      context.header('content-security-policy', API_CSP)
    }
  })

  app.get('/healthz', (context) => context.json({ ok: true }))

  app.get('/v1/artifacts', requireCaller, async (context) =>
    context.json(await artifacts.list(context.get('userId'), context.req.query('cursor') || undefined))
  )

  app.post('/v1/artifacts', requireCaller, artifactBody, async (context) => {
    const key = idempotencyKey(context)
    const replay = await artifacts.findCreated(context.get('userId'), key)
    if (replay) return context.json(replay, 201)
    const write = await readJson(context, ArtifactWriteSchema)
    return context.json(await artifacts.create(context.get('userId'), key, write), 201)
  })

  app.put('/v1/artifacts/:slug', requireCaller, artifactBody, async (context) => {
    const slug = pathId(context, 'slug', 'artifact_not_found')
    const write = await readJson(context, ArtifactWriteSchema)
    return context.json(await artifacts.update(slug, context.req.header('x-markov-edit-token') ?? '', write))
  })

  app.delete('/v1/artifacts/:slug', requireCaller, smallBody, async (context) => {
    const slug = pathId(context, 'slug', 'artifact_not_found')
    await artifacts.delete(slug, context.get('userId'), context.req.header('x-markov-edit-token') || undefined)
    return context.body(null, 204)
  })

  app.get('/a/:slug', async (context) => {
    const slug = context.req.param('slug')
    const page = ID_PATTERN.test(slug) ? await artifacts.openPublicPage(slug) : null
    const headers = { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': ARTIFACT_PAGE_CSP }
    if (!page) return new Response(artifactNotFoundPage(), { status: 404, headers })
    // ?embed=1 (the desktop preview) gets the same bytes: the page has no chrome to strip.
    return new Response(page.body, { headers: { ...headers, 'content-length': String(page.byteSize) } })
  })

  app.get('/v1/skill-packages/by-name/:name', requireCaller, async (context) => {
    const name = context.req.param('name')
    const packageId =
      name.length <= 64 && BUNDLE_NAME_PATTERN.test(name)
        ? await packages.findOwnedByName(context.get('userId'), name)
        : null
    if (!packageId) throw new SharingError(404, 'skill_package_not_found')
    return context.json({ package: { id: packageId } })
  })

  app.post('/v1/skill-packages/uploads', requireCaller, smallBody, async (context) => {
    const key = idempotencyKey(context)
    const body = await readJson(context, UploadCreateSchema)
    if (body.expectedCompressedBytes > MAX_SKILL_ARCHIVE_BYTES) {
      throw new SharingError(413, 'skill_package_too_large', 'Skill packages are limited to 40 MiB.')
    }
    return context.json(
      await uploads.create(context.get('userId'), key, {
        sha256: body.expectedArchiveSha256,
        bytes: body.expectedCompressedBytes
      }),
      201
    )
  })

  // The policy URL: no session, authorized by the upload token in the form fields.
  app.post('/v1/skill-packages/uploads/:uploadId/content', async (context) => {
    const upload = await uploads.requirePending(pathId(context, 'uploadId', 'skill_upload_not_found'))
    const boundary = multipartBoundary(context.req.header('content-type'))
    if (!boundary) throw new SharingError(400, 'invalid_request', 'Expected multipart/form-data.')
    const limit = upload.expectedBytes + MULTIPART_OVERHEAD_BYTES
    const declaredBytes = Number(context.req.header('content-length') ?? 0)
    const body = declaredBytes > limit ? null : await readBodyUpTo(context.req.raw.body, limit)
    if (!body) throw new SharingError(413, 'request_too_large')
    const form = parseMultipartForm(body, boundary)
    if (!form) throw new SharingError(400, 'invalid_request', 'The multipart body is malformed.')
    await uploads.acceptContent(upload, form.fields.get(UPLOAD_TOKEN_FIELD), form.files.get('file'))
    return context.body(null, 204)
  })

  app.post('/v1/skill-packages/uploads/:uploadId/finalize', requireCaller, smallBody, async (context) => {
    const upload = await uploads.get(pathId(context, 'uploadId', 'skill_upload_not_found'))
    if (!upload || upload.ownerUserId !== context.get('userId')) {
      throw new SharingError(404, 'skill_upload_not_found')
    }
    if (upload.packageId !== null && upload.versionId !== null) {
      const version = await packages.version(upload.packageId, upload.versionId)
      if (!version) throw new SharingError(404, 'skill_version_not_found')
      return context.json({ version })
    }
    const body = await readJson(context, FinalizeSchema)
    const archive = await uploads.readVerifiedArchive(upload)
    let manifest: SkillBundleManifestV1
    try {
      manifest = await inspectSkillBundleArchive(archive)
    } catch (error) {
      throw new SharingError(400, 'skill_package_invalid', error instanceof Error ? error.message : undefined)
    }
    return context.json({ version: await packages.publish({ upload, manifest, releaseNotes: body.releaseNotes }) })
  })

  app.post('/v1/skill-packages/:packageId/shares', requireCaller, smallBody, async (context) => {
    const packageId = pathId(context, 'packageId', 'skill_package_not_found')
    const key = idempotencyKey(context)
    const body = await readJson(context, ShareCreateSchema)
    return context.json(
      { share: await shares.create(context.get('userId'), packageId, key, body.pinnedVersionId) },
      201
    )
  })

  app.post(
    '/v1/skill-packages/:packageId/versions/:versionId/download-grants',
    requireCaller,
    smallBody,
    async (context) => {
      const packageId = pathId(context, 'packageId', 'skill_package_not_found')
      const versionId = pathId(context, 'versionId', 'skill_version_not_found')
      await readJson(context, GrantSchema.omit({ versionId: true }))
      return context.json(await shares.grantForPackageVersion(context.get('userId'), packageId, versionId))
    }
  )

  app.get('/v1/skill-packages/:packageId', requireCaller, async (context) => {
    const packageId = pathId(context, 'packageId', 'skill_package_not_found')
    return context.json({ package: await packages.details(packageId, context.get('userId')) })
  })

  app.delete('/v1/skill-packages/:packageId', requireCaller, smallBody, async (context) => {
    await packages.delete(pathId(context, 'packageId', 'skill_package_not_found'), context.get('userId'))
    return context.body(null, 204)
  })

  app.get('/v1/skill-shares', requireCaller, async (context) =>
    context.json({ shares: await shares.listOwned(context.get('userId')) })
  )

  app.get('/v1/skill-shares/:shareId', async (context) =>
    context.json({ share: await shares.resolve(pathId(context, 'shareId', 'skill_share_not_found')) })
  )

  app.delete('/v1/skill-shares/:shareId', requireCaller, smallBody, async (context) => {
    await shares.revoke(pathId(context, 'shareId', 'skill_share_not_found'), context.get('userId'))
    return context.body(null, 204)
  })

  app.post('/v1/skill-shares/:shareId/download-grants', smallBody, async (context) => {
    const shareId = pathId(context, 'shareId', 'skill_share_not_found')
    const body = await readJson(context, GrantSchema)
    return context.json(await shares.grantForShare(shareId, body.versionId))
  })

  // Streams the stored archive directly; the desktop refuses redirects on this hop.
  app.get('/v1/skill-downloads/:grantToken', async (context) => {
    const token = context.req.param('grantToken')
    const file = GRANT_TOKEN_PATTERN.test(token) ? await shares.openDownload(token) : null
    if (!file) throw new SharingError(404, 'skill_download_not_found')
    return new Response(file.body, {
      headers: {
        'content-type': SKILL_PACKAGE_CONTENT_TYPE,
        'content-length': String(file.byteSize),
        'content-disposition': 'attachment; filename="package.tar.gz"'
      }
    })
  })

  app.get('/skills/share/:shareId', async (context) => {
    const shareId = context.req.param('shareId')
    const resolved = ID_PATTERN.test(shareId)
      ? await shares.resolve(shareId).catch((error: unknown) => {
          if (error instanceof SharingError && error.status === 404) return null
          throw error
        })
      : null
    context.header('content-security-policy', SKILL_SHARE_PAGE_CSP)
    return resolved
      ? context.html(skillSharePage(resolved.id, resolved.version))
      : context.html(skillShareNotFoundPage(), 404)
  })

  app.notFound((context) => context.json({ code: 'not_found' }, 404))
  app.onError((error, context) => {
    if (error instanceof SharingError) {
      return context.json(
        { code: error.code, ...(error.message !== error.code ? { message: error.message } : {}) },
        error.status
      )
    }
    console.error(JSON.stringify({ event: 'markov_sharing_request_failed', message: error.message }))
    return context.json({ code: 'internal_error' }, 500)
  })

  const sweep = async (): Promise<void> => {
    await shares.deleteExpiredGrants()
    await uploads.deleteExpiredPending()
    await artifacts.deleteExpired()
  }

  return { app, sweep }
}

export function createSharingServer(dependencies: SharingServerDependencies) {
  const { app, sweep } = createSharingApp(dependencies)
  return { app, sweep, server: createAdaptorServer({ fetch: app.fetch }) }
}

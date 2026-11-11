import { createHash, randomUUID } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { loadSharingConfig } from './config.js'
import { openInMemorySharingDatabase } from './sharing-database.js'
import { createSharingApp } from './sharing-server.js'

const PUBLIC_URL = 'http://127.0.0.1:8792'
const USERS: Record<string, string> = { 'Bearer token-a': 'user-a', 'Bearer token-b': 'user-b' }

const SKILL_MARKDOWN = '---\nname: hello\ndescription: Says hello\n---\n# Hello\n'
const SKILL_MARKDOWN_SHA256 = 'e60411b1406c97babcccbfd1f1af02686cd0207f51d6b04ca3c8771a5fea6224'
const SKILL_DIGEST = '28fb67af82fb0994dc14cddf794ed9c5dcc73365c4b866f6e54cedd48030d035'
const BUNDLE_DIGEST = 'a211c1967260e9cf3c063d5eb6df60dff9848253c4dba0fa1533b9df81516ecf'
const PACKAGE_ID = 'pkg_hello'
const VERSION_ID = 'ver_1'

async function createHarness() {
  const accounts = async (_input: unknown, init?: RequestInit): Promise<Response> => {
    const userId = USERS[new Headers(init?.headers).get('authorization') ?? '']
    return userId
      ? Response.json({ cloud: { userId } })
      : Response.json({ error: 'invalid_token' }, { status: 401 })
  }
  const { app } = createSharingApp({
    config: loadSharingConfig({
      MARKOV_SHARING_PUBLIC_URL: PUBLIC_URL,
      MARKOV_SHARING_ACCOUNTS_URL: 'http://127.0.0.1:8790'
    }),
    database: await openInMemorySharingDatabase(),
    fetch: accounts as typeof fetch
  })
  const call = (path: string, init: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
    app.request(path, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...init.headers
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
    })
  return { app, call }
}

function ustarHeader(path: string, size: number): Buffer {
  const header = Buffer.alloc(512)
  header.write(path, 0, 'utf8')
  header.write('0000644\0', 100)
  header.write('0000000\0', 108)
  header.write('0000000\0', 116)
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124)
  header.write('00000000000\0', 136)
  header.fill(0x20, 148, 156)
  header.write('0', 156)
  header.write('ustar\0', 257)
  header.write('00', 263)
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148)
  return header
}

function tarEntry(path: string, content: string): Buffer {
  const bytes = Buffer.from(content, 'utf8')
  return Buffer.concat([ustarHeader(path, bytes.length), bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)])
}

function skillArchive(): Buffer {
  const manifest = {
    schemaVersion: 1,
    packageId: PACKAGE_ID,
    versionId: VERSION_ID,
    bundleName: 'hello-bundle',
    description: 'A friendly bundle',
    createdAt: '2026-11-09T00:00:00.000Z',
    skills: [
      {
        id: 'hello',
        name: 'hello',
        description: 'Says hello',
        digest: SKILL_DIGEST,
        files: [
          {
            path: 'SKILL.md',
            size: 52,
            executable: false,
            classification: 'text',
            sha256: SKILL_MARKDOWN_SHA256,
            identitySha256: SKILL_MARKDOWN_SHA256
          }
        ]
      }
    ],
    bundleDigest: BUNDLE_DIGEST
  }
  const plugin = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'hello-bundle',
    version: VERSION_ID,
    description: 'A friendly bundle'
  }
  return gzipSync(
    Buffer.concat([
      tarEntry('plugin.json', JSON.stringify(plugin)),
      tarEntry('dev.markov.skill-sharing/manifest.json', JSON.stringify(manifest)),
      tarEntry('skills/hello/SKILL.md', SKILL_MARKDOWN),
      Buffer.alloc(1024)
    ])
  )
}

// Same layout the desktop's skill-cloud-direct-upload.ts sends: policy fields, then the file.
function multipartUpload(fields: Record<string, string>, archive: Buffer): { body: Buffer; contentType: string } {
  const boundary = `markov-skill-${randomUUID()}`
  const parts = Object.entries(fields).map(([name, value]) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
  )
  const fileHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="package.tar.gz"\r\nContent-Type: application/vnd.markov.skill+tar+gzip\r\n\r\n`
  )
  return {
    body: Buffer.concat([...parts, fileHeader, archive, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    contentType: `multipart/form-data; boundary=${boundary}`
  }
}

type Harness = Awaited<ReturnType<typeof createHarness>>

async function publishAndShare(harness: Harness, archive: Buffer) {
  const sha256 = createHash('sha256').update(archive).digest('hex')
  const created = await harness.call('/v1/skill-packages/uploads', {
    method: 'POST',
    token: 'token-a',
    headers: { 'idempotency-key': randomUUID() },
    body: { expectedArchiveSha256: sha256, expectedCompressedBytes: archive.length }
  })
  expect(created.status).toBe(201)
  const { upload } = (await created.json()) as {
    upload: { id: string; policy: { url: string; fields: Record<string, string> } }
  }
  const form = multipartUpload(upload.policy.fields, archive)
  const uploaded = await harness.app.request(upload.policy.url, {
    method: 'POST',
    headers: { 'content-type': form.contentType },
    body: form.body
  })
  expect(uploaded.status).toBe(204)
  const finalized = await harness.call(`/v1/skill-packages/uploads/${upload.id}/finalize`, {
    method: 'POST',
    token: 'token-a',
    headers: { 'idempotency-key': upload.id },
    body: { releaseNotes: 'first' }
  })
  expect(finalized.status).toBe(200)
  const { version } = (await finalized.json()) as { version: { packageId: string; versionId: string } }
  const shared = await harness.call(`/v1/skill-packages/${version.packageId}/shares`, {
    method: 'POST',
    token: 'token-a',
    headers: { 'idempotency-key': randomUUID() },
    body: {}
  })
  expect(shared.status).toBe(201)
  const { share } = (await shared.json()) as { share: { id: string; url: string } }
  return { sha256, version, share }
}

describe('sharing server', () => {
  it('round-trips a skill bundle from upload to anonymous download', async () => {
    const harness = await createHarness()
    const archive = skillArchive()
    const { sha256, version, share } = await publishAndShare(harness, archive)
    expect(version).toMatchObject({
      packageId: PACKAGE_ID,
      versionId: VERSION_ID,
      name: 'hello-bundle',
      packageDigest: BUNDLE_DIGEST,
      archiveSha256: sha256,
      compressedBytes: archive.length,
      releaseNotes: 'first'
    })
    expect(share.url).toBe(`${PUBLIC_URL}/skills/share/${share.id}`)

    const resolved = await harness.call(`/v1/skill-shares/${share.id}`)
    expect(resolved.status).toBe(200)
    expect(((await resolved.json()) as { share: { version: { versionId: string } } }).share.version.versionId).toBe(
      VERSION_ID
    )

    const granted = await harness.call(`/v1/skill-shares/${share.id}/download-grants`, {
      method: 'POST',
      body: { versionId: VERSION_ID, installTarget: 'local' }
    })
    expect(granted.status).toBe(200)
    const { grant } = (await granted.json()) as { grant: { url: string; expiresAt: string } }
    const download = await harness.app.request(grant.url)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('application/vnd.markov.skill+tar+gzip')
    expect(download.headers.get('content-length')).toBe(String(archive.length))
    const downloaded = Buffer.from(await download.arrayBuffer())
    expect(downloaded.equals(archive)).toBe(true)
    expect(createHash('sha256').update(downloaded).digest('hex')).toBe(sha256)
  })

  it('stops granting downloads once the share is revoked', async () => {
    const harness = await createHarness()
    const { share } = await publishAndShare(harness, skillArchive())
    const earlier = await harness.call(`/v1/skill-shares/${share.id}/download-grants`, { method: 'POST', body: {} })
    const { grant } = (await earlier.json()) as { grant: { url: string } }

    const revoked = await harness.call(`/v1/skill-shares/${share.id}`, { method: 'DELETE', token: 'token-a' })
    expect(revoked.status).toBe(204)

    const refused = await harness.call(`/v1/skill-shares/${share.id}/download-grants`, { method: 'POST', body: {} })
    expect(refused.status).toBe(404)
    expect(await refused.json()).toEqual({ code: 'skill_share_not_found' })
    expect((await harness.app.request(grant.url)).status).toBe(404)
  })

  it('replays an artifact create with the original edit token', async () => {
    const harness = await createHarness()
    const key = randomUUID()
    const body = { content: '<h1>Report</h1>', contentType: 'text/html', fileName: 'report.html' }
    const first = await harness.call('/v1/artifacts', {
      method: 'POST',
      token: 'token-a',
      headers: { 'idempotency-key': key },
      body
    })
    const replay = await harness.call('/v1/artifacts', {
      method: 'POST',
      token: 'token-a',
      headers: { 'idempotency-key': key },
      body
    })
    expect(first.status).toBe(201)
    expect(replay.status).toBe(201)
    const original = (await first.json()) as { editToken: string; artifact: { slug: string } }
    const replayed = (await replay.json()) as { editToken: string; artifact: { slug: string } }
    expect(replayed.editToken).toBe(original.editToken)
    expect(replayed.artifact.slug).toBe(original.artifact.slug)
  })

  it('refuses an artifact update with the wrong edit token', async () => {
    const harness = await createHarness()
    const created = await harness.call('/v1/artifacts', {
      method: 'POST',
      token: 'token-a',
      headers: { 'idempotency-key': randomUUID() },
      body: { content: '# Notes', contentType: 'text/markdown', fileName: 'notes.md' }
    })
    const { artifact } = (await created.json()) as { artifact: { slug: string } }
    const updated = await harness.call(`/v1/artifacts/${artifact.slug}`, {
      method: 'PUT',
      token: 'token-a',
      headers: { 'x-markov-edit-token': 'oet_not-the-real-token' },
      body: { content: '# Changed', contentType: 'text/markdown', fileName: 'notes.md' }
    })
    expect(updated.status).toBe(403)
    expect(await updated.json()).toEqual({ code: 'artifact_forbidden' })
  })

  it('serves user HTML in an opaque-origin sandbox', async () => {
    const harness = await createHarness()
    const html = '<!doctype html><script>document.title = "hi"</script>'
    const created = await harness.call('/v1/artifacts', {
      method: 'POST',
      token: 'token-a',
      headers: { 'idempotency-key': randomUUID() },
      body: { content: html, contentType: 'text/html', fileName: 'page.html' }
    })
    const { shareUrl } = (await created.json()) as { shareUrl: string }
    const page = await harness.app.request(`${shareUrl}?embed=1`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toBe(
      'sandbox allow-scripts allow-popups allow-forms allow-modals allow-downloads'
    )
    expect(await page.text()).toBe(html)
  })
})

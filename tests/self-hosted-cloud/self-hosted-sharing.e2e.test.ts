import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
// The real desktop sharing modules: this test fails if they and the self-hosted sharing server drift apart.
import { ArtifactCloudService } from '../../src/main/artifacts/artifact-cloud-service'
import { createSkillBundleArchive } from '../../src/main/skills/skill-bundle-creation'
import { extractSkillBundleArchive } from '../../src/main/skills/skill-bundle-extraction'
import { SkillCloudService } from '../../src/main/skills/skill-cloud-service'
import { downloadSkillPackageGrant } from '../../src/main/skills/skill-package-download'
import { parseSkillShareId } from '../../src/shared/skill-share-link'
import type { MarkovCloudAuthConfig } from '../../src/main/markov-profiles/profile-cloud-auth-config'
import { signInDesktop, startTestStack } from './self-hosted-cloud-fixture'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  shell: { openExternal: vi.fn(async () => undefined) }
}))

function ok<T>(operation: { status: 'ok'; value: T } | { status: string }): T {
  if (!('value' in operation)) {
    throw new Error(`expected an ok result, got ${operation.status}`)
  }
  return operation.value
}

describe('self-hosted sharing, driven by the real desktop sharing modules', () => {
  let started: Awaited<ReturnType<typeof startTestStack>>
  let config: MarkovCloudAuthConfig
  let sharingUrl: string
  const temporaryDirectories: string[] = []

  function temporaryDirectory(prefix: string): string {
    const directory = mkdtempSync(join(tmpdir(), prefix))
    temporaryDirectories.push(directory)
    return directory
  }

  beforeAll(async () => {
    started = await startTestStack({ sharing: true })
    config = started.config
    sharingUrl = started.stack.sharingUrl!
  })

  afterAll(async () => {
    await started?.stop()
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('publishes a skill bundle, installs it from the share link without sign-in, and revokes it', async () => {
    const session = await signInDesktop(config, 'sharing-profile')
    const owner = { apiUrl: sharingUrl, authToken: session.accessToken }
    const anonymous = { apiUrl: sharingUrl }

    // 1. Package a skill exactly as the desktop's Share dialog does.
    const sourceRoot = temporaryDirectory('self-hosted-skill-source-')
    const skillDirectory = join(sourceRoot, 'e2e-skill')
    mkdirSync(skillDirectory)
    const skillText =
      '---\nname: e2e-skill\ndescription: Says hello from the end-to-end test.\n---\n\nSay hello.\n'
    writeFileSync(join(skillDirectory, 'SKILL.md'), skillText)
    const packageId = randomUUID()
    const versionId = randomUUID()
    const bundle = await createSkillBundleArchive({
      sources: [{ sourceDirectory: skillDirectory }],
      archivePath: join(temporaryDirectory('self-hosted-skill-archive-'), 'bundle.tar.gz'),
      packageId,
      versionId,
      bundleName: 'e2e-bundle',
      description: 'End-to-end bundle'
    })

    // 2. Upload, finalize and share through the desktop's skill cloud client.
    const skills = new SkillCloudService(temporaryDirectory('self-hosted-skill-userdata-'))
    const published = ok(
      await skills.publish({
        ...owner,
        archivePath: bundle.archivePath,
        archiveSha256: bundle.archiveSha256,
        compressedBytes: bundle.compressedBytes,
        packageId,
        releaseNotes: 'First version'
      })
    )
    expect(published.version).toMatchObject({
      packageId,
      versionId,
      name: 'e2e-bundle',
      archiveSha256: bundle.archiveSha256,
      compressedBytes: bundle.compressedBytes
    })
    const shareId = parseSkillShareId(published.share.url)
    expect(shareId).toBe(published.share.id)
    expect(ok(await skills.findOwnedPackageId('e2e-bundle', owner))).toBe(packageId)

    // The share link opens a page in a browser that hands off to the app.
    const landing = await fetch(published.share.url)
    expect(landing.status).toBe(200)
    expect(await landing.text()).toContain(`markov://skills/share/${shareId}`)

    // 3. A recipient with only the link resolves it, gets a grant and downloads the verified archive.
    const resolved = ok(await skills.resolveShare(shareId!, anonymous))
    expect(resolved.version.versionId).toBe(versionId)
    const grant = ok(
      await skills.createDownloadGrant(shareId!, {
        ...anonymous,
        versionId,
        installTarget: 'local'
      })
    )
    const downloaded = await downloadSkillPackageGrant({
      url: grant.grant.url,
      expiresAt: grant.grant.expiresAt,
      expectedArchiveSha256: grant.version.archiveSha256,
      expectedCompressedBytes: grant.version.compressedBytes,
      temporaryRoot: temporaryDirectory('self-hosted-skill-download-'),
      allowedOrigins: [sharingUrl],
      requireHttps: false
    })
    try {
      const destination = join(temporaryDirectory('self-hosted-skill-install-'), 'bundle')
      const extracted = await extractSkillBundleArchive({
        archivePath: downloaded.archivePath,
        destinationDirectory: destination,
        expectedArchiveSha256: grant.version.archiveSha256,
        expectedBundleDigest: grant.version.packageDigest,
        expectedPackageId: packageId,
        expectedVersionId: versionId
      })
      expect(readFileSync(join(extracted.skillsDirectory, 'e2e-skill', 'SKILL.md'), 'utf8')).toBe(
        skillText
      )
    } finally {
      await downloaded.cleanup()
    }

    // 4. The owner sees the package with its share; revoking the share stops new installs.
    const details = ok(await skills.getPackage(packageId, owner))
    expect(details.canManage).toBe(true)
    expect(details.versions.map((version) => version.versionId)).toEqual([versionId])
    ok(await skills.revokeShare(shareId!, owner))
    await expect(skills.resolveShare(shareId!, anonymous)).rejects.toMatchObject({
      statusCode: 404
    })
    await expect(
      skills.createDownloadGrant(shareId!, { ...anonymous, versionId, installTarget: 'local' })
    ).rejects.toMatchObject({ statusCode: 404 })
    ok(await skills.deletePackage(packageId, owner))
  })

  it('publishes an artifact to a public link, updates it, and deletes it', async () => {
    const session = await signInDesktop(config, 'artifact-profile')
    const artifacts = new ArtifactCloudService(
      temporaryDirectory('self-hosted-artifact-userdata-'),
      () => true
    )
    const auth = { apiUrl: sharingUrl, authToken: session.accessToken }

    const shared = ok(
      await artifacts.share({
        ...auth,
        sourceKey: 'e2e-report',
        content: '# Weekly report\n\nAll green.',
        contentType: 'text/markdown',
        fileName: 'report.md',
        title: 'Weekly report'
      })
    )
    expect(shared.artifact.title).toBe('Weekly report')

    // Anyone with the link sees the rendered page, isolated from the server's own origin.
    const page = await fetch(shared.shareUrl)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-security-policy')).toContain('sandbox')
    expect(page.headers.get('content-security-policy')).not.toContain('allow-same-origin')
    expect(await page.text()).toContain('All green.')

    const listed = ok(await artifacts.list(auth))
    expect(listed.artifacts.map((item) => item.artifact.slug)).toContain(shared.artifact.slug)

    ok(await artifacts.delete(shared.artifact.slug, auth))
    expect((await fetch(shared.shareUrl)).status).toBe(404)
  })
})

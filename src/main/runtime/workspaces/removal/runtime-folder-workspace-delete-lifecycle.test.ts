import { describe, expect, it, vi } from 'vitest'

// Fragments stay side-effect ordered: mocks, then lifecycle, then fixtures.
await import('../../markov-runtime-tests/runtime-test-module-registration.spec')
const { MarkovRuntimeService } = await import('../../markov-runtime')
await import('../../markov-runtime-tests/markov-runtime-test-lifecycle.spec')
const { createFolderWorkspaceRuntimeStore, makeFolderWorkspace } =
  await import('../../markov-runtime-tests/markov-runtime-test-fixtures.spec')

describe('deleting a folder workspace', () => {
  it('announces the removal to worktree lifecycle listeners under its folder key', async () => {
    const folderWorkspace = makeFolderWorkspace({ folderPath: '/tmp/folder-ws' })
    const runtime = new MarkovRuntimeService({
      ...createFolderWorkspaceRuntimeStore(folderWorkspace),
      removeFolderWorkspace: () => true
    })
    const listener = vi.fn()
    runtime.onWorktreeLifecycle(listener)
    await expect(runtime.deleteFolderWorkspace(folderWorkspace.id)).resolves.toEqual({
      deleted: true
    })
    expect(listener).toHaveBeenCalledWith({
      kind: 'removed',
      worktreeId: `folder:${folderWorkspace.id}`,
      path: '/tmp/folder-ws'
    })
  })
})

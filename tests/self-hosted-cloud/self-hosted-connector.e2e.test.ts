import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
// The real desktop connector client: this test fails if it and the self-hosted connector drift apart.
import { ConnectorCloud } from '../../src/main/connector-cloud/connector-cloud'
import { requestConnector } from '../../src/main/connector-cloud/connector-cloud-request'
import { postConnectorReply } from '../../src/main/connector-cloud/connector-replies'
import { ConnectorAccountTransport } from '../../src/main/connector-cloud/connector-transport'
import {
  fakeMachine,
  fakeSeam
} from '../../src/main/connector-cloud/fake-connector-seam.test-fixture'
import type { ConversationEvent } from '../../src/main/external-conversations/external-conversation-events'
import type { MarkovCloudAuthConfig } from '../../src/main/markov-profiles/profile-cloud-auth-config'
import { E2E_EMAIL, signInDesktop, startTestStack, waitFor } from './self-hosted-cloud-fixture'

vi.mock('electron', () => ({
  app: { isPackaged: false },
  shell: { openExternal: vi.fn(async () => undefined) }
}))

const ConnectorTokenResponse = z.object({
  connectorToken: z.string().min(1),
  expiresAt: z.number().int().positive()
})

const ThreadSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      actions: z
        .object({
          kind: z.string(),
          buttons: z.array(z.object({ label: z.string(), value: z.string() }))
        })
        .optional()
    })
  )
})
type PostedMessage = z.infer<typeof ThreadSchema>['messages'][number]
const StartInputSchema = z.object({ agent: z.string(), prompt: z.string() })

const PROJECT = {
  placeId: Buffer.from(JSON.stringify(['folder', 'e2e-group'])).toString('base64url'),
  name: 'my-repo',
  kind: 'folder' as const,
  where: { kind: 'local' as const }
}
const OWNER = { id: 'U-OWNER', email: E2E_EMAIL }
const STRANGER = { id: 'U-STRANGER', email: 'someone.else@example.com' }

describe('self-hosted connector, driven by the real desktop connector client', () => {
  let started: Awaited<ReturnType<typeof startTestStack>>
  let config: MarkovCloudAuthConfig
  let connectorUrl: string
  const temporaryDirectories: string[] = []

  beforeAll(async () => {
    started = await startTestStack({ connector: true })
    config = started.config
    connectorUrl = started.stack.connectorUrl!
  })

  afterAll(async () => {
    await started?.stop()
    for (const directory of temporaryDirectories) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  async function chat(path: 'messages' | 'actions', body: unknown): Promise<void> {
    const response = await fetch(`${connectorUrl}/v1/dev/fake-chat/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    expect(response.status).toBe(204)
  }

  async function thread(id: string): Promise<PostedMessage[]> {
    const response = await fetch(`${connectorUrl}/v1/dev/fake-chat/threads/${id}`)
    return ThreadSchema.parse(await response.json()).messages
  }

  it('starts an agent from a chat thread, relays prompts, replies and turn ends, and steers it', async () => {
    // 1. The desktop signs in and holds the connector poll with tokens from the accounts server.
    const session = await signInDesktop(config, 'connector-profile')
    const mintFor = (machineId: string) => () =>
      requestConnector(
        {
          fetchImpl: fetch,
          url: config.connectorTokenEndpoint,
          body: { machineId },
          token: session.accessToken
        },
        ConnectorTokenResponse
      )
    const desktop = fakeSeam()
    const emit = (event: ConversationEvent) => desktop.emit(event)
    desktop.calls.answer.mockImplementation(async () => ({ outcome: 'accepted' as const }))
    const userDataPath = mkdtempSync(join(tmpdir(), 'self-hosted-connector-desktop-'))
    temporaryDirectories.push(userDataPath)
    const cloud = new ConnectorCloud({
      userDataPath,
      origin: connectorUrl,
      machine: fakeMachine(() => desktop, [PROJECT]),
      account: () => session.cloud.userId,
      isFenced: () => false,
      mintFor: () => mintFor('e2e-machine-1')
    })
    cloud.connect()

    try {
      // The chat finds the desktop once its hello and poll have reached the connector.
      let probe = 0
      await waitFor(async () => {
        const id = `probe-${probe++}`
        await chat('messages', { thread: id, user: OWNER, text: '' })
        return (await thread(id))[0]?.text.startsWith('Tell me what to do')
      }, 'the desktop to come online')

      // 2. A mention naming the project starts Claude there.
      await chat('messages', { thread: 't1', user: OWNER, text: 'my-repo fix the login test' })
      expect((await thread('t1'))[0]?.text).toBe('Starting Claude in **my-repo** on box…')
      const start = await waitFor(
        () => desktop.calls.start.mock.calls[0],
        'the desktop to start the agent'
      )
      const key = { source: 'slack' as const, externalId: 'fake:t1' }
      expect(start[1]).toEqual(key)
      // The fake seam's mock types fewer arguments than the client passes.
      const input = StartInputSchema.parse(start.at(3))
      expect(input.agent).toBe('claude')
      expect(input.prompt).toContain('fix the login test')

      // 3. An approval prompt shows as buttons; only the requester's click answers it on the desktop.
      const turnId = 1_800_000_000_000
      const pane = { conversation: key, worktreeId: 'wt-1', paneKey: 'pane-1' }
      emit({ ...pane, kind: 'linked', agent: 'claude' })
      emit({ ...pane, kind: 'turn-started', at: turnId })
      emit({
        ...pane,
        kind: 'prompt',
        prompt: {
          kind: 'approval',
          promptId: 'p1',
          tool: 'Bash',
          summary: 'npm test',
          options: [
            { id: 'allow', label: 'Allow' },
            { id: 'deny', label: 'Deny' }
          ]
        }
      })
      const promptMessage = await waitFor(
        async () => (await thread('t1')).find((message) => message.actions?.kind === 'answer'),
        'the prompt to reach the chat'
      )
      expect(promptMessage.text).toBe('**Claude wants to use Bash**\nnpm test')
      const allow = promptMessage.actions!.buttons[0]!
      expect(allow.label).toBe('Allow')
      await chat('actions', {
        thread: 't1',
        user: STRANGER,
        kind: 'answer',
        value: allow.value,
        messageId: promptMessage.id
      })
      await chat('actions', {
        thread: 't1',
        user: OWNER,
        kind: 'answer',
        value: allow.value,
        messageId: promptMessage.id
      })
      const answer = await waitFor(
        () => desktop.calls.answer.mock.calls[0],
        'the answer to reach the desktop'
      )
      expect(answer.slice(1)).toEqual([key, 'p1', 'allow'])
      expect(desktop.calls.answer).toHaveBeenCalledTimes(1)

      // 4. The agent replies mid-turn through the desktop's reply path; a retried reply posts once.
      const transport = new ConnectorAccountTransport(connectorUrl, mintFor('e2e-machine-1'))
      const replyId = randomUUID()
      const replyBody = {
        replyId,
        conversation: key,
        turnId,
        text: 'Running the tests now.'
      }
      const signal = new AbortController().signal
      const reply = await postConnectorReply(transport, replyBody, signal, Math.random)
      expect(reply).toMatchObject({ ok: true, value: { status: 'posted' } })
      expect(await postConnectorReply(transport, replyBody, signal, Math.random)).toEqual(reply)
      expect(
        (await thread('t1')).filter((message) => message.text === 'Running the tests now.')
      ).toHaveLength(1)

      // Another machine of the same account does not own this thread.
      const otherMachine = new ConnectorAccountTransport(connectorUrl, mintFor('e2e-machine-2'))
      const refused = await postConnectorReply(
        otherMachine,
        { ...replyBody, replyId: randomUUID() },
        signal,
        Math.random
      )
      expect(refused).toMatchObject({ ok: false, status: 403, error: 'not_this_hosts_thread' })

      // 5. The turn ends: the final answer is posted and the open prompt stops waiting.
      emit({
        ...pane,
        kind: 'turn-ended',
        turnId,
        stopReason: 'success',
        lastAssistantMessage: 'Fixed the login test.',
        at: turnId + 5_000
      })
      await waitFor(
        async () =>
          (await thread('t1')).some((message) => message.text === 'Fixed the login test.'),
        'the turn end to reach the chat'
      )

      // 6. Thread replies steer the agent: text becomes a follow-up, "stop" cancels.
      await chat('messages', {
        thread: 't1',
        user: STRANGER,
        text: 'do something else',
        addressed: false
      })
      await chat('messages', {
        thread: 't1',
        user: OWNER,
        text: 'also update the docs',
        addressed: false
      })
      const send = await waitFor(
        () => desktop.calls.send.mock.calls[0],
        'the follow-up to reach the desktop'
      )
      expect(send[1]).toEqual(key)
      expect(send.at(3)).toBe('also update the docs')
      expect(desktop.calls.send).toHaveBeenCalledTimes(1)
      await chat('messages', { thread: 't1', user: OWNER, text: 'stop', addressed: false })
      const cancel = await waitFor(
        () => desktop.calls.cancel.mock.calls[0],
        'the cancel to reach the desktop'
      )
      expect(cancel[1]).toEqual(key)
    } finally {
      cloud.signOutStarted()
    }
  })
})

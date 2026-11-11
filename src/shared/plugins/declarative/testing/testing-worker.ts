import { PLUGIN_V1_EVENT_ALIASES } from '../../contributions/plugin-event-contribution'
import { PLUGIN_EVENT_PAYLOAD_SCHEMAS } from '../../events/plugin-events'
import { isPluginHookName } from '../../contributions/plugin-hook-contribution'
import { PLUGIN_HOOK_SPECS } from '../../events/plugin-hook-payloads'
import { runPluginHookChain } from '../../workers/plugin-hook-chain'
import { runPluginWorkerHookHandlers } from '../../workers/plugin-worker-hooks'
import type { PluginWorkerPanelPost } from '../../workers/plugin-panel-bridge-protocol'
import {
  createPluginWorkerApiTables,
  createPluginWorkerMarkovApi
} from '../../workers/plugin-worker-markov-api'
import type { MockHost } from './testing-host'
import { hostError } from './testing-host-error'

/** A worker `main` module: `activate` is its default export; `deactivate` may sit beside it. */
export type WorkerModule = {
  default?: unknown
  deactivate?: unknown
  [name: string]: unknown
}

export type MountWorkerOptions = {
  host: MockHost
  /** Events the worker receives, as listed in `contributes.events`; defaults to the manifest's. */
  events: readonly string[]
  /** Command ids it may register, as listed in `contributes.commands`; null skips the check. */
  commands: readonly string[] | null
  /** Hooks Markov runs through it, as listed in `contributes.hooks` (a name, or `{ event, onError }`);
   *  defaults to the manifest's. */
  hooks: readonly (string | { event: string; onError?: 'pass' | 'deny' })[]
}

/** What a hook chain of this one worker decided: Markov goes on with `event`, or it was refused. */
export type HookDecision = { kind: 'continue'; event: unknown } | { kind: 'deny'; reason: string }

/** The caller a test's `request` names when it does not pass one. */
const TEST_PANEL = { id: 'test-panel', surface: 'panel', contributionId: 'panel' } as const

function isEventName(name: string): name is keyof typeof PLUGIN_EVENT_PAYLOAD_SCHEMAS {
  return Object.hasOwn(PLUGIN_EVENT_PAYLOAD_SCHEMAS, name)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Runs a worker's `activate(markov)` with the same `markov` object Markov builds, over the mock host:
 * events arrive only when listed, payloads are checked against Markov's schemas, and commands and
 * panel requests run with an abort signal as Markov runs them.
 */
export async function mountWorker(module: WorkerModule, options: MountWorkerOptions) {
  const { host } = options
  const subscribed = new Set(options.events)
  const hookEntries = options.hooks.map((hook) =>
    typeof hook === 'string' ? { event: hook } : hook
  )
  const hooked = new Set(hookEntries.map((hook) => hook.event))
  const failsClosed = new Set(
    hookEntries.filter((hook) => hook.onError === 'deny').map((hook) => hook.event)
  )
  const tables = createPluginWorkerApiTables()
  const logs: string[] = []
  const posts: PluginWorkerPanelPost[] = []
  let active = true

  const activate = module.default
  if (typeof activate !== 'function') {
    throw new TypeError(
      typeof module.activate === 'function'
        ? 'mountWorker: the module exports activate by name, but Markov calls the default export: write `export default function activate(markov)`'
        : 'mountWorker: the module has no default-exported activate(markov) function'
    )
  }
  const deactivateExport = module.deactivate
  if (deactivateExport !== undefined && typeof deactivateExport !== 'function') {
    throw new TypeError('mountWorker: the module exports a deactivate that is not a function')
  }

  const markov = createPluginWorkerMarkovApi({
    tables,
    hostCall: (method, params) => host.worker.call(method, params),
    postToPanels: (post) => void posts.push(post),
    log: (message) => void logs.push(message),
    grantedCapabilities: host.capabilities
  })
  // A panel's storage or settings write reaches the worker's `onDidChange`, as in Markov.
  const stopListening = host.onDataChange((area, key) => {
    for (const listener of tables.dataListeners[area]) {
      listener({ key })
    }
  })

  await activate(markov)
  const undeclared = options.commands
    ? [...tables.commands.keys()].find((id) => !options.commands?.includes(id))
    : undefined
  if (undeclared !== undefined) {
    throw new Error(`registered undeclared command ${undeclared}: list it in contributes.commands`)
  }

  async function answer(name: string, input: unknown, panelId?: string): Promise<unknown> {
    const handler = tables.panelRequests.get(name)
    if (!handler) {
      throw hostError('unknown_method', `no panel handler named ${name}`)
    }
    const panel = { ...TEST_PANEL, contributionId: panelId ?? TEST_PANEL.contributionId }
    return handler(input, { panel, signal: new AbortController().signal })
  }
  // Why no idle() here: the panel's own call is still pending on the host while this answers.
  const stopAnswering = host.routeRequests((name, input) => answer(name, input))

  return {
    host,
    /** What the worker passed to `markov.log`, in order. */
    logs,
    /** What the worker sent with `markov.panels.post`, in order. */
    posts,
    /** Calls Markov would refuse, even ones the worker caught. */
    get refusals() {
      return host.refusals
    },
    /** Delivers an event as Markov would, and resolves once every handler has finished. */
    async emit(event: string, payload: unknown): Promise<void> {
      if (!isEventName(event)) {
        throw new Error(`emit: "${event}" is not an event Markov sends to workers`)
      }
      if (!subscribed.has(event)) {
        throw new Error(`emit: "${event}" never arrives: it is not in contributes.events`)
      }
      const parsed = PLUGIN_EVENT_PAYLOAD_SCHEMAS[event].safeParse(payload)
      if (!parsed.success) {
        throw new TypeError(
          `emit: that ${event} payload is not one Markov sends: ${parsed.error.issues[0]?.message ?? ''}`
        )
      }
      const handlers = tables.events.get(PLUGIN_V1_EVENT_ALIASES.get(event) ?? event) ?? []
      await Promise.all([...handlers].map(async (handler) => handler(parsed.data)))
      await host.idle()
    },
    hooks: {
      /** Runs a hook as Markov would, with this worker as the only plugin: the same deadline, the
       *  same fields `next` may change, and the same checks on what it returns. */
      async fire(event: string, payload: unknown): Promise<HookDecision> {
        if (!isPluginHookName(event)) {
          throw new Error(`hooks.fire: "${event}" is not a hook Markov runs`)
        }
        if (!hooked.has(event)) {
          throw new Error(`hooks.fire: "${event}" never runs: it is not in contributes.hooks`)
        }
        const parsed = PLUGIN_HOOK_SPECS[event].payload.safeParse(payload)
        if (!parsed.success) {
          throw new TypeError(
            `hooks.fire: that ${event} event is not one Markov sends: ${parsed.error.issues[0]?.message ?? ''}`
          )
        }
        const outcome = await runPluginHookChain({
          event,
          payload: parsed.data,
          participants: ['worker'],
          invoke: (_plugin, current) =>
            runPluginWorkerHookHandlers(tables.hooks.get(event) ?? [], current),
          log: (_plugin, line) => void logs.push(line),
          now: () => performance.now(),
          failsClosed: () => failsClosed.has(event)
        })
        await host.idle()
        return outcome.kind === 'deny'
          ? { kind: 'deny', reason: outcome.reason }
          : { kind: 'continue', event: outcome.payload }
      }
    },
    /** Runs a registered command, as the palette or `markov plugin` would. */
    async command(commandId: string, args?: unknown): Promise<unknown> {
      const handler = tables.commands.get(commandId)
      if (!handler) {
        throw new Error(`command: the worker registered no "${commandId}"`)
      }
      const result = await handler(args, { signal: new AbortController().signal })
      await host.idle()
      return result
    },
    /** A panel's `plugin.request(name, input)`, answered by the worker's `markov.panels.handle`. */
    async request(
      name: string,
      input?: unknown,
      caller: { panel?: string } = {}
    ): Promise<unknown> {
      const output = await answer(name, input, caller.panel)
      await host.idle()
      return output
    },
    /** Runs the module's `deactivate`, as Markov does before stopping the worker. */
    async deactivate(): Promise<void> {
      if (!active) {
        return
      }
      active = false
      stopListening()
      stopAnswering()
      tables.events.clear()
      tables.hooks.clear()
      tables.commands.clear()
      tables.panelRequests.clear()
      try {
        await (typeof deactivateExport === 'function' ? deactivateExport() : undefined)
      } catch (error) {
        throw new Error(`deactivate threw: ${messageOf(error)}`, { cause: error })
      }
      await host.idle()
    }
  }
}

export type TestWorker = Awaited<ReturnType<typeof mountWorker>>

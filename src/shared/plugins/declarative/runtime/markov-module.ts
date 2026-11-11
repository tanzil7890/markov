/**
 * Entry of the guest `markov` module (also `markov/jsx-runtime` and `markov/jsx-dev-runtime`). Bundled
 * to resources/plugins/declarative/markov-runtime.mjs by config/scripts/build-plugin-declarative-runtime.mjs.
 * Markov's host page installs the runtime, imports the panel module and boots it.
 */
import { installPluginSourceMapHook } from './declarative-source-maps'
import { read, resetAtoms } from './declarative-atoms'
import type { MarkovComponent } from './declarative-elements'
import {
  createMarkovDeclarativeRuntime,
  type MarkovBridge,
  type MarkovColorScheme,
  type MarkovDeclarativeRuntime,
  type MarkovRuntimeOptions
} from './declarative-renderer'
import { createMarkovSdk } from './declarative-sdk'
import { createMarkovDataSdk } from './declarative-data-sdk'

export { atom, derived, read, set, update } from './declarative-atoms'
export { Fragment, h, jsx, jsx as jsxs, jsx as jsxDEV } from './declarative-elements'

let runtime: MarkovDeclarativeRuntime | null = null
let pendingMount: MarkovComponent | null = null

function isMarkovBridge(value: unknown): value is MarkovBridge {
  return (
    typeof value === 'object' && value !== null && 'on' in value && typeof value.on === 'function'
  )
}

function globalBridge(): MarkovBridge | null {
  const scope: object = globalThis
  const candidate: unknown = 'markov' in scope ? scope.markov : undefined
  return isMarkovBridge(candidate) ? candidate : null
}

function documentColorScheme(): MarkovColorScheme | undefined {
  const root = typeof document === 'undefined' ? null : document.documentElement
  if (!root) {
    return undefined
  }
  return root.classList.contains('light') ? 'light' : 'dark'
}

/** Starts the runtime; `bridge` defaults to the preload's `window.markov`. Replaces any earlier one. */
export function installMarkovDeclarativeRuntime(
  options: Pick<MarkovRuntimeOptions, 'post'> & Partial<MarkovRuntimeOptions>
): MarkovDeclarativeRuntime {
  runtime?.dispose()
  resetAtoms()
  // Before the panel module loads, so its prelude registers its source map.
  installPluginSourceMapHook()
  const installed = createMarkovDeclarativeRuntime({
    bridge: globalBridge(),
    colorScheme: documentColorScheme(),
    ...options
  })
  runtime = installed
  // Cleanup runs when the panel reloads or navigates away; see the lifetime contract.
  if (typeof addEventListener === 'function') {
    addEventListener('pagehide', () => installed.dispose(), { once: true })
  }
  const queued = pendingMount
  pendingMount = null
  if (queued) {
    installed.mount(queued)
  }
  return installed
}

/** Renders `component` as the panel. A module's default export is mounted the same way. */
export function mount(component: MarkovComponent): void {
  if (runtime) {
    runtime.mount(component)
  } else {
    pendingMount = component
  }
}

const sdk = createMarkovSdk({
  bridge: () => runtime?.bridge ?? globalBridge(),
  theme: () =>
    runtime ? read(runtime.themeAtom) : { colorScheme: documentColorScheme() ?? 'dark' }
})

export const { host, api, env, shell, files, on, ui } = sdk
export const { plugin, storage, settings, secrets } = createMarkovDataSdk(
  () => runtime?.bridge ?? globalBridge()
)

// Catalog tags: JSX `<Stack>` compiles to a reference, so authors import these by name.
export const Stack = 'Stack'
export const Row = 'Row'
export const Text = 'Text'
export const Heading = 'Heading'
export const Button = 'Button'
export const IconButton = 'IconButton'
export const Badge = 'Badge'
export const Card = 'Card'
export const List = 'List'
export const ListItem = 'ListItem'
export const Input = 'Input'
export const Switch = 'Switch'
export const Select = 'Select'
export const Separator = 'Separator'
export const Progress = 'Progress'
export const Spinner = 'Spinner'
export const EmptyState = 'EmptyState'
export const Link = 'Link'
export const Code = 'Code'
// Catalog 2 (Markov 1.4.247).
export const Textarea = 'Textarea'
export const Checkbox = 'Checkbox'
export const RadioGroup = 'RadioGroup'
export const Slider = 'Slider'
export const Field = 'Field'
export const Tabs = 'Tabs'
export const Tab = 'Tab'
export const Collapsible = 'Collapsible'
export const Toolbar = 'Toolbar'
export const Grid = 'Grid'
export const Table = 'Table'
export const Tree = 'Tree'
export const Markdown = 'Markdown'
export const CodeView = 'CodeView'
export const Image = 'Image'
export const KeyValue = 'KeyValue'
export const Callout = 'Callout'
export const Skeleton = 'Skeleton'
export const RelativeTime = 'RelativeTime'
// Catalog 4 (Markov 1.4.248).
export const Box = 'Box'

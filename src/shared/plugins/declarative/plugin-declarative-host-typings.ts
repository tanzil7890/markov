import {
  renderPluginEventPayloadMembers,
  renderPluginHostMethodMembers
} from '../authoring/plugin-host-typings'

/** Markers around the generated region of resources/plugins/declarative/markov.d.ts. */
export const MARKOV_HOST_TYPINGS_BEGIN = '  // <generated: host methods, from plugin-host-api.ts>'
export const MARKOV_HOST_TYPINGS_END = '  // </generated>'

/** The panel's host methods as `HostMethods`, from the same generator as `.markov/types/markov-host`. */
export function renderMarkovHostTypings(): string {
  return [
    MARKOV_HOST_TYPINGS_BEGIN,
    '  export type HostMethods = {',
    `${renderPluginHostMethodMembers('    ', { surface: 'panel', compact: true }).trimEnd()}`,
    '  }',
    '  /** Workspace and agent events `on(event)` delivers, with the read capability of their domain. */',
    '  export type PluginEvents = {',
    `${renderPluginEventPayloadMembers('    ').trimEnd()}`,
    '  }',
    MARKOV_HOST_TYPINGS_END
  ].join('\n')
}

/** `file` with its generated region replaced; throws when the markers are missing. */
export function spliceMarkovHostTypings(file: string): string {
  const begin = file.indexOf(MARKOV_HOST_TYPINGS_BEGIN)
  const end = file.indexOf(MARKOV_HOST_TYPINGS_END, begin)
  if (begin === -1 || end === -1) {
    throw new Error('markov.d.ts lacks the generated host-method markers')
  }
  return (
    file.slice(0, begin) +
    renderMarkovHostTypings() +
    file.slice(end + MARKOV_HOST_TYPINGS_END.length)
  )
}

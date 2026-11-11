/** JSX element factory for the guest `markov` module. Elements are plain data until rendered. */

export const MARKOV_ELEMENT = Symbol.for('markov.declarative.element')
export const Fragment = Symbol.for('markov.declarative.fragment')

export type MarkovProps = Record<string, unknown>
/** Loosely typed on purpose: author-facing prop types live in the published `markov` typings. */
export type MarkovComponent = (props: MarkovProps) => unknown
export type MarkovElementType = string | typeof Fragment | MarkovComponent

export type MarkovElement = {
  readonly $$typeof: typeof MARKOV_ELEMENT
  readonly type: MarkovElementType
  readonly props: MarkovProps
  readonly key: string | undefined
}

export function isMarkovElement(value: unknown): value is MarkovElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    value.$$typeof === MARKOV_ELEMENT
  )
}

function createElement(type: MarkovElementType, props: MarkovProps, key: unknown): MarkovElement {
  return Object.freeze({
    $$typeof: MARKOV_ELEMENT,
    type,
    props,
    key: key === undefined || key === null ? undefined : String(key)
  })
}

/** Automatic runtime (`jsx`/`jsxs`/`jsxDEV`): children arrive inside `props`. */
export function jsx(
  type: MarkovElementType,
  props: MarkovProps | null,
  key?: unknown
): MarkovElement {
  const { key: propKey, ...rest } = props ?? {}
  return createElement(type, rest, key ?? propKey)
}

/** Classic runtime (`h`, `jsxFactory`): children arrive as trailing arguments. */
export function h(
  type: MarkovElementType,
  props: MarkovProps | null,
  ...children: unknown[]
): MarkovElement {
  const { key, ...rest } = props ?? {}
  if (children.length > 0) {
    rest.children = children.length === 1 ? children[0] : children
  }
  return createElement(type, rest, key)
}

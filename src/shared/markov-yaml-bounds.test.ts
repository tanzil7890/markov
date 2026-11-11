import { afterEach, describe, expect, it, vi } from 'vitest'
import { Document, stringify } from 'yaml'
import {
  MAX_MARKOV_YAML_BYTES,
  MAX_MARKOV_YAML_COLLECTION_ENTRIES,
  MAX_MARKOV_YAML_FIELD_BYTES,
  MAX_MARKOV_YAML_FIELD_CODE_UNITS
} from './markov-yaml-file-limit'
import { parseMarkovYaml } from './markov-yaml'

afterEach(() => vi.restoreAllMocks())

describe('markov.yaml parse bounds', () => {
  it('admits the exact UTF-8 input boundary and rejects +1 before conversion', () => {
    const toJS = vi.spyOn(Document.prototype, 'toJS')
    const prefix = 'scripts:\n  setup: pnpm install\n#'
    const exact = prefix + ' '.repeat(MAX_MARKOV_YAML_BYTES - prefix.length)
    expect(parseMarkovYaml(exact)).toMatchObject({ scripts: { setup: 'pnpm install' } })
    expect(toJS).toHaveBeenCalledOnce()
    toJS.mockClear()
    expect(parseMarkovYaml(`${exact} `)).toBeNull()
    expect(toJS).not.toHaveBeenCalled()
  })

  it('rejects a multibyte input over the byte cap before conversion', () => {
    const toJS = vi.spyOn(Document.prototype, 'toJS')
    expect(parseMarkovYaml('é'.repeat(MAX_MARKOV_YAML_BYTES / 2 + 1))).toBeNull()
    expect(toJS).not.toHaveBeenCalled()
  })

  it('preserves exact-size fields and drops a field at +1 code unit', () => {
    const exact = 'x'.repeat(MAX_MARKOV_YAML_FIELD_CODE_UNITS)
    expect(parseMarkovYaml(stringify({ scripts: { setup: exact } }))).toMatchObject({
      scripts: { setup: exact }
    })
    expect(parseMarkovYaml(stringify({ scripts: { setup: `${exact}x` } }))).toBeNull()
    const exactUtf8 = 'é'.repeat(MAX_MARKOV_YAML_FIELD_BYTES / 2)
    expect(parseMarkovYaml(stringify({ scripts: { setup: exactUtf8 } }))).toMatchObject({
      scripts: { setup: exactUtf8 }
    })
    expect(parseMarkovYaml(stringify({ scripts: { setup: `${exactUtf8}é` } }))).toBeNull()
  })

  it('admits the exact collection boundary and rejects +1 entries', () => {
    const tabs = Array.from({ length: MAX_MARKOV_YAML_COLLECTION_ENTRIES }, (_, index) => ({
      title: `tab-${index}`
    }))
    expect(parseMarkovYaml(stringify({ defaultTabs: tabs }))?.defaultTabs).toHaveLength(
      MAX_MARKOV_YAML_COLLECTION_ENTRIES
    )
    expect(parseMarkovYaml(stringify({ defaultTabs: [...tabs, { title: 'overflow' }] }))).toBeNull()
  })
})

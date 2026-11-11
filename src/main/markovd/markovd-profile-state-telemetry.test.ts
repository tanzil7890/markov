import { describe, expect, it } from 'vitest'
import {
  emitMarkovdProfileStateAuthoritySelected,
  formatMarkovdProfileStateAuthoritySelected,
  type MarkovdProfileStateAuthoritySelection
} from './markovd-profile-state-telemetry'

const selection: MarkovdProfileStateAuthoritySelection = {
  backend: 'sqlite',
  classification: 'json-only',
  authority_mode: 'sqlite-established',
  runtime: 'markovd',
  migrated: true
}

describe('markovd profile-state telemetry', () => {
  it('strips unexpected runtime fields before writing the record', () => {
    const selectionWithRuntimeFields = Object.assign({}, selection, {
      database_path: '/private/profile-state.db'
    })
    const line = formatMarkovdProfileStateAuthoritySelected(selectionWithRuntimeFields)
    expect(line).not.toContain('database_path')
  })

  it('never lets a failing sink block startup', () => {
    expect(() =>
      emitMarkovdProfileStateAuthoritySelected(selection, () => {
        throw new Error('closed stderr')
      })
    ).not.toThrow()
  })
})

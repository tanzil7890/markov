import { expect, it } from 'vitest'
import { migrateFloatingTerminalTriggerLocation } from './floating-terminal-trigger-location'

it('moves the old top-bar default to the sidebar once', () => {
  expect(
    migrateFloatingTerminalTriggerLocation({ floatingTerminalTriggerLocation: 'top-bar' })
  ).toBe('sidebar')
})

it('keeps a top-bar choice made after the move', () => {
  expect(
    migrateFloatingTerminalTriggerLocation({
      floatingTerminalTriggerLocation: 'top-bar',
      floatingTerminalTriggerMovedToSidebar: true
    })
  ).toBe('top-bar')
})

it('keeps other explicit locations', () => {
  expect(
    migrateFloatingTerminalTriggerLocation({ floatingTerminalTriggerLocation: 'status-bar' })
  ).toBe('status-bar')
})

it('falls back to the sidebar for missing or unknown values', () => {
  expect(migrateFloatingTerminalTriggerLocation(undefined)).toBe('sidebar')
  expect(migrateFloatingTerminalTriggerLocation({ floatingTerminalTriggerLocation: 'left' })).toBe(
    'sidebar'
  )
})

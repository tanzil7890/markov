/**
 * Agent browser input must reach its page without touching the user's keyboard focus (#20595).
 * Runs hidden; browser-agent-input-focus-isolation-native.spec.ts repeats it in a visible window.
 */

import { test } from './helpers/markov-app'
import {
  runAgentClicksScenario,
  runAgentCrossSiteFrameScenario,
  runAgentKeysScenario,
  runAgentShortcutsScenario
} from './helpers/browser-agent-focus-scenarios'
import { runAgentClickDuringUserCompositionScenario } from './helpers/browser-agent-composition-scenario'

test('agent keys and text reach the page without leaving the user’s terminal', async ({
  markovPage
}) => {
  test.setTimeout(120_000)
  await runAgentKeysScenario(markovPage)
})

test('agent clicks and presses reach the page without leaving the user’s terminal', async ({
  markovPage
}) => {
  test.setTimeout(120_000)
  await runAgentClicksScenario(markovPage)
})

test('agent shortcut keys stay in the page instead of running Markov shortcuts', async ({
  markovPage
}) => {
  test.setTimeout(120_000)
  await runAgentShortcutsScenario(markovPage)
})

test('agent keys and text reach a focused cross-site frame without moving the user’s focus', async ({
  markovPage
}) => {
  test.setTimeout(120_000)
  await runAgentCrossSiteFrameScenario(markovPage)
})

test('an agent click is refused while the user composes with an IME in the terminal', async ({
  markovPage
}) => {
  test.setTimeout(120_000)
  await runAgentClickDuringUserCompositionScenario(markovPage)
})

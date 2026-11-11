// Compose the Node-host runtime; paired desktop pages work even without a local browser engine.
import process from 'node:process'
import { getAppEnvironment } from '../../shared/app-environment'
import { resolveUserDataPath } from './markovd-app-paths'
import { prepareMarkovdCliLauncher } from './markovd-cli-launcher'
import { installMarkovdHostAdapters, runMarkovdQuitHandlers } from './markovd-host-adapters'
import { prepareMarkovdSecretStoreAndMigrate } from './markovd-secret-store-startup'
import { describeMarkovdBindExposure, resolveMarkovdBindHost } from './markovd-bind-address'
import {
  flushMarkovdProfileStoreForShutdown,
  startMarkovdWithHost,
  stopMarkovdStructuredAgentSessions
} from './markovd-lifecycle'
import { resolveMarkovdWebClientRoot } from './markovd-command-arguments'
import type { MarkovdRuntimeCleanup } from './markovd-runtime-lifetime'
import { bindMarkovdStopTerminalAdmission } from './markovd-stop-terminal-admission'
import type { MarkovdHandle, MarkovdOptions } from './markovd-start-contract'
import { beginMarkovdIdleExit } from './markovd-managed-idle-exit-host'
import { markovdAutomationsKeepHostBusy, startMarkovdAutomations } from './markovd-automations'
import {
  changedAiVaultSearchSettings,
  type AiVaultSearchSettings
} from '../../shared/ai-vault/search/ai-vault-search-settings'
import { stampRuntimeSourceEnv } from '../../shared/runtime-source-env'
import { adoptWslHostLoginEnvironmentLogged } from './markovd-wsl-host-login-environment'
import { markovdWsPortOptions } from './markovd-ws-port-policy'
import { createMarkovdStartupTiming } from './markovd-startup-timing'
import { MARKOV_LAYOUT_OWNER_IS_MAIN } from '../../shared/layout-owner-switch'
import { restoreMarkovdTerminalAuthority } from './markovd-restored-terminal-authority'
import { installMarkovdFeatureReadiness } from '../runtime/rpc/markovd-feature-readiness'
import { isAgentStatusHooksEnabled } from '../../shared/agent-hook-listener/configuration/agent-status-hooks-setting'

let closeMarkovdObservability = (): Promise<void> => Promise.resolve()

/** Resolve after transport readiness publishes the desktop-compatible serve payload. */
export async function startMarkovd(options: MarkovdOptions = {}): Promise<MarkovdHandle> {
  installMarkovdHostAdapters()
  // Inherited terminal identity must not fence markovd’s CLI children to the launching desktop.
  stampRuntimeSourceEnv(process.env, null)
  const userDataPath = resolveUserDataPath()
  // Override inherited data roots so CLI-shared Codex homes resolve on this host.
  process.env.MARKOV_USER_DATA_PATH = userDataPath
  const { readiness, instance, stop } = await startMarkovdWithHost(
    userDataPath,
    (registerCleanup) => startMarkovdRuntime(options, registerCleanup),
    async () => {
      try {
        runMarkovdQuitHandlers()
      } finally {
        // Close after quit handlers, including failed ones, so their spans reach disk.
        const closing = closeMarkovdObservability()
        closeMarkovdObservability = () => Promise.resolve()
        await closing
      }
    }
  )
  const version = getAppEnvironment().getVersion()
  return { readiness, managedStop: { version, runtimeId: readiness.runtimeId, instance }, stop }
}

async function startMarkovdRuntime(
  options: MarkovdOptions,
  registerCleanup: (cleanup: MarkovdRuntimeCleanup) => void
): Promise<Pick<MarkovdHandle, 'readiness'>> {
  const { time: timed, report: reportStartupTiming } = createMarkovdStartupTiming()
  // Overlap login-shell probing with imports and store startup.
  const loginEnvironment = adoptWslHostLoginEnvironmentLogged()
  const { startMarkovdDaemon, stopMarkovdDaemon } = await import('./markovd-daemon-supervision')
  // The daemon and its PTYs inherit the adopted login env and nothing later startup writes, so it
  // spawns as soon as that lands, alongside imports, stores and hooks. Rejects only when supervised.
  const daemonStartup = loginEnvironment.then(() => timed('daemon', () => startMarkovdDaemon()))
  // Observed now: an early abort may never reach the await below.
  void daemonStartup.catch(() => {})
  // Registered first, so it runs last (cleanups run in reverse) and covers an import that throws
  // mid-spawn. It disconnects without killing daemon PTYs that must survive restart, after an
  // in-flight spawn settles; a failed one leaves only the disconnect to do.
  registerCleanup(() => daemonStartup.catch(() => {}).then(() => stopMarkovdDaemon()))
  const { MarkovRuntimeService } = await import('../runtime/markov-runtime')
  const { MarkovRuntimeRpcServer } = await import('../runtime/rpc/server/runtime-rpc')
  const { registerHeadlessPtyRuntime } = await import('../ipc/pty/register-headless-runtime')
  const { getLocalPtyProvider } = await import('../ipc/pty/provider/registry')
  const { installMarkovdObservability } = await import('./markovd-observability')
  closeMarkovdObservability = installMarkovdObservability()
  const { ServeReadinessPublisher } = await import('../server/serve-readiness')
  const { servePublishMode } = await import('../server/serve-pairing-readiness')
  const { buildMarkovdServeReadiness } = await import('./markovd-serve-readiness')
  const { createMarkovdProfileStateStartup } = await import('./markovd-profile-state-startup')
  const { daemonOwnsFreshPersistentPtys } =
    await import('../daemon/providers/lifecycle/daemon-provider-state')
  const { resolveDaemonSessionScrollbackRows } =
    await import('../daemon/sessions/daemon-session-scrollback-window')
  const { collectMarkovdHealth } = await import('./markovd-health')
  const { agentHookServer } = await import('../agent-hooks/server')
  await import('../agent-hooks/managed-agent-hook-controls')
  const { agentHookRuntimeDeps } = await import('../agent-hooks/agent-hook-runtime-deps')
  const { installHookStatusSessionTabsRepublish } =
    await import('../agent-hooks/hook-status-session-tabs-republish')
  const { startMarkovdAgentHookServer, startMarkovdManagedAgentHooks } =
    await import('./markovd-managed-agent-hooks')
  const { AgentStatusObservedPaneIdentities, AgentStatusObservedPaneIdentityCapture } =
    await import('../runtime/agent-status-observed-pane-identity')

  const { disposeWatcherProcessAndWait } =
    await import('../ipc/filesystem/watcher-process/parcel-watcher-process')

  let paneGridsForShutdown: { flushPaneGrids(): Promise<void> | null } | null = null
  let profileStoreForShutdown: Parameters<typeof flushMarkovdProfileStoreForShutdown>[0] | undefined
  let uninstallHookStatusRepublish = (): void => {}
  let uninstallObservedStatusIdentity = (): void => {}
  // Cleanups run in reverse: RPC, then recovery and watchers, then the final flush; the daemon
  // disconnect, registered above, runs last.
  registerCleanup(() => agentHookServer.stop())
  registerCleanup(() => uninstallHookStatusRepublish())
  registerCleanup(() => uninstallObservedStatusIdentity())
  registerCleanup(async () => {
    // A SQLite-backed markovd has no JSON mirror to absorb a debounced write after SIGTERM.
    if (profileStoreForShutdown) {
      await flushMarkovdProfileStoreForShutdown(profileStoreForShutdown, paneGridsForShutdown)
    }
  })
  registerCleanup(stopMarkovdStructuredAgentSessions)
  registerCleanup(() => disposeWatcherProcessAndWait())
  const { DesktopPushService } = await import('../runtime/push/desktop-push-service')
  const { resolvePushGatewayOrigin } = await import('../runtime/push/push-gateway-origin')

  const runtimeUserDataPath = getAppEnvironment().getPath('userData')
  const { startEventLoopDelayProbe } = await import('../diagnostics/event-loop-delay-probe')
  startEventLoopDelayProbe('markovd', runtimeUserDataPath)
  await timed('cli-launcher', () => prepareMarkovdCliLauncher()).catch((error: unknown) => {
    console.warn('[markovd] Could not prepare the profile CLI launcher', error)
  })
  const idleExitStartup = beginMarkovdIdleExit(runtimeUserDataPath)
  const { applyMarkovdSessionScannerIdleTimeout } = await import('./markovd-session-scanner-idle')
  await applyMarkovdSessionScannerIdleTimeout()
  // Initialize sealing before Store load unseals protected settings.
  await timed('secret-store', () => prepareMarkovdSecretStoreAndMigrate(runtimeUserDataPath))
  const { store: profileStore, authority: profileStateAuthority } = await timed('profile', () =>
    createMarkovdProfileStateStartup(runtimeUserDataPath)
  )
  const observedPaneIdentities = new AgentStatusObservedPaneIdentities()
  const observedStatusCapture = new AgentStatusObservedPaneIdentityCapture(observedPaneIdentities)
  profileStoreForShutdown = profileStore
  uninstallObservedStatusIdentity = agentHookServer.subscribeEnrichedStatus((enriched) =>
    observedStatusCapture.observe(enriched)
  )
  // Subscribe before hooks start so early turns are counted.
  const { startMarkovdStats } = await import('./markovd-stats')
  const stats = startMarkovdStats(runtimeUserDataPath, agentHookServer, registerCleanup)
  await startMarkovdAgentHookServer(agentHookServer, {
    env: 'production',
    userDataPath: runtimeUserDataPath,
    statusHooksEnabled: isAgentStatusHooksEnabled(profileStore.getSettings())
  })

  // Reconcile, daemon and runtime all consume this environment.
  await timed('login-env-wait', () => loginEnvironment)
  const managedAgentHooks = startMarkovdManagedAgentHooks(
    profileStore,
    (enabled) => agentHookServer.setStatusHooksEnabled(enabled),
    registerCleanup
  )

  // Install the daemon provider before PTY handlers can route their first call.
  await daemonStartup

  // Runtime constructor callbacks use this index only after it is installed.
  let sessionSearch: { apply(settings: AiVaultSearchSettings): void; dispose(): void } | null = null

  const { markovdCodexAccountHomes } = await import('./markovd-codex-account-homes')
  const codexAccountHomes = markovdCodexAccountHomes(
    () => profileStore.getSettings(),
    registerCleanup
  )

  // Gates open where each phase finishes today; RPC starts after all of them (no behavior change).
  const featureReadiness = installMarkovdFeatureReadiness()
  const { createMarkovdAccountServices } = await import('./markovd-account-services')
  const accountLaunch = createMarkovdAccountServices({
    store: profileStore,
    setClaudeStatusLineListener: (listener) =>
      agentHookServer.setClaudeStatusLineListener(listener),
    registerCleanup,
    clientCodexHomes: codexAccountHomes
  })

  const { loadAgentSessionClaimSigner } =
    await import('../runtime/agent-session/ownership/agent-session-claim-identity')
  const { createMarkovdPairedEnvironmentOptions } =
    await import('./markovd-paired-environment-options')
  const pairedEnvironments = createMarkovdPairedEnvironmentOptions()
  const runtime = new MarkovRuntimeService(profileStore, stats, {
    // Persistent signatures let restarted runtimes adopt PTYs owned before restart.
    agentSessionClaimSigner: loadAgentSessionClaimSigner(runtimeUserDataPath, runtimeUserDataPath),
    getAdditionalAiVaultCodexHomePaths: () => [
      ...codexAccountHomes.listSessionHomes(),
      ...(accountLaunch?.listCodexSessionHomes() ?? [])
    ],
    // WSL must retain desktop-pushed CODEX_HOME instead of host-selected resolvers.
    ...accountLaunch?.runtimeDeps,
    ...agentHookRuntimeDeps(agentHookServer, observedPaneIdentities, () =>
      profileStore.getSettings()
    ),
    // Resolve lazily because daemon swaps replace the provider after construction.
    getLocalProvider: () => getLocalPtyProvider(),
    ...pairedEnvironments.runtimeOptions,
    // Read current daemon ownership; failed/degraded launch cannot claim fresh PTY persistence.
    canRecoverPersistentLocalPtys: () => daemonOwnsFreshPersistentPtys(),
    // Node hosts cannot promote into desktop windows; override the constructor’s openable default.
    getDesktopWindowStatus: () => 'blocked',
    // No renderer reveals from this model; it keeps the daemon's live window, which deeper snapshot reads ask first.
    headlessTerminalScrollbackRows: resolveDaemonSessionScrollbackRows(),
    // Unchanged settings would reconstruct a healthy search index; deduplicate before apply.
    applySessionSearchSettings: (before, after) => {
      const next = changedAiVaultSearchSettings(before, after)
      if (next) {
        sessionSearch?.apply(next)
      }
    }
  })
  paneGridsForShutdown = runtime

  accountLaunch?.attachToRuntime(runtime)
  const { installMarkovdEmulatorBridge } = await import('./markovd-emulator-bridge')
  installMarkovdEmulatorBridge(runtime, registerCleanup)

  // Restore prior desktop-pushed account selection before automations or CLI launches.
  const { restoreMarkovdHostAccountLaunchEnv } =
    await import('./markovd-host-account-launch-env-store')
  restoreMarkovdHostAccountLaunchEnv(runtime, runtimeUserDataPath)
  featureReadiness.open('accounts')

  const { installMarkovdSessionSearchService } = await import('./markovd-session-search')
  sessionSearch = await installMarkovdSessionSearchService({
    userDataPath: runtimeUserDataPath,
    getSettings: () => profileStore.getSettings()
  })
  getAppEnvironment().onWillQuit(() => sessionSearch?.dispose())
  featureReadiness.open('sessionSearch')

  const { startAgentStateRulesLiveUpdates } =
    await import('../runtime/agent-state-rules/agent-state-rules-live-update')
  startAgentStateRulesLiveUpdates(profileStore, (rules) =>
    console.info(`[markovd] agent state rules ${rules.version} (${rules.source})`)
  )
  if (MARKOV_LAYOUT_OWNER_IS_MAIN) {
    const { repairDuplicatePtyPanesOnStart } = await import('../runtime/moved-pane-owner-rekey')
    // Wait behind earlier writes and persist repair before reconciliation/RPC admission.
    await repairDuplicatePtyPanesOnStart(profileStore, runtime)
  }

  // Status changes must republish session.tabs to paired clients.
  uninstallHookStatusRepublish = installHookStatusSessionTabsRepublish(
    agentHookServer,
    () => runtime
  )
  registerCleanup(runtime.attachAgentStatusStore(agentHookServer))

  // Headless registration threads Store into persistence; account homes prefer client then host selection.
  // WSL has no host selection and keeps the desktop-prepared environment.
  await registerHeadlessPtyRuntime(
    runtime,
    async (target, launchEnv, context) =>
      (await codexAccountHomes.selectLaunchHome(target, launchEnv, context)) ??
      (accountLaunch ? accountLaunch.prepareCodexHome(target, launchEnv, context) : null),
    () => profileStore.getSettings(),
    accountLaunch?.prepareClaudeAuth,
    profileStore,
    accountLaunch?.prepareCodexSessionResume
  )

  // Recover browser/orchestration authority before clients attach to the runtime graph.
  runtime.rehydrateClientHostedBrowserPages()

  await restoreMarkovdTerminalAuthority(runtime, timed, featureReadiness)
  runtime.agentTransitions.seedRestoredRows()
  void runtime.sidebarFacts?.reconcileSortStampTiers(getLocalPtyProvider())

  // Run after RPC stops; later dismissal records save synchronously until exit.
  registerCleanup(() => runtime.closeNotificationDismissals())
  // Stop recovery retries before final profile flush.
  registerCleanup(() => runtime.stopLegacyWorkerTerminalRecovery())

  // Recovery establishes terminal/dispatch identities before fencing observations.
  observedStatusCapture.attach(runtime)
  agentHookServer.setCliWriterExecutionMatcher(observedPaneIdentities, runtime)
  // First RPC clients must see a fully published graph.
  const { publishHeadlessRuntimeGraph } = await import('../runtime/headless-runtime-graph')
  publishHeadlessRuntimeGraph(runtime)
  // Only the runtime can identify running shells and install deferred migrated history.
  void runtime.installPendingMarkovdMigrationShellHistory().catch((error: unknown) => {
    console.error('[markovd-migration] installing pending shell history failed:', error)
  })

  const bindHost = resolveMarkovdBindHost(options.bind)
  bindMarkovdStopTerminalAdmission(runtime.terminalUpdateAdmission)
  const rpc = new MarkovRuntimeRpcServer({
    runtime,
    userDataPath: runtimeUserDataPath,
    enableWebSocket: true,
    // Pin operator exposure across restarts; pairing must not silently widen a loopback bind.
    pinnedBindHost: bindHost,
    webClientRoot: resolveMarkovdWebClientRoot(options.webClientRoot),
    ...markovdWsPortOptions(options.port)
  })
  pairedEnvironments.bindRpc(rpc)
  runtime.setAgentSenderPeerKey(() => rpc.getE2EEPublicKey())
  // Stop RPC before cleanup can tear down writers and runtime state.
  registerCleanup(() => rpc.stop())
  await timed('rpc', () => rpc.start())
  startMarkovdAutomations(runtime, profileStore, registerCleanup)
  const pushService = DesktopPushService.create({
    runtime,
    runtimeRpc: rpc,
    gatewayUrl: resolvePushGatewayOrigin(process.env, getAppEnvironment().isPackaged())
  })
  pushService?.start()
  getAppEnvironment().onWillQuit(() => pushService?.stop())
  console.error(`[markovd] ${describeMarkovdBindExposure(bindHost)}`)

  const readiness = await buildMarkovdServeReadiness({
    options,
    runtimeId: runtime.getRuntimeId(),
    rpc,
    collectHealth: () =>
      collectMarkovdHealth(
        getAppEnvironment().getVersion(),
        profileStateAuthority,
        idleExitStartup.previousIdleStop
      )
  })

  await new ServeReadinessPublisher().publish(readiness, servePublishMode(options))
  reportStartupTiming()
  managedAgentHooks.readinessPublished()

  await idleExitStartup.start({
    rpc,
    agentStates: () => agentHookServer.getStatusSnapshot(),
    hasStagedMigration: () => profileStore.hasStagedMarkovdMigrationCatalog(),
    automationsBusy: () => markovdAutomationsKeepHostBusy(profileStore),
    emulatorsBusy: async () =>
      (await runtime.getEmulatorBridge()?.hasLiveManagedSessions()) ?? false,
    registerCleanup
  })
  return { readiness }
}

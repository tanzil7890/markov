import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { MARKOVD_CLI_PACKAGE_FILENAME } from '../../shared/markovd-artifacts'
import { setAppEnvironment, type AppEnvironment } from '../../shared/app-environment'
import { setSecretStore } from '../../shared/secret-store'
import { resolveMarkovdInstallRoot, resolveMarkovdPath } from './markovd-app-paths'
import { getMarkovdCliLauncherPath } from './markovd-cli-launcher'
import { createMarkovdSecretStore, type MarkovdSecretStore } from './markovd-secret-store'
import { setSpeechServiceFactories } from '../speech/speech-runtime-service'
import { markovdSpeechServiceFactories } from './markovd-speech-services'

let quitRegisteredHandlers = (): void => {}

export function runMarkovdQuitHandlers(): void {
  quitRegisteredHandlers()
}

function createNodeAppEnvironment(): AppEnvironment {
  const quitHandlers: (() => void)[] = []
  // Synchronous quit handlers must not preempt the signal handler’s awaited runtime/browser teardown.
  quitRegisteredHandlers = (): void => {
    const errors: unknown[] = []
    for (const handler of quitHandlers.splice(0)) {
      try {
        handler()
      } catch (error) {
        errors.push(error)
      }
    }
    // Failed handlers may leave writers running and keep the instance lock held.
    if (errors.length > 0) {
      throw new AggregateError(errors, 'markovd_quit_handlers_failed')
    }
  }
  return {
    getPath: resolveMarkovdPath,
    getAppPath: () => resolveMarkovdInstallRoot(),
    getVersion: () => process.env.MARKOV_VERSION ?? '0.0.0-markovd',
    // Packaged gates production HTTPS/CLI/PATH policy; layout callers must inspect asar separately.
    isPackaged: () => true,
    getCliLauncherPath: getMarkovdCliLauncherPath,
    onWillQuit: (handler) => quitHandlers.push(handler),
    exit: (code = 0) => process.exit(code),
    getAppMetrics: () => []
  }
}

let markovdSecretStore: MarkovdSecretStore | null = null

export async function prepareMarkovdSecretStore(
  keyDir: string,
  userDataPath: string
): Promise<boolean> {
  if (!markovdSecretStore) {
    throw new Error('markovd_secret_store_not_installed — call installMarkovdHostAdapters() first')
  }
  return markovdSecretStore.prepare({ keyDir, userDataPath })
}

/** Stamp the bundle’s own release so inherited desktop versions cannot misidentify this server. */
export function stampMarkovdAppVersion(
  installRoot: () => string = resolveMarkovdInstallRoot
): void {
  let version: unknown
  try {
    const path = join(installRoot(), ...MARKOVD_CLI_PACKAGE_FILENAME.split('/'))
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    version = parsed && typeof parsed === 'object' && 'version' in parsed ? parsed.version : null
  } catch {
    return
  }
  if (typeof version === 'string' && version.length > 0) {
    process.env.MARKOV_APP_VERSION = version
  }
}

export function installMarkovdHostAdapters(): void {
  stampMarkovdAppVersion()
  setAppEnvironment(createNodeAppEnvironment())
  markovdSecretStore = createMarkovdSecretStore()
  setSecretStore(markovdSecretStore)
  setSpeechServiceFactories(markovdSpeechServiceFactories)
}

import '../memory/host-malloc-tunables-claim'
import process from 'node:process'
import { main } from './markovd-command-startup'
import { resolveMarkovdExitCode } from './markovd-exit-code'
import { reserveServeStdoutForReadiness } from '../server/serve-stdout-boundary'
import { runMarkovdNativePreflightVerdict } from './markovd-native-preflight'
import {
  MARKOVD_PROFILE_PREFLIGHT_FLAG,
  MARKOVD_STARTUP_PREFLIGHT_FLAG
} from '../../shared/markovd-profile-preflight'
import { onNodePtyLoadFailure } from '../providers/node-pty-load-failure'
import {
  confirmBundledMarkovdStartupQualified,
  discardBundledMarkovdStartupQualification,
  forgetBundledMarkovdStartupQualification,
  preflightBundledMarkovdStartup,
  runMarkovdProfilePreflight
} from './markovd-profile-preflight'
import { assertMarkovdServerRuntime } from './markovd-bundled-runtime'
import {
  formatMarkovdNativePreflightReport,
  MARKOVD_NATIVE_PREFLIGHT_FLAG
} from '../../shared/markovd-native-preflight-report'
import {
  MARKOVD_CANCEL_MANAGED_STOP_FLAG,
  MARKOVD_COMPLETE_MANAGED_STOP_FLAG
} from '../../shared/markovd-stop-request'
import {
  MARKOVD_WINDOWS_BREAKAWAY_CONTRACT,
  WINDOWS_BREAKAWAY_LAUNCH_FLAG
} from '../../shared/windows-breakaway-launch'
import { runWindowsBreakawayLaunchIfRequested } from '../../shared/windows-breakaway-launcher'
import { parseArgs } from './markovd-command-arguments'
import { MARKOVD_RECLAIM_STALE_LOCK_FLAG } from '../../shared/markovd-stale-lock-reclaim'

// A resolved plain-Node module graph proves the build guard; skip probes, ports and data-root locks.
if (process.argv.includes('--markovd-smoke-load-check')) {
  process.exit(0)
}

function failStartup(error: unknown): void {
  console.error('markovd: failed to start:', error)
  // Distinguish configuration refusals so supervisors cannot restart-spin on them.
  process.exit(resolveMarkovdExitCode(error))
}

// One-shot launch and stop commands must skip server startup and preflights.
if (process.argv[2] === '--markovd-structured-provider-load-check') {
  void import('./markovd-structured-provider-smoke')
    .then(({ smokeLoadMarkovdStructuredProviders }) => smokeLoadMarkovdStructuredProviders())
    .then(() => process.exit(0))
    .catch(failStartup)
} else if (process.argv[2] === WINDOWS_BREAKAWAY_LAUNCH_FLAG) {
  runWindowsBreakawayLaunchIfRequested(MARKOVD_WINDOWS_BREAKAWAY_CONTRACT, process.argv)
} else if (
  process.argv[2] === MARKOVD_COMPLETE_MANAGED_STOP_FLAG ||
  process.argv[2] === MARKOVD_CANCEL_MANAGED_STOP_FLAG
) {
  void import('./markovd-managed-stop-command').then(({ runMarkovdManagedStopCommandAndExit }) =>
    runMarkovdManagedStopCommandAndExit(process.argv.slice(2))
  )
} else if (process.argv[2] === MARKOVD_RECLAIM_STALE_LOCK_FLAG) {
  void import('./markovd-stale-lock-reclaim').then(({ runMarkovdStaleLockReclaimCommandAndExit }) =>
    runMarkovdStaleLockReclaimCommandAndExit(process.argv.slice(2))
  )
} else {
  startMarkovdProcess()
}

function startMarkovdProcess(): void {
  try {
    const argv = process.argv.slice(2)
    if ((argv.includes('--help') || argv.includes('-h')) && parseArgs(argv).help) {
      void main(argv).catch(failStartup)
      return
    }
    assertMarkovdServerRuntime()
    const flag = process.argv[2]
    if (flag === MARKOVD_NATIVE_PREFLIGHT_FLAG && process.argv.length === 3) {
      void import('./node-pty-precondition').then(({ checkNodePtyPrecondition }) => {
        const verdict = checkNodePtyPrecondition()
        const report = formatMarkovdNativePreflightReport(verdict.status, verdict.reason ?? null)
        process.stdout.write(`${report}\n`, () => process.exit(0))
      }, failStartup)
    } else if (
      (flag === MARKOVD_STARTUP_PREFLIGHT_FLAG && process.argv.length === 4) ||
      (flag === MARKOVD_PROFILE_PREFLIGHT_FLAG &&
        (process.argv.length === 4 || process.argv.length === 5))
    ) {
      void runMarkovdProfilePreflight(process.argv[3], {
        nativeFeatures: flag === MARKOVD_PROFILE_PREFLIGHT_FLAG,
        servedUserDataPath: process.argv[4]
      })
        // The owner reads EOF; lingering native handles must not keep this probe alive.
        .then(() => process.stdout.write('', () => process.exit(0)))
        .catch(failStartup)
    } else {
      // Stdout is the readiness API; send incidental diagnostics to stderr.
      reserveServeStdoutForReadiness()
      void preflightBundledMarkovdStartup()
        .then((qualified) => {
          onNodePtyLoadFailure(() => void discardBundledMarkovdStartupQualification())
          // Probe before deferred node-pty loading can crash this process; a slot qualified on this
          // unchanged host passed it on its last launch.
          if (runMarkovdNativePreflightVerdict({ qualified }) !== 'ok') {
            forgetBundledMarkovdStartupQualification()
          }
          return main()
        })
        .then(confirmBundledMarkovdStartupQualified)
        .catch(failStartup)
    }
  } catch (error) {
    failStartup(error)
  }
}

import { startMarkovd } from './markovd-entry'
import process from 'node:process'
import { resolveMarkovdInstallRoot } from './markovd-app-paths'
import { MARKOVD_USAGE, parseArgs } from './markovd-command-arguments'
import { installMarkovdShutdownSignals, type MarkovdShutdownTrigger } from './markovd-lifecycle'
import { installMarkovdProcessErrorGuards } from './markovd-process-error-guards'
import { installMarkovdStopRequestListeners } from './markovd-stop-request-listener'
import { prepareMarkovdManagedStop } from './markovd-managed-stop-admission'
import { bindMarkovdIdleShutdown } from './markovd-managed-idle-exit-host'

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv)
  if (options.help) {
    console.log(MARKOVD_USAGE)
    return
  }
  let shutdownTrigger: MarkovdShutdownTrigger | null = null
  // Fire-and-forget startup work can reject before its first await completes.
  installMarkovdProcessErrorGuards(() => shutdownTrigger)
  const startup = startMarkovd(options)
  const requestShutdown = installMarkovdShutdownSignals(async () => (await startup).stop())
  shutdownTrigger = requestShutdown
  const handle = await startup
  // Stop requests must name the runtime/instance established by startup.
  installMarkovdStopRequestListeners(() => requestShutdown('stop request'), {
    installRoot: resolveMarkovdInstallRoot(),
    managedStop: handle.managedStop,
    beforeManagedStop: prepareMarkovdManagedStop
  })
  bindMarkovdIdleShutdown(requestShutdown)
}

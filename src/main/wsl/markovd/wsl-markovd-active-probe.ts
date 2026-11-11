/**
 * WSL reads an active slot's liveness, readiness and pid in one guest command; SSH keeps
 * `probeActiveMarkovdReadiness`'s separate reads. The answers are judged exactly as those are.
 */
import type { MarkovdHostTarget } from '../../ssh/markovd-host-transport'
import type { MarkovdRemoteContext } from '../../managed-server/install/markovd-remote-context'
import { markovdLivenessProbeCommand } from '../../managed-server/install/markovd-remote-launch'
import { readMarkovdReadinessNowCommand } from '../../managed-server/install/markovd-remote-readiness-wait'
import { execMarkovdRemote } from '../../managed-server/install/markovd-remote-runtime-control'
import { MARKOVD_PID_FILENAME } from '../../managed-server/install/markovd-remote-host-support'
import { managedMarkovdInstallDir } from '../../managed-server/lifecycle/markovd-managed-runtime-context'
import {
  activeMarkovdReadinessFromOutput,
  assertActiveMarkovdLive,
  MarkovdActiveReadinessError
} from '../../ssh/markovd-active-readiness'
import { computeLocalMarkovdBuildHash } from '../../ssh/markovd-local-build-hash'
import type { ServeReadiness } from '../../server/serve-readiness'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import { joinRemotePath } from '../../ssh/ssh-remote-platform'

const SECTION_END = '__MARKOV_WSL_ACTIVE_PROBE_END__'

type WslContext = MarkovdRemoteContext<MarkovdHostTarget>

function pidCommand(context: WslContext, fullVersion: string): string {
  const pidFile = joinRemotePath(
    context.host,
    managedMarkovdInstallDir(context, fullVersion),
    MARKOVD_PID_FILENAME
  )
  return `cat ${quotePosixShell(pidFile)} 2>/dev/null || true`
}

function parsePid(output: string): number | null {
  const pid = Number.parseInt(output, 10)
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null
}

export async function readWslMarkovdPid(
  context: WslContext,
  fullVersion: string,
  signal?: AbortSignal
): Promise<number | null> {
  return parsePid(
    await execCommand(context.connection, pidCommand(context, fullVersion), { signal })
  )
}

/** Each section ends with a marker on its own line; the newline before it is the probe's own. */
export function wslMarkovdActiveProbeCommand(context: WslContext, fullVersion: string): string {
  const installDir = managedMarkovdInstallDir(context, fullVersion)
  const end = `printf '\\n%s\\n' ${SECTION_END}`
  return [
    markovdLivenessProbeCommand(context.host, installDir),
    end,
    readMarkovdReadinessNowCommand(context.host, installDir),
    end,
    pidCommand(context, fullVersion)
  ].join('\n')
}

export async function probeWslActiveMarkovd(
  context: WslContext,
  localMarkovdDir: string,
  fullVersion: string,
  signal?: AbortSignal
): Promise<{ readiness: ServeReadiness; pid: number | null }> {
  const output = await execMarkovdRemote(
    { conn: context.connection, host: context.host, signal },
    wslMarkovdActiveProbeCommand(context, fullVersion)
  )
  const sections = output.split(`\n${SECTION_END}\n`)
  if (sections.length !== 3) {
    throw new MarkovdActiveReadinessError(
      'unverifiable',
      `markovd ${fullVersion} process state is unverifiable.`
    )
  }
  const [liveness = '', readiness = '', pid = ''] = sections
  const expectation = { buildHash: computeLocalMarkovdBuildHash(localMarkovdDir), fullVersion }
  assertActiveMarkovdLive(liveness, expectation)
  return {
    readiness: activeMarkovdReadinessFromOutput(context.host, readiness, expectation),
    pid: parsePid(pid)
  }
}

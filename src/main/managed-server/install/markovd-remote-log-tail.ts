// Decorate logged errors with a bounded redacted host tail, never telemetry; missing host evidence preserves the original failure.
import { redactString } from '../../observability/redactor'
import { quotePosixShell } from '../../../shared/shell/launch/shell-argument-quoting'
import { MARKOVD_LOG_FILENAME } from './markovd-remote-host-support'
import { execCommand } from '../../ssh/remote-exec/remote-exec-command'
import {
  isWindowsRemoteHost,
  joinRemotePath,
  type RemoteHostPlatform
} from '../../ssh/ssh-remote-platform'
import {
  markovdWindowsSlotOpCommand,
  readMarkovdWindowsEncodedAnswer
} from './markovd-remote-windows-node'
import { MARKOVD_WINDOWS_LOG_TAIL_MARKER } from '../host-state/markovd-windows-host-script'
import type { MarkovdRemoteExecTarget } from './markovd-remote-runtime-control'

export const MARKOVD_LOG_TAIL_LINES = 40
export const MARKOVD_LOG_TAIL_MAX_BYTES = 8 * 1024
// Error decoration must not add an unbounded delay.
const MARKOVD_LOG_TAIL_TIMEOUT_MS = 10_000

export function markovdLogTailCommand(host: RemoteHostPlatform, slotDir: string): string {
  const log = joinRemotePath(host, slotDir, MARKOVD_LOG_FILENAME)
  if (isWindowsRemoteHost(host)) {
    return markovdWindowsSlotOpCommand(host, slotDir, 'log-tail', [
      log,
      String(MARKOVD_LOG_TAIL_MAX_BYTES)
    ])
  }
  return `tail -c ${MARKOVD_LOG_TAIL_MAX_BYTES} ${quotePosixShell(log)} 2>/dev/null || true`
}

export function parseMarkovdLogTail(host: RemoteHostPlatform, output: string): string | null {
  const raw = isWindowsRemoteHost(host)
    ? (readMarkovdWindowsEncodedAnswer(output, MARKOVD_WINDOWS_LOG_TAIL_MARKER) ?? '')
    : output
  const bounded = Buffer.from(raw, 'utf8').subarray(-MARKOVD_LOG_TAIL_MAX_BYTES).toString('utf8')
  const lines = bounded.replace(/\s+$/u, '').split(/\r?\n/u).slice(-MARKOVD_LOG_TAIL_LINES)
  const tail = redactString(lines.join('\n'))
  return tail.trim() ? tail : null
}

async function readMarkovdLogTail(
  target: MarkovdRemoteExecTarget,
  slotDir: string
): Promise<string | null> {
  try {
    // Observe cancellation failures without reusing the already-aborted request signal.
    const output = await execCommand(target.conn, markovdLogTailCommand(target.host, slotDir), {
      wrapCommand: target.host.commandDialect !== 'powershell',
      timeoutMs: MARKOVD_LOG_TAIL_TIMEOUT_MS
    })
    return parseMarkovdLogTail(target.host, output)
  } catch (error) {
    console.warn('[ssh] Could not read the markovd.log tail:', error)
    return null
  }
}

export async function withMarkovdLogTail(
  target: MarkovdRemoteExecTarget,
  slotDir: string,
  message: string
): Promise<string> {
  const tail = await readMarkovdLogTail(target, slotDir)
  return tail ? `${message}\nLast lines of markovd.log:\n${tail}` : message
}

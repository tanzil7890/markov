// Remember repeatable deployment refusals per app version; host-fixable settings must be reprobed.

export class MarkovdHostUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarkovdHostUnsupportedError'
  }
}

export class MarkovdArtifactsUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarkovdArtifactsUnavailableError'
  }
}

export class MarkovdStdioBridgeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarkovdStdioBridgeUnavailableError'
  }
}

export const MARKOVD_TUNNEL_UNAVAILABLE_REASON = 'ssh_tunnel_unavailable'
export const MARKOVD_WINDOWS_LAUNCH_REFUSED_CODE = 'markovd_windows_launch_refused'
export const MARKOVD_WINDOWS_COMMAND_LINE_UNSAFE_CODE = 'markovd_windows_command_line_unsafe'

export type MarkovdHostUnavailableReason =
  | 'unsupported_host'
  | 'artifacts_unavailable'
  | 'libc_unidentified'
  | 'runtime_self_test'
  | 'runtime_noexec'
  | 'windows_build_unsupported'
  | 'windows_no_extractor'
  | 'security_software'
  | 'native_preflight'
  | typeof MARKOVD_TUNNEL_UNAVAILABLE_REASON

const UNAVAILABLE_BY_ERROR_NAME: Record<string, MarkovdHostUnavailableReason> = {
  MarkovdHostUnsupportedError: 'unsupported_host',
  MarkovdArtifactsUnavailableError: 'artifacts_unavailable',
  MarkovdRemoteLaunchUnsupportedError: 'unsupported_host',
  UnidentifiedHostLibcError: 'libc_unidentified',
  RemoteNodeRuntimeSelfTestError: 'runtime_self_test',
  RemoteNodeRuntimeNoexecError: 'runtime_noexec',
  RemoteWindowsBuildUnsupportedError: 'windows_build_unsupported',
  RemoteNodeRuntimeNoExtractorError: 'windows_no_extractor',
  RemoteNodeRuntimeSecurityModifiedError: 'security_software',
  MarkovdStdioBridgeUnavailableError: MARKOVD_TUNNEL_UNAVAILABLE_REASON,
  MarkovdWindowsLaunchRefusedError: 'unsupported_host',
  MarkovdWindowsCommandLineError: 'unsupported_host'
}

// Native preflight, PTY self-test and permanent Windows refusals repeat; transient races do not.
const UNAVAILABLE_BY_DEFERRAL_CODE: Record<string, MarkovdHostUnavailableReason> = {
  markovd_candidate_preflight_failed: 'native_preflight',
  markovd_activation_pty_self_test_failed: 'native_preflight',
  [MARKOVD_WINDOWS_LAUNCH_REFUSED_CODE]: 'unsupported_host',
  [MARKOVD_WINDOWS_COMMAND_LINE_UNSAFE_CODE]: 'unsupported_host'
}

// Reprobed on every connect, so fixing or upgrading the host needs no new Markov version.
const FIXABLE_ON_HOST: ReadonlySet<string> = new Set<MarkovdHostUnavailableReason>([
  'runtime_noexec',
  'windows_build_unsupported',
  'windows_no_extractor'
])

export function isMarkovdHostUnavailableFixableOnHost(reason: string): boolean {
  return FIXABLE_ON_HOST.has(reason)
}

export function markovdCandidateLaunchFailureCode(error: unknown): string {
  const code = error instanceof Error && 'code' in error ? error.code : undefined
  return code === MARKOVD_WINDOWS_LAUNCH_REFUSED_CODE ||
    code === MARKOVD_WINDOWS_COMMAND_LINE_UNSAFE_CODE
    ? code
    : 'markovd_candidate_launch_failed'
}

export function classifyMarkovdHostUnavailable(
  failure: unknown
): MarkovdHostUnavailableReason | null {
  if (failure instanceof Error) {
    return UNAVAILABLE_BY_ERROR_NAME[failure.name] ?? null
  }
  if (failure && typeof failure === 'object' && 'code' in failure) {
    const code = failure.code
    return typeof code === 'string' ? (UNAVAILABLE_BY_DEFERRAL_CODE[code] ?? null) : null
  }
  return null
}

import { MARKOVD_MANAGED_ACTIVATION_ROOT_ENV } from '../../shared/markovd-managed-launch-env'

type MarkovdWsPortOptions = {
  wsPort?: number
  preferPinnedWsPort?: boolean
  requirePinnedWsPort?: boolean
}

/** Honor explicit ports; managed launches permit fallback because WSL distros share loopback. */
export function markovdWsPortOptions(
  port: number | undefined,
  env: NodeJS.ProcessEnv = process.env
): MarkovdWsPortOptions {
  if (port === undefined) {
    return {}
  }
  const managed = Boolean(env[MARKOVD_MANAGED_ACTIVATION_ROOT_ENV])
  return {
    wsPort: port,
    preferPinnedWsPort: true,
    ...(managed ? {} : { requirePinnedWsPort: true })
  }
}

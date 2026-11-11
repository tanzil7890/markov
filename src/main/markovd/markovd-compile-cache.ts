import module from 'node:module'
import { join } from 'node:path'
import { MARKOVD_MANAGED_ACTIVATION_ROOT_ENV } from '../../shared/markovd-managed-launch-env'

export const MARKOVD_COMPILE_CACHE_DIRNAME = '.markovd-compile-cache'

type CompileCacheModule = {
  enableCompileCache?: (directory: string) => unknown
  getCompileCacheDir?: () => string | undefined
}

/** Cache only in managed slots: packaged-app writes break signatures. Fail back to compilation. */
export function enableManagedMarkovdCompileCache(
  slotDirectory: string,
  env: NodeJS.ProcessEnv = process.env,
  api: CompileCacheModule = module
): void {
  if (!env[MARKOVD_MANAGED_ACTIVATION_ROOT_ENV] || typeof api.enableCompileCache !== 'function') {
    return
  }
  try {
    api.enableCompileCache(join(slotDirectory, MARKOVD_COMPILE_CACHE_DIRNAME))
  } catch {
    // Unwritable slots or older runtimes compile without a cache.
  }
}

/** Disposable children only: user-process descendants must not inherit slot cache paths. */
export function markovdCompileCacheEnv(
  slotDirectory: string,
  api: CompileCacheModule = module,
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  // Preserve operator-specified caches on unmanaged hosts.
  const enabled =
    Boolean(env[MARKOVD_MANAGED_ACTIVATION_ROOT_ENV]) &&
    typeof api.getCompileCacheDir === 'function' &&
    Boolean(api.getCompileCacheDir())
  return enabled ? { NODE_COMPILE_CACHE: join(slotDirectory, MARKOVD_COMPILE_CACHE_DIRNAME) } : {}
}

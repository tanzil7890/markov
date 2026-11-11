import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { MarkovdManagedPendingMigrationRow } from '../../../../../../shared/markovd-managed-runtime'
import {
  getMarkovdSshDeployment,
  type PublicKnownRuntimeEnvironment
} from '../../../../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { SshTarget } from '../../../../../../shared/ssh-types'
import type { ManagedMarkovdPreloadApi } from '../../../../../../preload/api/managed-markovd-api'
import { useMountedRef } from '@/hooks/useMountedRef'
import { isWebClientLocation } from '@/lib/web-client-location'
import { managedServerOutcomeLabel } from './managed-server-copy'

export type ManagedServerCatalog = {
  /** Absent in the web client, which can't reach SSH hosts. */
  api: ManagedMarkovdPreloadApi | undefined
  targets: SshTarget[]
  /** SSH hosts that don't already run, or move to, a managed server. */
  emptyTargets: SshTarget[]
  pending: MarkovdManagedPendingMigrationRow[]
  loadFailed: boolean
  resumingId: string | null
  reload: () => Promise<void>
  resume: (row: MarkovdManagedPendingMigrationRow) => Promise<void>
}

/** Web fallback stubs cannot manage SSH hosts. */
export function getManagedMarkovdApi(): ManagedMarkovdPreloadApi | undefined {
  return isWebClientLocation() ? undefined : window.api.runtimeEnvironments.managedMarkovd
}

export function useManagedServerCatalog(
  environments: PublicKnownRuntimeEnvironment[],
  onChanged: () => void
): ManagedServerCatalog {
  const api = getManagedMarkovdApi()
  const mountedRef = useMountedRef()
  const [targets, setTargets] = useState<SshTarget[]>([])
  const [pending, setPending] = useState<MarkovdManagedPendingMigrationRow[]>([])
  const [resumingId, setResumingId] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  const reload = useCallback(async () => {
    if (!api) {
      return
    }
    const [nextTargets, nextPending] = await Promise.all([
      window.api.ssh.listTargets(),
      api.listPendingMigrations()
    ])
    if (mountedRef.current) {
      setTargets(nextTargets)
      setPending(nextPending)
      setLoadFailed(false)
    }
  }, [api, mountedRef])

  useEffect(() => {
    void reload().catch(() => mountedRef.current && setLoadFailed(true))
  }, [mountedRef, reload])

  // Running or migrating servers already occupy the host.
  const busyTargetIds = new Set([
    ...environments.map((environment) => getMarkovdSshDeployment(environment)?.sshTargetId),
    ...pending.map((row) => row.sshTargetId)
  ])
  const emptyTargets = targets.filter(
    (target) => !target.markovdFence && !busyTargetIds.has(target.id)
  )

  const resume = async (row: MarkovdManagedPendingMigrationRow): Promise<void> => {
    if (!api || resumingId) {
      return
    }
    setResumingId(row.migrationId)
    try {
      const result = await api.convertSshHost({ sshTargetId: row.sshTargetId, name: row.name })
      if (result.outcome !== 'converted') {
        toast.message(managedServerOutcomeLabel(result))
      }
      onChanged()
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      if (mountedRef.current) {
        setResumingId(null)
      }
    }
  }

  return { api, targets, emptyTargets, pending, loadFailed, resumingId, reload, resume }
}

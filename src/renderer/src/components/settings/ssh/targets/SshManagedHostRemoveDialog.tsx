import type { SshTarget } from '../../../../../../shared/ssh-types'
import { useAppStore } from '@/store/index'
import { translate } from '@/i18n/i18n'
import { Button } from '../../../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../../ui/dialog'

/** Main refuses to remove a host its managed server still holds; only Stop or Forget frees it. */
export function isManagedServerSshHost(
  target: Pick<SshTarget, 'markovdFence' | 'markovdProvisioning'>
): boolean {
  return target.markovdFence !== undefined || target.markovdProvisioning !== undefined
}

export function SshManagedHostRemoveDialog({
  label,
  onClose
}: {
  label: string | null
  onClose: () => void
}): React.JSX.Element {
  const openManagedServers = (): void => {
    useAppStore
      .getState()
      .openSettingsTarget({ pane: 'servers', repoId: null, sectionId: 'managed-servers' })
    onClose()
  }
  return (
    <Dialog open={label !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm sm:max-w-sm" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.settings.SshTargetDestructiveActions.4808966c41',
              'Remove SSH Target'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.sshManagedHostRemove.descriptionServerHost',
              'Markov runs on {{label}}. In Remote Markov Servers, open the ⋯ menu on {{label}} and choose Stop… to remove Markov from the host, or Forget… if the host is gone. Then you can remove this SSH host.',
              { label: label ?? '' }
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {translate('auto.components.settings.SshDestructiveActionDialog.895b216267', 'Cancel')}
          </Button>
          <Button onClick={openManagedServers}>
            {translate(
              'auto.components.settings.sshManagedHostRemove.openServers',
              'Open Remote Markov Servers'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

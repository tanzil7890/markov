import { ActionSheetModal } from '../components/ActionSheetModal'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { useMobileAllowAutoCloseActions, workerSubjectOf } from './mobile-worker-auto-close'
import type { MobileSessionController } from './use-mobile-session-controller'

/** The long-pressed chat tab's actions: Allow Auto-Close on a kept worker, close. */
export function MobileAgentSessionTabActionSheet({
  controller
}: {
  controller: MobileSessionController
}) {
  const t = useMobileTranslation()
  const {
    agentSessionActionTarget: tab,
    setAgentSessionActionTarget,
    closeWithBulkActions
  } = controller
  const dismiss = () => setAgentSessionActionTarget(null)
  const workerActions = useMobileAllowAutoCloseActions(
    controller.client,
    workerSubjectOf(tab ?? undefined)
  )
  return (
    <ActionSheetModal
      visible={tab != null}
      title={tab?.title || t('session.sheets.chat', 'Chat')}
      actions={[...workerActions, ...closeWithBulkActions(tab, dismiss)]}
      onClose={dismiss}
    />
  )
}

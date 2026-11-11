import type { MouseEvent } from 'react'
import type { WorkspaceAttachment } from '../../../../../../shared/worktree/types'
import type { WorktreeCardPrDisplay } from './worktree-card-pr-display'
import { workspaceAttachmentProviderLabel } from '../metadata/worktree-attachment-editing'
import { MonitorUp } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { WorktreeCardRowActionsMenu } from '../surface/WorktreeCardRowActionsMenu'
import { HostedReviewUnlinkMenuItem } from '@/components/HostedReviewUnlinkMenuItem'
import { translate } from '@/i18n/i18n'

export function WorktreeCardReviewActions({
  label,
  number,
  provider,
  open,
  onOpenChange,
  onOpenInMarkov,
  onUnlink,
  closeHover
}: {
  label: 'PR' | 'MR'
  number: number
  provider: string
  open?: boolean
  onOpenChange: (open: boolean) => void
  onOpenInMarkov?: (event: MouseEvent) => void
  onUnlink?: () => void
  closeHover: () => void
}): React.JSX.Element | null {
  if (!onOpenInMarkov && !onUnlink) {
    return null
  }
  return (
    <WorktreeCardRowActionsMenu
      label={translate(
        'auto.components.sidebar.WorktreeCardMeta.dbe2d18972',
        'More {{value0}} actions',
        {
          value0: label
        }
      )}
      open={open}
      onOpenChange={onOpenChange}
    >
      {onOpenInMarkov ? (
        <DropdownMenuItem
          onClick={(event) => {
            closeHover()
            onOpenInMarkov(event)
          }}
        >
          <MonitorUp className="size-3.5" />
          {translate('auto.components.sidebar.WorktreeCardMeta.2c67730e07', 'Open in Markov')}
        </DropdownMenuItem>
      ) : null}
      {onUnlink ? (
        <HostedReviewUnlinkMenuItem
          reviewLabel={label}
          reviewIdentifier={`${label === 'MR' ? '!' : '#'}${number}`}
          providerLabel={provider}
          onSelect={() => {
            closeHover()
            onUnlink()
          }}
        />
      ) : null}
    </WorktreeCardRowActionsMenu>
  )
}

export function WorktreeCardLinkedReviewActions({
  item,
  review,
  onOpenChange,
  onOpenInMarkov,
  onUnlink,
  closeHover
}: {
  item: WorkspaceAttachment
  review: WorktreeCardPrDisplay | null
  onOpenChange: (open: boolean) => void
  onOpenInMarkov?: (event: MouseEvent, review?: WorktreeCardPrDisplay) => void
  onUnlink?: (item?: WorkspaceAttachment) => void
  closeHover: () => void
}): React.JSX.Element {
  const url = item.url ?? review?.url
  const label = item.type === 'mr' ? 'MR' : 'PR'
  return (
    <WorktreeCardReviewActions
      label={label}
      number={item.number}
      provider={workspaceAttachmentProviderLabel(item)}
      onOpenChange={onOpenChange}
      onOpenInMarkov={
        url && item.provider === 'github' && onOpenInMarkov
          ? (event) =>
              onOpenInMarkov(
                event,
                review ?? {
                  provider: 'github',
                  number: item.number,
                  title: item.title ?? '',
                  url
                }
              )
          : undefined
      }
      onUnlink={onUnlink ? () => onUnlink(item) : undefined}
      closeHover={closeHover}
    />
  )
}

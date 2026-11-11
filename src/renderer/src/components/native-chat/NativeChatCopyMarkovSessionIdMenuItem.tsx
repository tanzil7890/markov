import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

/** Copies the chat's Markov session ID from the host: `markov_session_id:<root>`, which `/clear` keeps. */
export function NativeChatCopyMarkovSessionIdMenuItem({
  resolveMarkovSessionId
}: {
  resolveMarkovSessionId: () => Promise<string | null>
}): React.JSX.Element {
  const copyMarkovSessionId = async (): Promise<void> => {
    try {
      const markovSessionId = await resolveMarkovSessionId()
      if (!markovSessionId) {
        throw new Error('no Markov session ID')
      }
      await window.api.ui.writeClipboardText(markovSessionId)
      toast.success(
        translate(
          'components.native-chat.contextMenu.markovSessionIdCopied',
          'Markov session ID copied'
        )
      )
    } catch {
      toast.error(
        translate(
          'components.native-chat.contextMenu.markovSessionIdCopyFailed',
          'Unable to copy Markov session ID'
        )
      )
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuItem onSelect={() => void copyMarkovSessionId()}>
          <Copy />
          {translate(
            'components.native-chat.contextMenu.copyMarkovSessionId',
            'Copy Markov Session ID'
          )}
        </DropdownMenuItem>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="max-w-[220px]">
        {translate(
          'components.native-chat.contextMenu.markovSessionIdTooltip',
          "Markov's ID for this chat, separate from the agent CLI's own session ID. Agents use it to refer to each other through Markov."
        )}
      </TooltipContent>
    </Tooltip>
  )
}

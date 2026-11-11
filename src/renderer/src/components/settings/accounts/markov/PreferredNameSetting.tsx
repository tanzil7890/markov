import { useEffect, useId, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store/index'
import { PREFERRED_NAME_MAX_LENGTH } from '@/lib/user-preferred-name'

/** The name Markov greets the user with; saved on blur or Enter, Escape restores the saved one. */
export function PreferredNameSetting(): React.JSX.Element {
  const saved = useAppStore((state) => state.settings?.preferredName ?? '')
  const updateSettings = useAppStore((state) => state.updateSettings)
  const [draft, setDraft] = useState(saved)
  const inputId = useId()
  const helpId = useId()

  useEffect(() => {
    setDraft(saved)
  }, [saved])

  const commit = (): void => {
    const name = draft.trim()
    setDraft(name)
    if (name !== saved) {
      void updateSettings({ preferredName: name })
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>
        {translate('components.onboarding.profile.nameLabel', 'What should we call you?')}
      </Label>
      <Input
        id={inputId}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            commit()
          } else if (event.key === 'Escape') {
            setDraft(saved)
          }
        }}
        maxLength={PREFERRED_NAME_MAX_LENGTH}
        autoComplete="nickname"
        spellCheck={false}
        aria-describedby={helpId}
        className="max-w-80"
      />
      <p id={helpId} className="text-xs text-muted-foreground">
        {translate(
          'components.settings.markovAccount.preferredNameHelp',
          'Markov greets you by this name. Leave it empty to use the name on your account.'
        )}
      </p>
    </div>
  )
}

import { CircleUserRound, Lock } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  PREFERRED_NAME_MAX_LENGTH,
  nameInitials,
  resolveUserDisplayName
} from '@/lib/user-preferred-name'

type ProfileStepProps = {
  name: string
  onNameChange: (name: string) => void
  onSubmit: () => void
}

export function ProfileStep({ name, onNameChange, onSubmit }: ProfileStepProps): React.JSX.Element {
  const authStatus = useAppStore((state) => state.markovProfileAuthStatus)
  const connected = authStatus?.state === 'connected'
  const email = connected ? authStatus.cloud?.email : undefined
  const greetingName = resolveUserDisplayName(name, authStatus)
  const initials = greetingName ? nameInitials(greetingName) : null

  return (
    <div className="max-w-120 space-y-6">
      <div className="flex items-center gap-3.5 rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-[15px] font-semibold text-foreground">
          {initials ?? <CircleUserRound className="size-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-[15px] font-medium text-foreground">
            {greetingName
              ? translate('components.onboarding.profile.greeting', 'Welcome, {{name}}', {
                  name: greetingName
                })
              : translate('components.onboarding.profile.greetingNoName', 'Welcome')}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate('components.onboarding.profile.preview', 'How Markov will greet you')}
          </p>
        </div>
      </div>

      {email ? (
        <div className="space-y-1.5">
          <Label htmlFor="onboarding-profile-email">
            {translate('components.onboarding.profile.emailLabel', 'Email')}
          </Label>
          <div className="relative">
            <Input
              id="onboarding-profile-email"
              value={email}
              readOnly
              adornment="trailing"
              aria-describedby="onboarding-profile-email-help"
              className="cursor-default"
            />
            <Lock
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
          </div>
          <p id="onboarding-profile-email-help" className="text-xs text-muted-foreground">
            {translate(
              'components.onboarding.profile.emailHelp',
              "This comes from your sign-in, so it can't be changed here."
            )}
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="onboarding-profile-name">
          {translate('components.onboarding.profile.nameLabel', 'What should we call you?')}
        </Label>
        <Input
          id="onboarding-profile-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              onSubmit()
            }
          }}
          maxLength={PREFERRED_NAME_MAX_LENGTH}
          autoComplete="nickname"
          spellCheck={false}
          autoFocus
          aria-describedby="onboarding-profile-name-help"
        />
        <p id="onboarding-profile-name-help" className="text-xs text-muted-foreground">
          {connected
            ? translate(
                'components.onboarding.profile.nameHelpSignedIn',
                'Leave it empty to use the name on your account.'
              )
            : translate('components.onboarding.profile.nameHelpLocal', 'Saved on this computer.')}
        </p>
      </div>
    </div>
  )
}

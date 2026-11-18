import { AppearanceAdvancedDisclosure } from '../appearance/AppearanceAdvancedDisclosure'

export type SettingsHowToStep = { key: string; title: string; description: string }

/** Numbered steps that explain a feature. Closed until asked for, so a section opens on its controls. */
export function SettingsHowToGuide({
  title,
  description,
  steps
}: {
  title: string
  description: string
  steps: readonly SettingsHowToStep[]
}): React.JSX.Element {
  return (
    <AppearanceAdvancedDisclosure label={title} showTopBorder={false} className="mt-0 py-3">
      <div className="space-y-4 pt-2">
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step.key} className="flex items-start gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-2xs font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </AppearanceAdvancedDisclosure>
  )
}

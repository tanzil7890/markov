import type { GlobalSettings } from '../../../../../shared/global-settings-types'
import { translate } from '@/i18n/i18n'
import { Button } from '../../ui/button'
import { SetupGuideProgressRing } from '../../setup-guide/SetupGuideProgressRing'
import { SettingsRow, SettingsSubsectionHeader } from '../form-controls/SettingsFormControls'
import { useSettingsSetupGuideProgress } from '../setup-guide/settings-setup-guide-progress'

/** Something in Settings that is waiting on the user. */
export type SettingsAttentionItem = {
  sectionId: string
  title: string
  /** Where it lives, as the sidebar names it. */
  path: string
  status: 'update-available' | 'needs-attention'
}

function attentionStatusLabel(status: SettingsAttentionItem['status']): string {
  return status === 'update-available'
    ? translate(
        'auto.components.skills.SkillFreshnessStatusPill.updateAvailable',
        'Update available'
      )
    : translate('auto.components.skills.SkillFreshnessStatusPill.needsAttention', 'Review skill')
}

function themeLabel(theme: GlobalSettings['theme']): string {
  if (theme === 'dark') {
    return translate('settings.overview.themeDark', 'Dark')
  }
  if (theme === 'light') {
    return translate('settings.overview.themeLight', 'Light')
  }
  return translate('settings.overview.themeSystem', 'Follows the system')
}

function OpenButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      {label}
    </Button>
  )
}

/** Says what is waiting on the user and links to the settings people change most; each setting still lives in its own section. */
export function SettingsOverviewPane({
  settings,
  attentionItems,
  showNotifications,
  onOpenSection
}: {
  settings: GlobalSettings
  attentionItems: readonly SettingsAttentionItem[]
  showNotifications: boolean
  onOpenSection: (sectionId: string) => void
}): React.JSX.Element {
  const setup = useSettingsSetupGuideProgress(true)
  const openLabel = translate('settings.overview.open', 'Open')
  const changeLabel = translate('settings.overview.change', 'Change')
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <SettingsSubsectionHeader
          title={translate('settings.overview.attentionTitle', 'Needs attention')}
        />
        {attentionItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {translate('settings.overview.attentionEmpty', 'Nothing needs your attention.')}
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {attentionItems.map((item) => (
              <SettingsRow
                key={item.sectionId}
                label={item.title}
                description={`${item.path} \u00b7 ${attentionStatusLabel(item.status)}`}
                control={
                  <OpenButton label={openLabel} onClick={() => onOpenSection(item.sectionId)} />
                }
              />
            ))}
          </div>
        )}
      </section>

      {setup.ready ? (
        <section className="space-y-2">
          <SettingsSubsectionHeader title={translate('settings.overview.setupTitle', 'Setup')} />
          <SettingsRow
            label={
              <span className="flex items-center gap-2">
                <SetupGuideProgressRing
                  done={setup.doneCount}
                  total={setup.total}
                  sizeClassName="size-4"
                />
                {translate(
                  'auto.components.settings.SettingsSidebar.6503182299',
                  'Onboarding checklist'
                )}
              </span>
            }
            description={translate(
              'settings.overview.setupProgress',
              '{{done}} of {{total}} steps done.',
              { done: setup.doneCount, total: setup.total }
            )}
            control={<OpenButton label={openLabel} onClick={() => onOpenSection('setup-guide')} />}
          />
        </section>
      ) : null}

      <section className="space-y-2">
        <SettingsSubsectionHeader
          title={translate('settings.overview.glanceTitle', 'At a glance')}
        />
        <div className="divide-y divide-border/60">
          <SettingsRow
            label={translate('settings.overview.theme', 'Theme')}
            description={themeLabel(settings.theme)}
            control={<OpenButton label={changeLabel} onClick={() => onOpenSection('appearance')} />}
          />
          <SettingsRow
            label={translate('settings.overview.workspaceFolder', 'Workspace folder')}
            description={<span className="font-mono">{settings.workspaceDir}</span>}
            control={<OpenButton label={changeLabel} onClick={() => onOpenSection('general')} />}
          />
          {showNotifications ? (
            <SettingsRow
              label={translate('auto.components.settings.Settings.9907545fa3', 'Notifications')}
              description={
                settings.notifications.enabled
                  ? translate('settings.overview.on', 'On')
                  : translate('settings.overview.off', 'Off')
              }
              control={
                <OpenButton label={changeLabel} onClick={() => onOpenSection('notifications')} />
              }
            />
          ) : null}
        </div>
      </section>
    </div>
  )
}

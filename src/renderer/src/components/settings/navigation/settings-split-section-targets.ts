import { USAGE_PERCENTAGE_DISPLAY_SETTING_ID } from '../appearance/appearance-usage-percentage-search'

/** General, Appearance and Git were each one pane once. A link written for the old pane
 *  lands on the section that now holds the setting it points at. */
export function resolveSplitSettingsSection(
  sectionId: string,
  targetId: string | undefined
): string {
  if (targetId === undefined) {
    return sectionId
  }
  if (sectionId === 'general' && targetId === 'cli') {
    return 'cli'
  }
  if (sectionId === 'git' && targetId.startsWith('source-control-ai')) {
    return 'git-ai'
  }
  if (sectionId === 'appearance' && targetId === USAGE_PERCENTAGE_DISPLAY_SETTING_ID) {
    return 'appearance-window'
  }
  return sectionId
}

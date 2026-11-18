/** Settings reopens on the section last shown in this window; the page remounts on every open. */
let lastSectionId: string | null = null

export function recallSettingsSection(): string | null {
  return lastSectionId
}

export function rememberSettingsSection(sectionId: string): void {
  lastSectionId = sectionId
}

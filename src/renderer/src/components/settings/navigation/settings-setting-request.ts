/** A setting someone asked to be taken to: a link's anchor, or the name of a search result.
 *  A pane with tabs of its own reads it to open the tab that holds the setting. */
export type SettingsSettingRequest = {
  sectionId: string
  targetId?: string
  title?: string
  /** Changes with every request, so asking twice for the same setting works twice. */
  token: number
}

export function nextSettingsSettingRequest(
  previous: SettingsSettingRequest | null,
  request: Omit<SettingsSettingRequest, 'token'>
): SettingsSettingRequest {
  return { ...request, token: (previous?.token ?? 0) + 1 }
}

import { useCallback, useEffect, useRef } from 'react'
import type { SettingsStoreModel } from './use-settings-store-model'
import type { SettingsInteractionController } from './use-settings-interaction-controller'
import type { SettingsNavigationModel } from '../navigation/use-settings-navigation-model'
import {
  getSettingsDestinationGroups,
  isSingleSectionDestination,
  locateSettingsSection,
  type SettingsDestination
} from '../navigation/settings-destinations'
import type {
  SettingsRailGroup,
  SettingsRailItem,
  SettingsRailProject
} from '../navigation/SettingsSidebar'
import { revealInSettings } from '../navigation/settings-setting-reveal'
import { nextSettingsSettingRequest } from '../navigation/settings-setting-request'
import type { SettingsSectionLayout } from '../section-layout/SettingsSection'
import type { SettingsSearchResult } from '../search/SettingsSearchResults'
import type { SettingsAttentionItem } from '../overview/SettingsOverviewPane'
import { translate } from '@/i18n/i18n'

export function useSettingsNavigationActions(
  model: Pick<
    SettingsStoreModel,
    | 'activeSectionId'
    | 'setActiveSectionId'
    | 'setPendingNavRequestTick'
    | 'setSettingRequest'
    | 'setSettingsSearchQuery'
    | 'settingsSearchQuery'
    | 'releaseNativeAccounts'
  >,
  interactions: SettingsInteractionController,
  navigation: Pick<SettingsNavigationModel, 'destinations'>
) {
  const {
    activeSectionId,
    setActiveSectionId,
    setPendingNavRequestTick,
    setSettingRequest,
    setSettingsSearchQuery,
    settingsSearchQuery,
    releaseNativeAccounts
  } = model
  const {
    confirmDiscardSourceControlAiPromptChanges,
    contentScrollRef,
    pendingNavSectionRef,
    pendingScrollTargetRef
  } = interactions
  const { destinations } = navigation
  const cancelRevealRef = useRef<(() => void) | null>(null)
  useEffect(() => () => cancelRevealRef.current?.(), [])

  /** Shows a section, and scrolls to a setting inside it when one is named. Resolves false when the user chose to stay with unsaved edits. */
  const openSection = useCallback(
    async (sectionId: string, setting?: { targetId?: string; title: string }): Promise<boolean> => {
      if (sectionId !== activeSectionId && !(await confirmDiscardSourceControlAiPromptChanges())) {
        return false
      }
      cancelRevealRef.current?.()
      cancelRevealRef.current = null
      const container = contentScrollRef.current
      if (container) {
        container.scrollTo({ top: 0 })
      }
      if (settingsSearchQuery.trim() !== '') {
        // Search shows results in place of the page; picking a place ends the search.
        setSettingsSearchQuery('')
      }
      releaseNativeAccounts()
      setActiveSectionId(sectionId)
      if (setting) {
        setSettingRequest((previous) =>
          nextSettingsSettingRequest(previous, { sectionId, ...setting })
        )
      }
      const tabSectionIds = locateSettingsSection(destinations, sectionId)?.tab.sectionIds ?? []
      // A page opens at its top; only a section stacked lower, or a named setting, needs a scroll.
      if (setting || tabSectionIds.indexOf(sectionId) > 0) {
        cancelRevealRef.current = revealInSettings(container, { sectionId, setting })
      }
      return true
    },
    [
      activeSectionId,
      releaseNativeAccounts,
      confirmDiscardSourceControlAiPromptChanges,
      contentScrollRef,
      destinations,
      setActiveSectionId,
      setSettingRequest,
      setSettingsSearchQuery,
      settingsSearchQuery
    ]
  )

  const scrollToSection = useCallback(
    (sectionId: string): Promise<boolean> => openSection(sectionId),
    [openSection]
  )

  const openSearchResult = useCallback(
    (result: SettingsSearchResult): Promise<boolean> =>
      openSection(
        result.sectionId,
        result.isSection ? undefined : { targetId: result.targetId, title: result.title }
      ),
    [openSection]
  )

  const openComputerUseFromBrowser = useCallback(async () => {
    if (!(await confirmDiscardSourceControlAiPromptChanges())) {
      return
    }
    pendingNavSectionRef.current = 'computer-use'
    pendingScrollTargetRef.current = 'computer-use'
    if (settingsSearchQuery !== '') {
      setSettingsSearchQuery('')
      return
    }
    // Pending refs cannot schedule the jump effect; trigger a render.
    setPendingNavRequestTick((tick) => tick + 1)
  }, [
    confirmDiscardSourceControlAiPromptChanges,
    pendingNavSectionRef,
    pendingScrollTargetRef,
    setPendingNavRequestTick,
    setSettingsSearchQuery,
    settingsSearchQuery
  ])

  return { scrollToSection, openSearchResult, openComputerUseFromBrowser }
}

export type SettingsNavigationActions = ReturnType<typeof useSettingsNavigationActions>

const NO_SECTIONS: ReadonlySet<string> = new Set()

export function buildSettingsViewModel(
  model: SettingsStoreModel,
  navigation: SettingsNavigationModel
) {
  const { activeLocation, destinations, navSectionById, navSections } = navigation
  const isSearching = model.settingsSearchQuery.trim() !== ''
  const sectionNeedsAttention = (sectionId: string): boolean => {
    const status = navSectionById.get(sectionId)?.installStatus
    return status === 'update-available' || status === 'needs-attention'
  }
  const toRailItem = (destination: SettingsDestination): SettingsRailItem => ({
    id: destination.id,
    title: destination.title,
    sectionId: destination.tabs[0].sectionIds[0],
    // Search results stand in for the page, so nothing in the list is current.
    isActive: !isSearching && activeLocation?.destination.id === destination.id,
    needsAttention: destination.tabs.some((tab) => tab.sectionIds.some(sectionNeedsAttention))
  })
  const attentionItems: SettingsAttentionItem[] = destinations.flatMap((destination) =>
    destination.tabs.flatMap((tab) =>
      tab.sectionIds.flatMap((sectionId) => {
        const section = navSectionById.get(sectionId)
        const status = section?.installStatus
        return section && (status === 'update-available' || status === 'needs-attention')
          ? [
              {
                sectionId,
                title: section.title,
                path:
                  destination.tabs.length > 1
                    ? `${destination.title} \u203a ${tab.title}`
                    : destination.title,
                status
              }
            ]
          : []
      })
    )
  )
  const leadingRailItems = destinations
    .filter((destination) => destination.group === null)
    .map(toRailItem)
  const railGroups: SettingsRailGroup[] = getSettingsDestinationGroups()
    .map((group) => ({
      id: group.id,
      title: group.title,
      items: destinations.filter((destination) => destination.group === group.id).map(toRailItem)
    }))
    .filter((group) => group.items.length > 0)
  const railProjects: SettingsRailProject[] = navSections
    .filter((section) => section.id.startsWith('repo-'))
    .map((section) => {
      const repo = model.repos.find((entry) => entry.id === section.id.replace('repo-', ''))
      return {
        id: section.id,
        title: section.title,
        sectionId: section.id,
        isActive: !isSearching && model.activeSectionId === section.id,
        needsAttention: false,
        badgeColor: repo?.badgeColor,
        isRemote: !!repo?.connectionId,
        repoIcon: repo?.repoIcon,
        upstream: repo?.upstream
      }
    })

  // A page that is one section shows that section's own header; any other gets a page header above its tabs.
  const pageDestination =
    !isSearching && activeLocation && !isSingleSectionDestination(activeLocation.destination)
      ? activeLocation.destination
      : null
  const activeTabId = activeLocation?.tab.id ?? ''
  const tabIdsNeedingAttention = new Set(
    (pageDestination?.tabs ?? [])
      .filter((tab) => tab.sectionIds.some(sectionNeedsAttention))
      .map((tab) => tab.id)
  )
  const sectionLayout: SettingsSectionLayout = isSearching
    ? { visibleSectionIds: NO_SECTIONS, headerStyle: 'page' }
    : activeLocation
      ? {
          visibleSectionIds: new Set(activeLocation.tab.sectionIds),
          headerStyle: !pageDestination
            ? 'page'
            : activeLocation.tab.sectionIds.length > 1
              ? 'stacked'
              : 'tab',
          pageTitle: pageDestination ? undefined : activeLocation.destination.title
        }
      : { visibleSectionIds: new Set([model.activeSectionId]), headerStyle: 'page' }

  const projectsLabel = translate('auto.components.settings.SettingsSidebar.5c9669ff9c', 'Projects')
  const searchResults: SettingsSearchResult[] = navigation.searchHits.map((hit, index) => {
    const location = destinations
      .flatMap((destination) => destination.tabs.map((tab) => ({ destination, tab })))
      .find(({ tab }) => tab.sectionIds.includes(hit.sectionId))
    const sectionTitle = navSectionById.get(hit.sectionId)?.title ?? ''
    const path = location
      ? [
          location.destination.title,
          location.destination.tabs.length > 1 ? location.tab.title : null,
          // A stacked section is named so the row can be found on its page.
          location.tab.sectionIds.length > 1 && !hit.isSection ? sectionTitle : null
        ]
          .filter((part) => part !== null && part !== '')
          .join(' \u203a ')
      : hit.isSection
        ? projectsLabel
        : `${projectsLabel} \u203a ${sectionTitle}`
    return {
      key: `${hit.sectionId}:${index}`,
      title: hit.entry.title,
      description: hit.entry.description,
      path,
      sectionId: hit.sectionId,
      targetId: hit.entry.targetSectionId,
      isSection: hit.isSection
    }
  })

  const isSectionMounted = (sectionId: string): boolean =>
    navigation.neededSectionIds.has(sectionId)
  const isFocusedShortcutsPane = model.activeSectionId === 'shortcuts' && !isSearching
  // The setup checklist and Connections (its plugin catalog) lay out as wide grids. Why Connections as a
  // whole: the page must not change width when its tab does.
  const isWidePane =
    !isSearching &&
    (model.activeSectionId === 'setup-guide' || activeLocation?.destination.id === 'connections')

  return {
    isSearching,
    leadingRailItems,
    railGroups,
    railProjects,
    pageDestination,
    activeTabId,
    tabIdsNeedingAttention,
    sectionLayout,
    searchResults,
    attentionItems,
    isSectionMounted,
    isFocusedShortcutsPane,
    isWidePane
  }
}

export type SettingsViewModel = ReturnType<typeof buildSettingsViewModel>

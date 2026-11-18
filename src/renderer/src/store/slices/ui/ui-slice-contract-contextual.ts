import type { PersistedTrustedMarkovHooks } from '../../../../../shared/markov-yaml-hook-types'
import type {
  FeatureInteractionId,
  FeatureInteractionState
} from '../../../../../shared/feature-interactions'
import type { FeatureTipId } from '../../../../../shared/feature-tips'
import type { ChatUiLaunchTipVariant } from '../../../../../shared/native-chat/chat-ui-launch-tip-audience'
import type { ContextualTourId } from '../../../../../shared/contextual-tours'
import type { MarkovHookScriptKind } from '../../../lib/markov-hook-trust'
import type { SettingsNavigationTarget } from '../../../lib/settings-navigation-types'
import type { ExecutionHostId } from '../../../../../shared/execution-host'
import type { SettingsTabsByWorktree } from '../../../lib/settings-tab-placement'

export type UISliceContextual = {
  /** Opens Settings as a tab of the workspace on screen, or as a page when no workspace can hold one. */
  openSettingsPage: () => void
  closeSettingsPage: () => void
  /** Each workspace's Settings tab. Renderer-only: kept out of the workspace layout and its sync. */
  settingsTabsByWorktree: SettingsTabsByWorktree
  /** Brings a workspace's open Settings tab back over its group's active tab. */
  showSettingsTab: (worktreeId: string) => void
  /** Places the tab after a drop; `visualOrder` is the target group's order with the Settings tab id in it. */
  placeSettingsTab: (worktreeId: string, groupId: string, visualOrder: readonly string[]) => void
  setSettingsTabPinned: (worktreeId: string, isPinned: boolean) => void
  settingsNavigationTarget: SettingsNavigationTarget | null
  openSettingsTarget: (target: NonNullable<UISliceContextual['settingsNavigationTarget']>) => void
  clearSettingsTarget: () => void
  /** Entry keys retain last-pick order so regrouping resolves aliases. Renderer-only; never persisted. */
  settingsProjectHostSelection: Record<string, ExecutionHostId>
  settingsProjectSetupSelection: Record<string, string>
  setSettingsProjectHostSelection: (
    selectionKey: string,
    hostId: ExecutionHostId,
    setupId?: string
  ) => void
  activeModal:
    | 'none'
    | 'create-worktree'
    | 'edit-meta'
    | 'delete-worktree'
    | 'preserved-branch-review'
    | 'forget-ssh-workspace'
    | 'confirm-add-project-from-folder'
    | 'confirm-non-git-folder'
    | 'confirm-remove-folder'
    | 'confirm-sleep-twin'
    | 'add-repo'
    | 'quick-open'
    | 'worktree-palette'
    | 'workspace-cleanup'
    | 'project-added'
    | 'worktree-visibility'
    | 'setup-guide'
    | 'feature-wall'
    | 'feature-tips'
    | 'new-workspace-composer'
    | 'confirm-markov-yaml-hooks'
    | 'diagram-viewer'
    | 'agent-session-history'
    | 'chat-account-usage'
    | 'node-dist-mirror'
  modalData: Record<string, unknown>
  openModal: (modal: UISliceContextual['activeModal'], data?: Record<string, unknown>) => void
  closeModal: () => void
  featureTipsSeenIds: FeatureTipId[]
  markFeatureTipsSeen: (ids: FeatureTipId[]) => void
  /** Main's once-decided Chat UI launch tip variant; null until read. */
  chatUiLaunchTipVariant: ChatUiLaunchTipVariant | null
  setChatUiLaunchTipVariant: (variant: ChatUiLaunchTipVariant) => void
  featureInteractions: FeatureInteractionState
  recordFeatureInteraction: (id: FeatureInteractionId) => Promise<void>
  contextualToursSeenIds: ContextualTourId[]
  contextualToursAutoEligible: boolean | null
  activeContextualTourId: ContextualTourId | null
  activeContextualTourStepIndex: number
  activeContextualTourSource: string | null
  activeContextualTourSourceDetached: boolean
  activeContextualTourWasFeaturePreviouslyInteracted: boolean
  contextualTourNavigationInteractionSnapshot: Partial<Record<ContextualTourId, boolean>>
  activeContextualTourSuppressed: boolean
  // Tours started this app session. Only one informational tour may start per session; an
  // unfinished action tour started here is paused, not over.
  contextualToursStartedThisSession: ContextualTourId[]
  contextualToursOnboardingVisible: boolean
  contextualToursBlockingSurfaceVisible: boolean
  lastCompletedContextualTourId: ContextualTourId | null
  setContextualToursAutoEligible: (eligible: boolean) => void
  setContextualToursOnboardingVisible: (visible: boolean) => void
  setContextualToursBlockingSurfaceVisible: (visible: boolean) => void
  requestContextualTour: (
    id: ContextualTourId,
    source: string,
    wasFeaturePreviouslyInteracted?: boolean,
    options?: { force?: boolean }
  ) => void
  suppressContextualTour: (id: ContextualTourId, source: string) => void
  detachContextualTourSource: (id: ContextualTourId, source: string) => void
  advanceContextualTour: () => void
  regressContextualTour: () => void
  dismissContextualTour: (id?: ContextualTourId) => void
  completeContextualTour: (id?: ContextualTourId) => void
  cancelContextualTour: (id?: ContextualTourId) => void
  markContextualToursSeen: (ids: ContextualTourId[]) => void
  trustedMarkovHooks: PersistedTrustedMarkovHooks
  markMarkovHookScriptConfirmed: (
    repoId: string,
    kind: MarkovHookScriptKind,
    contentHash: string
  ) => void
  markMarkovHookRepoAlwaysTrusted: (repoId: string) => void
  clearMarkovHookTrustForRepo: (repoId: string) => void
  setupScriptPromptDismissedRepoIds: readonly string[]
  dismissSetupScriptPrompt: (repoHostIdentity: string) => void
  setupGuideSidebarDismissed: boolean
  setSetupGuideSidebarDismissed: (dismissed: boolean) => void
  setupGuideBrowserMilestoneMigrated: boolean
  setupGuideBrowserMilestoneLegacyComplete: boolean
  markSetupGuideBrowserMilestoneMigrated: (legacyComplete: boolean) => void
  browserImportHintHidden: boolean
  setBrowserImportHintHidden: (hidden: boolean) => void
  mobileEmulatorTabIntroDismissed: boolean
  dismissMobileEmulatorTabIntro: () => void
  mobileEmulatorAgentSetupDismissed: boolean
  dismissMobileEmulatorAgentSetup: () => void
  projectOrderManualDefaultNoticeDismissed: boolean
  dismissProjectOrderManualDefaultNotice: () => void
  usagePercentageDisplayChangeNoticeDismissed: boolean
  dismissUsagePercentageDisplayChangeNotice: () => void
  statusBarCompactChangeNoticeDismissed: boolean
  dismissStatusBarCompactChangeNotice: () => void
  usageEmptyStateDismissed: boolean
  dismissUsageEmptyState: () => void
  pluginsAlphaNoticeDismissed: boolean
  dismissPluginsAlphaNotice: () => void
  codexTerminalServerIsolationNoticeSeen: boolean
  markCodexTerminalServerIsolationNoticeSeen: () => void
  codexSharedSettingsNoticeSeen: boolean
  markCodexSharedSettingsNoticeSeen: () => void
  claudeDiffPanelNoticeSeen: boolean
  markClaudeDiffPanelNoticeSeen: () => void
}

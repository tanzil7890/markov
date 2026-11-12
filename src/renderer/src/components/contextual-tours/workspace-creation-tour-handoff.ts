import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getContextualTour } from '../../../../shared/contextual-tours'
import { requestContextualTourWhenReady } from './request-contextual-tour-when-ready'

/** True while the agent-sessions tour points at a create-workspace control. */
export function isCreateWorkspaceTourStepActive(
  state: Pick<AppState, 'activeContextualTourId' | 'activeContextualTourStepIndex'>
): boolean {
  return (
    state.activeContextualTourId === 'workspace-agent-sessions' &&
    getContextualTour('workspace-agent-sessions').steps[state.activeContextualTourStepIndex]?.id ===
      'agent-sessions-parallel'
  )
}

export function openWorkspaceCreationComposerWithTourHandoff(
  seed: Record<string, unknown> = {}
): void {
  const state = useAppStore.getState()
  const hasProjects = state.repos.length > 0

  const shouldHandoffFromAgentSessionsTour = hasProjects && isCreateWorkspaceTourStepActive(state)

  if (shouldHandoffFromAgentSessionsTour && state.activeContextualTourSource) {
    // Complete the final create-button action synchronously so modal cancellation cannot block the composer tour handoff.
    state.detachContextualTourSource('workspace-agent-sessions', state.activeContextualTourSource)
    state.completeContextualTour('workspace-agent-sessions')
  }

  state.openModal('new-workspace-composer', {
    ...seed,
    telemetrySource: 'sidebar',
    ...(shouldHandoffFromAgentSessionsTour
      ? { contextualTourSource: 'workspace_creation_modal' }
      : {})
  })

  if (!shouldHandoffFromAgentSessionsTour) {
    return
  }

  if (state.contextualToursSeenIds.includes('workspace-creation')) {
    return
  }

  requestContextualTourWhenReady({
    id: 'workspace-creation',
    source: 'workspace_creation_modal',
    wasFeaturePreviouslyInteracted: false,
    waitForActiveTourToClear: true,
    shouldContinue: () => useAppStore.getState().activeModal === 'new-workspace-composer'
  })
}

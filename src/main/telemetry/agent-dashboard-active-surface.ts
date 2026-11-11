import type { AgentDashboardSurface } from '../../shared/telemetry-agent-dashboard-event-schemas'

export function agentDashboardActiveSurface(props: unknown): AgentDashboardSurface | null {
  if (!props || typeof props !== 'object' || !('surface' in props)) {
    return null
  }
  const surface = props.surface
  return surface === 'in_window' || surface === 'popout' ? surface : null
}

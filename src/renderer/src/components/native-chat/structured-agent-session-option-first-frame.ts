import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import { structuredAgentSessionSeedCatalog } from '../../../../shared/agent-session/options/structured-agent-session-seed-catalog'
import {
  applyStructuredAgentSessionModelCatalog,
  createStructuredAgentSessionOptionState,
  type StructuredAgentSessionOptionState
} from '../../../../shared/agent-session/options/structured-agent-session-options'
import { structuredAgentSessionOptionSnapshot } from '../../../../shared/agent-session/options/structured-agent-session-option-snapshot'
import type { SessionOptionSelectChoice } from '../../../../shared/native-chat/input/native-chat-session-options'
import { readHostModelCatalogSnapshot } from '@/runtime/host-model-catalog-snapshots'

/** The first frame: the host's saved list when the renderer already holds it, else the seed,
 *  which shows the quiet placeholder until the host answers. */
export function firstFrameOptionState(
  agent: AgentType,
  target: RuntimeClientTarget,
  launch: { newLaunch: boolean; worktree?: string; seedsModel: boolean }
): StructuredAgentSessionOptionState {
  const seed = structuredAgentSessionSeedCatalog(agent)
  const seeded = createStructuredAgentSessionOptionState(agent, seed)
  const snapshot = readHostModelCatalogSnapshot(target, agent, launch)
  return snapshot ? applyStructuredAgentSessionModelCatalog(seeded, seed, snapshot, launch) : seeded
}

/** The models a new chat of this agent would list, from what the host already answered; none before it has. */
export function firstFrameModelChoices(
  agent: AgentType,
  target: RuntimeClientTarget,
  worktree: string | undefined
): SessionOptionSelectChoice[] {
  const state = firstFrameOptionState(agent, target, {
    newLaunch: true,
    worktree,
    seedsModel: true
  })
  const model = structuredAgentSessionOptionSnapshot(state).find(
    (descriptor) => descriptor.category === 'model'
  )
  return model?.kind.type === 'select' && !model.action ? model.kind.choices : []
}

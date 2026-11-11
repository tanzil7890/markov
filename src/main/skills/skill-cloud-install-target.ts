import type { SkillInstallDestination } from '../../shared/skill-install-contract'
import type { MarkovRuntimeService } from '../runtime/markov-runtime'

export async function classifySkillCloudInstallTarget(
  runtime: MarkovRuntimeService,
  input: { environmentId?: string; destination: SkillInstallDestination }
): Promise<'local' | 'remote'> {
  return input.environmentId || (await runtime.skillInstallDestinationUsesSsh(input.destination))
    ? 'remote'
    : 'local'
}

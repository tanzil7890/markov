import { isPluginInstallLinkArgument } from '../../shared/plugins/catalog/plugin-install-link'
import { parseSkillShareId } from '../../shared/skill-share-link'

/** macOS open-url: claim only links Markov routes, so other schemes keep their default handling. */
export function isRoutedMarkovDeepLink(url: string): boolean {
  return parseSkillShareId(url) !== null || isPluginInstallLinkArgument(url)
}

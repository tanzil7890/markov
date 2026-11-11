import { stripCredentialsFromMessage } from './git/remotes/git-remote-error'
import type { MarkovVmRecipe } from './markov-yaml-hook-types'

export function getProvisionedRootRecipeRepoUrl(
  checkoutMode: MarkovVmRecipe['checkoutMode'],
  remoteUrl: string | undefined
): string | undefined {
  if (checkoutMode !== 'provisioned-root' || !remoteUrl) {
    return undefined
  }
  return stripCredentialsFromMessage(remoteUrl)
}

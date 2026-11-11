import type {
  MarkovCloudCapabilities,
  MarkovCloudOrgSummary,
  MarkovProfileCloudSummary
} from '../../shared/markov-profiles'

export type MarkovCloudSessionExchangeResponse = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  cloud: MarkovProfileCloudSummary
  organizations?: MarkovCloudOrgSummary[]
  capabilities: MarkovCloudCapabilities
}

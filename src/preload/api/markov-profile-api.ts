import type {
  MarkovCloudSignInProgress,
  ConnectCurrentMarkovProfileResult,
  CreateCloudLinkedMarkovProfileArgs,
  CreateCloudLinkedMarkovProfileResult,
  CreateLocalMarkovProfileArgs,
  CreateLocalMarkovProfileResult,
  FindMarkovProfileProjectsByPathArgs,
  FindMarkovProfileProjectsByPathResult,
  MarkovProfileAuthStatus,
  MarkovProfileListResult,
  MarkovProfileOrgInviteRevokeArgs,
  MarkovProfileOrgMemberChangeRoleArgs,
  MarkovProfileOrgMemberInviteArgs,
  MarkovProfileOrgMemberMutationResult,
  MarkovProfileOrgMemberRemoveArgs,
  MarkovProfileOrgMembersListArgs,
  MarkovProfileOrgMembersListResult,
  RefreshCurrentMarkovProfileAuthResult,
  SelectMarkovProfileOrgArgs,
  SelectMarkovProfileOrgResult,
  SignOutCurrentMarkovProfileResult,
  SwitchMarkovProfileArgs,
  SwitchMarkovProfileResult,
  TransferMarkovProfileProjectArgs,
  TransferMarkovProfileProjectResult
} from '../../shared/markov-profiles'

export type MarkovProfileApi = {
  list: () => Promise<MarkovProfileListResult>
  authStatus: () => Promise<MarkovProfileAuthStatus>
  /** Fires when main changed the stored auth status on its own (e.g. a revoked session). */
  onAuthStatusChanged: (callback: () => void) => () => void
  createLocal: (args?: CreateLocalMarkovProfileArgs) => Promise<CreateLocalMarkovProfileResult>
  createCloudLinked: (
    args?: CreateCloudLinkedMarkovProfileArgs
  ) => Promise<CreateCloudLinkedMarkovProfileResult>
  switchProfile: (args: SwitchMarkovProfileArgs) => Promise<SwitchMarkovProfileResult>
  transferProject: (
    args: TransferMarkovProfileProjectArgs
  ) => Promise<TransferMarkovProfileProjectResult>
  findProjectProfiles: (
    args: FindMarkovProfileProjectsByPathArgs
  ) => Promise<FindMarkovProfileProjectsByPathResult>
  connectCurrent: () => Promise<ConnectCurrentMarkovProfileResult>
  signInProgress: () => Promise<MarkovCloudSignInProgress | null>
  onSignInProgressChanged: (
    callback: (progress: MarkovCloudSignInProgress | null) => void
  ) => () => void
  cancelSignIn: () => Promise<void>
  refreshAuth: () => Promise<RefreshCurrentMarkovProfileAuthResult>
  signOutCurrent: () => Promise<SignOutCurrentMarkovProfileResult>
  selectOrg: (args: SelectMarkovProfileOrgArgs) => Promise<SelectMarkovProfileOrgResult>
  orgMembersList: (
    args: MarkovProfileOrgMembersListArgs
  ) => Promise<MarkovProfileOrgMembersListResult>
  orgMemberInvite: (
    args: MarkovProfileOrgMemberInviteArgs
  ) => Promise<MarkovProfileOrgMemberMutationResult>
  orgInviteRevoke: (
    args: MarkovProfileOrgInviteRevokeArgs
  ) => Promise<MarkovProfileOrgMemberMutationResult>
  orgMemberChangeRole: (
    args: MarkovProfileOrgMemberChangeRoleArgs
  ) => Promise<MarkovProfileOrgMemberMutationResult>
  orgMemberRemove: (
    args: MarkovProfileOrgMemberRemoveArgs
  ) => Promise<MarkovProfileOrgMemberMutationResult>
}

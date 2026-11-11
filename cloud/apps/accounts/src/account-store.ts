import type { CloudDatabase } from '@markov-cloud/cloud-database'
import type { VerifiedIdentity } from './identity/identity-provider.js'
import { createId } from './opaque-token.js'
import { rowNumber, rowOptionalString, rowString } from './sql-row.js'
import type { OrganizationSummary } from './desktop-auth-contract.js'

export type AccountUser = {
  userId: string
  provider: string
  externalId: string
  email: string
  displayName: string | null
  syncedAt: number
}

export type AccountProfile = {
  profileId: string
  userId: string
  localProfileId: string | null
  name: string | null
  activeOrgId: string | null
  linkedAt: number
}

function toUser(row: Record<string, unknown>): AccountUser {
  return {
    userId: rowString(row.user_id),
    provider: rowString(row.provider),
    externalId: rowString(row.external_id),
    email: rowString(row.email),
    displayName: rowOptionalString(row.display_name),
    syncedAt: rowNumber(row.synced_at)
  }
}

function toProfile(row: Record<string, unknown>): AccountProfile {
  return {
    profileId: rowString(row.profile_id),
    userId: rowString(row.user_id),
    localProfileId: rowOptionalString(row.local_profile_id),
    name: rowOptionalString(row.name),
    activeOrgId: rowOptionalString(row.active_org_id),
    linkedAt: rowNumber(row.linked_at)
  }
}

export class AccountStore {
  constructor(
    private readonly database: CloudDatabase,
    private readonly now: () => number
  ) {}

  // Own ids keep users portable if the identity provider ever changes.
  async upsertIdentity(identity: VerifiedIdentity): Promise<AccountUser> {
    const now = this.now()
    return await this.database.transaction(async (tx) => {
      const [existing] = await tx.query(
        'SELECT * FROM accounts_users WHERE provider = ? AND external_id = ?',
        [identity.provider, identity.externalId]
      )
      const userId = existing ? rowString(existing.user_id) : createId('usr')
      if (existing) {
        await tx.query(
          'UPDATE accounts_users SET email = ?, display_name = ?, synced_at = ? WHERE user_id = ?',
          [identity.email, identity.displayName ?? null, now, userId]
        )
      } else {
        await tx.query(
          `INSERT INTO accounts_users (user_id, provider, external_id, email, display_name, synced_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, identity.provider, identity.externalId, identity.email, identity.displayName ?? null, now, now]
        )
      }
      await tx.query('DELETE FROM accounts_memberships WHERE user_id = ?', [userId])
      for (const organization of identity.organizations) {
        await tx.query(
          'INSERT INTO accounts_memberships (user_id, org_id, org_name, role) VALUES (?, ?, ?, ?)',
          [userId, organization.orgId, organization.name, organization.role ?? null]
        )
      }
      const [row] = await tx.query('SELECT * FROM accounts_users WHERE user_id = ?', [userId])
      return toUser(row!)
    })
  }

  async getUser(userId: string): Promise<AccountUser | null> {
    const [row] = await this.database.query('SELECT * FROM accounts_users WHERE user_id = ?', [userId])
    return row ? toUser(row) : null
  }

  async listOrganizations(userId: string): Promise<OrganizationSummary[]> {
    const rows = await this.database.query(
      'SELECT org_id, org_name, role FROM accounts_memberships WHERE user_id = ? ORDER BY org_name, org_id',
      [userId]
    )
    return rows.map((row) => {
      const role = rowOptionalString(row.role)
      return {
        orgId: rowString(row.org_id),
        name: rowString(row.org_name),
        ...(role ? { role } : {})
      }
    })
  }

  async findOrCreateLinkedProfile(userId: string, localProfileId: string | null): Promise<AccountProfile> {
    if (localProfileId) {
      const [row] = await this.database.query(
        'SELECT * FROM accounts_profiles WHERE user_id = ? AND local_profile_id = ? ORDER BY linked_at LIMIT 1',
        [userId, localProfileId]
      )
      if (row) return toProfile(row)
    }
    return await this.createProfile(userId, { localProfileId, name: null, activeOrgId: null })
  }

  async createProfile(
    userId: string,
    input: { localProfileId: string | null; name: string | null; activeOrgId: string | null }
  ): Promise<AccountProfile> {
    const profileId = createId('prf')
    await this.database.query(
      `INSERT INTO accounts_profiles (profile_id, user_id, local_profile_id, name, active_org_id, linked_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [profileId, userId, input.localProfileId, input.name, input.activeOrgId, this.now()]
    )
    return (await this.getProfile(profileId))!
  }

  async getProfile(profileId: string): Promise<AccountProfile | null> {
    const [row] = await this.database.query('SELECT * FROM accounts_profiles WHERE profile_id = ?', [profileId])
    return row ? toProfile(row) : null
  }

  async setActiveOrg(profileId: string, orgId: string): Promise<void> {
    await this.database.query('UPDATE accounts_profiles SET active_org_id = ? WHERE profile_id = ?', [
      orgId,
      profileId
    ])
  }
}

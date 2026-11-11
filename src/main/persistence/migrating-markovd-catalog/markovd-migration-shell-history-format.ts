// The JSON header carries the unhashed worktree ID needed for history GC; raw history follows.
import { z } from 'zod'
import { MARKOVD_MIGRATION_BLOB_KIND_CONTRACTS } from '../../../shared/markovd-migration/markovd-migration-blob-transfer'
import { hashWorktreeId } from '../../pty/history/terminal-history-id'

// fish history lives outside Markov's store and cannot migrate.
export const MARKOVD_MIGRATION_SHELL_HISTORY_SHELLS = ['zsh', 'bash'] as const

export type MarkovdMigrationShellHistoryShell =
  (typeof MARKOVD_MIGRATION_SHELL_HISTORY_SHELLS)[number]

export const MARKOVD_MIGRATION_SHELL_HISTORY_VERSION = 1
/** Bound header scanning; worktree IDs contain a repo ID and path. */
export const MARKOVD_MIGRATION_SHELL_HISTORY_HEADER_SCAN_BYTES = 16 * 1024
const NEWLINE = 0x0a

const HeaderSchema = z.object({
  version: z.literal(MARKOVD_MIGRATION_SHELL_HISTORY_VERSION),
  worktreeId: z.string().min(1),
  loginShell: z.literal(true).optional()
})

export const MAX_MARKOVD_MIGRATION_SHELL_HISTORY_BYTES =
  MARKOVD_MIGRATION_BLOB_KIND_CONTRACTS['shell-history'].maxBytes

export type MarkovdMigrationShellHistoryKey = {
  worktreeHash: string
  shell: MarkovdMigrationShellHistoryShell
}

export type MarkovdMigrationShellHistoryHeader = {
  worktreeId: string
  /** WSL bridge history uses bash_history for the distro login shell when no zsh sibling exists. */
  loginShell: boolean
  byteLength: number
}

export function markovdMigrationShellHistoryKey(
  worktreeId: string,
  shell: MarkovdMigrationShellHistoryShell
): string {
  return `${hashWorktreeId(worktreeId)}-${shell}`
}

export function shellHistoryFileName(shell: MarkovdMigrationShellHistoryShell): string {
  return `${shell}_history`
}

export function parseMarkovdMigrationShellHistoryKey(key: string): MarkovdMigrationShellHistoryKey {
  if (!MARKOVD_MIGRATION_BLOB_KIND_CONTRACTS['shell-history'].key.test(key)) {
    throw new Error('markovd_migration_shell_history_key_invalid')
  }
  const [worktreeHash, shell] = key.split('-')
  const supported = MARKOVD_MIGRATION_SHELL_HISTORY_SHELLS.find((entry) => entry === shell)
  if (!supported) {
    throw new Error('markovd_migration_shell_history_shell_unsupported')
  }
  return { worktreeHash, shell: supported }
}

export function encodeMarkovdMigrationShellHistoryHeader(
  worktreeId: string,
  options: { loginShell?: boolean } = {}
): Buffer {
  const document = {
    version: MARKOVD_MIGRATION_SHELL_HISTORY_VERSION,
    worktreeId,
    ...(options.loginShell ? { loginShell: true } : {})
  }
  const header = Buffer.from(`${JSON.stringify(document)}\n`, 'utf8')
  if (header.length > MARKOVD_MIGRATION_SHELL_HISTORY_HEADER_SCAN_BYTES) {
    throw new Error('markovd_migration_shell_history_worktree_id_too_long')
  }
  return header
}

/** Verify the header matches the hashed key; totalBytes includes the header and must leave history bytes. */
export function parseMarkovdMigrationShellHistoryHeader(
  key: string,
  head: Buffer,
  totalBytes: number
): MarkovdMigrationShellHistoryHeader {
  const parsedKey = parseMarkovdMigrationShellHistoryKey(key)
  const end = head.subarray(0, MARKOVD_MIGRATION_SHELL_HISTORY_HEADER_SCAN_BYTES).indexOf(NEWLINE)
  if (end === -1) {
    throw new Error('markovd_migration_shell_history_header_invalid')
  }
  const { worktreeId, loginShell } = parseHeaderLine(head.subarray(0, end))
  if (hashWorktreeId(worktreeId) !== parsedKey.worktreeHash) {
    throw new Error('markovd_migration_shell_history_key_mismatch')
  }
  const byteLength = end + 1
  if (totalBytes <= byteLength) {
    throw new Error('markovd_migration_shell_history_empty')
  }
  return { worktreeId, loginShell, byteLength }
}

function parseHeaderLine(line: Buffer): { worktreeId: string; loginShell: boolean } {
  try {
    const parsed = HeaderSchema.safeParse(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line))
    )
    if (parsed.success) {
      return { worktreeId: parsed.data.worktreeId, loginShell: parsed.data.loginShell === true }
    }
  } catch {
    // Not UTF-8 JSON; refused below like any other malformed header.
  }
  throw new Error('markovd_migration_shell_history_header_invalid')
}

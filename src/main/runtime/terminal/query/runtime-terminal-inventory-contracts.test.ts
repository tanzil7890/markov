import { registerTerminalListExecutionHostScopeTests } from './terminal-list-execution-host-scope.spec'
import { registerPtyInventoryLivenessVerdictTests } from '../../markov-runtime-tests/pty-inventory-liveness-verdict.spec'
import { registerSessionTabsEmptyWorktreePublicationTests } from '../../markov-runtime-tests/session-tabs-empty-worktree-publication.spec'

registerTerminalListExecutionHostScopeTests()
registerPtyInventoryLivenessVerdictTests()
registerSessionTabsEmptyWorktreePublicationTests()

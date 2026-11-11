import Testing
@testable import MarkovComputerUseMacOSCore

@Suite("TrustedMarkovApplication")
struct TrustedMarkovApplicationTests {
    @Test("trusts the packaged app, every dev build and stock Electron")
    func trusted() {
        #expect(TrustedMarkovApplication.isTrusted(bundleId: "com.outhad.markov"))
        // What `pnpm dev` launches as: DEV_BUNDLE_ID in dev-electron-bundle-identity.mjs (#26498).
        #expect(TrustedMarkovApplication.isTrusted(bundleId: "com.outhad.markov.dev"))
        #expect(TrustedMarkovApplication.isTrusted(bundleId: "com.outhad.markov.dev.worktree"))
        #expect(TrustedMarkovApplication.isTrusted(bundleId: "com.github.Electron"))
    }

    @Test("rejects look-alike and unrelated bundle ids")
    func untrusted() {
        #expect(!TrustedMarkovApplication.isTrusted(bundleId: "com.outhad.markov.devtools"))
        #expect(!TrustedMarkovApplication.isTrusted(bundleId: "com.outhad.markovx"))
        #expect(!TrustedMarkovApplication.isTrusted(bundleId: "com.example.markov"))
        #expect(!TrustedMarkovApplication.isTrusted(bundleId: ""))
    }
}

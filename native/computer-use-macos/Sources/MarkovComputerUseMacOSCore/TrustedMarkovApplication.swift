/// Bundle ids of the apps whose computer-use sidecar may drive this helper.
public enum TrustedMarkovApplication {
    public static func isTrusted(bundleId: String) -> Bool {
        // Why: `pnpm dev` launches as `com.outhad.markov.dev` and per-worktree wrapper apps use
        // `com.outhad.markov.dev.<name>`; the sidecar peer check must authorize both (#26498).
        bundleId == "com.outhad.markov" ||
            bundleId == "com.outhad.markov.dev" ||
            bundleId.hasPrefix("com.outhad.markov.dev.") ||
            bundleId == "com.github.Electron"
    }
}

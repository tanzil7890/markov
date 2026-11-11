cask "markov" do
  arch arm: "arm64", intel: "x64"

  version "1.3.24"
  sha256 arm:   "fc707f290ff3b631b7b7947bf339885b61a43d2e89475997c125b61268ed4966",
         intel: "5f677c13a08f7a5740442e29d388285a86488c8c1f7aa5f10a8721a2c6ede8e4"

  url "https://github.com/tanzil7890/markov/releases/download/v#{version}/markov-macos-#{arch}.dmg"
  name "Markov"
  desc "IDE for orchestrating AI coding agents across terminals and worktrees"
  homepage "https://markov.outhad.com/"

  livecheck do
    url :url
    strategy :github_latest
  end

  # Let the in-app updater own updates; Homebrew skips auto_updates unless --greedy.
  auto_updates true
  conflicts_with cask: "markov@rc"
  depends_on macos: :big_sur

  app "Markov.app"

  # Expose the symlink-resolving bundled CLI on PATH so headless hosts can use markov serve without the in-app installer.
  binary "#{appdir}/Markov.app/Contents/Resources/bin/markov"

  # Zap app-created ~/.markov and Electron userData for a clean uninstall.
  zap trash: [
    "~/.markov",
    "~/Library/Application Support/Markov",
    "~/Library/Caches/com.outhad.markov",
    "~/Library/Caches/com.outhad.markov.ShipIt",
    "~/Library/HTTPStorages/com.outhad.markov",
    "~/Library/Preferences/com.outhad.markov.plist",
    "~/Library/Saved Application State/com.outhad.markov.savedState",
  ]
end

cask "markov@rc" do
  arch arm: "arm64", intel: "x64"

  version "1.4.36-rc.3"
  sha256 arm:   "563b6b14323fc9d5489299c82442d514bc12cabffc9d06d3964ed572af4b3955",
         intel: "457088c7021f07de1a419197f7b2bd00092741ad4727d4fef3d86af38a6831e7"

  url "https://github.com/tanzil7890/markov/releases/download/v#{version}/markov-macos-#{arch}.dmg"
  name "Markov RC"
  desc "IDE for orchestrating AI coding agents across terminals and worktrees"
  homepage "https://markov.outhad.com/"

  livecheck do
    url "https://github.com/tanzil7890/markov"
    regex(/^v?(\d+(?:\.\d+)+-rc\.\d+)$/i)
    strategy :github_releases do |json, regex|
      json.map do |release|
        next if release["draft"]
        next unless release["prerelease"]

        match = release["tag_name"]&.match(regex)
        next if match.blank?

        match[1]
      end
    end
  end

  # Use Markov’s prerelease-aware updater between frequent RCs.
  auto_updates true
  conflicts_with cask: "markov"
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

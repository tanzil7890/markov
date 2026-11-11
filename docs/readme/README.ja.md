<h1 align="center">
  <a href="https://markov.outhad.com"><img src="../../resources/build/icon.png" alt="Markov" width="64" valign="middle" /></a> Markov
</h1>

<p align="center">
  <a href="https://github.com/tanzil7890/markov"><img src="https://img.shields.io/github/stars/tanzil7890/markov?style=flat&amp;label=%E2%98%85&amp;color=08C" alt="GitHub スター数" /></a>
  <a href="https://github.com/tanzil7890/markov/releases"><img src="../assets/readme-downloads.svg" alt="全リリースの合計ダウンロード数" /></a>
  <img src="https://img.shields.io/badge/license-MIT-08C?style=flat" alt="ライセンス: MIT" />
  <img src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-4493F8?style=flat-square" alt="対応プラットフォーム: macOS、Windows、Linux" />
</p>

<p align="center">
  <sub><a href="../../README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.pt.md">Português</a> · <a href="README.tr.md">Türkçe</a> · <a href="README.ru.md">Русский</a></sub>
</p>

<p align="center">
  <strong>100x ビルダーのための AI オーケストレーター。</strong><br/>
  Codex、Claude Code、OpenCode、Pi を並べて実行 — それぞれを専用のワークツリーで動かし、1 か所で追跡できます。
</p>

<h3 align="center"><a href="https://markov.outhad.com/download"><ins>Markov をダウンロード</ins></a></h3>

## 機能

<table>
<tr>
<td width="50%" valign="middle">

### モバイル Companion

スマートフォンからエージェントを監視・操作 — エージェントの完了を通知で受け取り、どこからでもフォローアップを送信できます。

[iOS App Store](https://markov.outhad.com/download/ios) · [Android APK](https://markov.outhad.com/download/android) · [ドキュメント →](https://markov.outhad.com/docs/mobile)

</td>
<td width="50%">
  <a href="https://markov.outhad.com/docs/mobile"><picture><source srcset="../assets/readme-features/mobile-companion.webp" type="image/webp"><img src="../assets/readme-features/mobile-companion.poster.jpg" alt="Markov — モバイル Companion" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### 並列ワークツリー

1 つのプロンプトを 5 つのエージェントに展開し、それぞれを独立した git ワークツリーで実行 — 結果を比較して、最良のものをマージできます。

[ドキュメント →](https://markov.outhad.com/docs/model/worktrees)

</td>
<td width="50%">
  <a href="https://markov.outhad.com/docs/model/worktrees"><picture><source srcset="../assets/readme-features/split-anything.webp" type="image/webp"><img src="../assets/readme-features/split-anything.poster.jpg" alt="並列ワークツリーのオーケストレーション" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### ターミナル分割

WebGL レンダリング、無制限の分割、再起動後も残るスクロールバックを備えた Ghostty クラスのターミナル。

[ドキュメント →](https://markov.outhad.com/docs/terminal)

</td>
<td width="50%">
  <a href="https://markov.outhad.com/docs/terminal"><picture><source srcset="../../resources/onboarding/feature-wall/tile-02.webp" type="image/webp"><img src="../../resources/onboarding/feature-wall/tile-02.poster.jpg" alt="ターミナル分割" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### デザインモード

実際の Chromium ウィンドウで任意の UI 要素をクリックすると、その HTML、CSS、切り抜いたスクリーンショットがそのままエージェントのプロンプトに送られます。

[ドキュメント →](https://markov.outhad.com/docs/browser/design-mode)

</td>
<td width="50%">
  <a href="https://markov.outhad.com/docs/browser/design-mode"><picture><source srcset="../assets/readme-features/design-mode.webp" type="image/webp"><img src="../assets/readme-features/design-mode.poster.jpg" alt="組み込みブラウザとデザインモード" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### GitHub &amp; Linear をネイティブに

PR、Issue、プロジェクトボードをアプリ内で閲覧 — 任意のタスクからワークツリーを開き、コンテキストスイッチなしでレビューできます。

[ドキュメント →](https://markov.outhad.com/docs/review/linear)

</td>
<td width="50%">
  <a href="https://markov.outhad.com/docs/review/linear"><picture><source srcset="../../resources/onboarding/feature-wall/tile-03.webp" type="image/webp"><img src="../../resources/onboarding/feature-wall/tile-03.poster.jpg" alt="Markov の GitHub と Linear タスクワークフロー" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### SSH ワークツリー

強力なリモートマシン上でエージェントを実行 — ファイル編集、git、ターミナルをフルに使え、自動再接続とポートフォワーディングも付属します。

[ドキュメント →](https://markov.outhad.com/docs/ssh)

</td>
<td width="50%">
  <a href="https://markov.outhad.com/docs/ssh"><picture><source srcset="../../resources/onboarding/feature-wall/tile-06.webp" type="image/webp"><img src="../../resources/onboarding/feature-wall/tile-06.poster.jpg" alt="SSH 経由のリモートワークツリー" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### AI Diff に注釈

任意の Diff 行にコメントを付けてエージェントへ送り返せます — Markov から離れずにレビュー、編集、コミットまで完結します。

[ドキュメント →](https://markov.outhad.com/docs/review/annotate-ai-diff)

</td>
<td width="50%">
  <a href="https://markov.outhad.com/docs/review/annotate-ai-diff"><picture><source srcset="../assets/readme-features/annotate-ai-diffs.webp" type="image/webp"><img src="../assets/readme-features/annotate-ai-diffs.poster.jpg" alt="AI が生成した Diff への注釈" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### ファイルをエージェントへドラッグ

オートセーブが全面的に効く VS Code のエディタ — ファイルや画像をそのままエージェントのプロンプトへドラッグできます。

[ドキュメント →](https://markov.outhad.com/docs/editing/file-explorer)

</td>
<td width="50%">
  <a href="https://markov.outhad.com/docs/editing/file-explorer"><picture><source srcset="../../resources/onboarding/feature-wall/tile-07.gif" type="image/gif"><img src="../../resources/onboarding/feature-wall/tile-07.poster.jpg" alt="ファイルや画像をエージェントのプロンプトへドラッグ" width="100%" /></picture></a>
</td>
</tr>
<tr>
<td width="50%" valign="middle">

### Markov CLI

エージェント自身も Markov を操作できます — `markov worktree create`、`snapshot`、`click`、`fill` であらゆるワークフローをスクリプト化できます。

[ドキュメント →](https://markov.outhad.com/docs/cli/overview)

</td>
<td width="50%">
  <a href="https://markov.outhad.com/docs/cli/overview"><picture><source srcset="../../resources/onboarding/feature-wall/tile-09.webp" type="image/webp"><img src="../../resources/onboarding/feature-wall/tile-09.poster.jpg" alt="CLI から Markov をスクリプト操作" width="100%" /></picture></a>
</td>
</tr>
</table>

**さらに同梱:**

- **[クイックオープン](https://markov.outhad.com/docs/model/quick-open)** — フローを離れずに、ワークツリー、ファイル、エージェント、コマンド、リポジトリコンテキストを横断検索できます。
- **[アカウント切り替えと使用量トラッキング](https://markov.outhad.com/docs/agents/usage-tracking)** — Claude と Codex の使用量やレート制限のリセットを確認し、再ログインなしでアカウントを切り替えられます。
- **[リッチなリポジトリプレビュー](https://markov.outhad.com/docs/editing/markdown)** — Markdown、画像、PDF、リポジトリ文書をワークスペース内でプレビューできます。
- **[Computer Use](https://markov.outhad.com/docs/cli/computer-use)** — 実際の操作が必要なワークフローでは、エージェントにデスクトップアプリや画面上の UI を操作させられます。
- **[通知と未読ステータス](https://markov.outhad.com/docs/notifications)** — エージェントの完了や要対応をすぐに把握し、スレッドを未読に戻して後で確認できます。
- **その他、まだまだたくさん** — 毎日リリースしているので、このリストは常に追いついていません。本当の機能一覧は[チェンジログ](https://github.com/tanzil7890/markov/releases)です。

---

## 対応するエージェント

**あらゆる CLI エージェント**で動作します — ターミナルで動くものなら、Markov でも動きます。

<p>
  <a href="https://docs.anthropic.com/claude/docs/claude-code"><kbd><img src="../assets/claude-logo.svg" alt="Claude Code logo" width="16" valign="middle" /> Claude Code</kbd></a> &nbsp;
  <a href="https://github.com/openai/codex"><kbd><img src="https://www.google.com/s2/favicons?domain=openai.com&sz=64" alt="Codex logo" width="16" valign="middle" /> Codex</kbd></a> &nbsp;
  <a href="https://x.ai/cli"><kbd><img src="https://www.google.com/s2/favicons?domain=x.ai&sz=64" alt="Grok logo" width="16" valign="middle" /> Grok</kbd></a> &nbsp;
  <a href="https://cursor.com/cli"><kbd><img src="https://www.google.com/s2/favicons?domain=cursor.com&sz=64" alt="Cursor logo" width="16" valign="middle" /> Cursor</kbd></a> &nbsp;
  <a href="https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli"><kbd><img src="https://www.google.com/s2/favicons?domain=github.com&sz=64" alt="GitHub Copilot logo" width="16" valign="middle" /> GitHub Copilot</kbd></a> &nbsp;
  <a href="https://dev.meta.ai/docs/muse-code"><kbd><img src="../../src/shared/agent-icons/muse.png" alt="Muse logo" width="16" valign="middle" /> Muse</kbd></a> &nbsp;
  <a href="https://deepseek-harness.github.io/deepseek-harness/"><kbd><img src="../../src/shared/agent-icons/dsh.png" alt="DeepSeek Harness logo" width="16" valign="middle" /> DeepSeek Harness</kbd></a> &nbsp;
  <a href="https://zcode.z.ai/en/docs"><kbd><img src="../../src/shared/agent-icons/zcode.png" alt="ZCode logo" width="16" valign="middle" /> ZCode</kbd></a> &nbsp;
  <a href="https://opencode.ai/docs/cli/"><kbd><img src="https://www.google.com/s2/favicons?domain=opencode.ai&sz=64" alt="OpenCode logo" width="16" valign="middle" /> OpenCode</kbd></a> &nbsp;
  <a href="https://ampcode.com/manual#install"><kbd><img src="https://www.google.com/s2/favicons?domain=ampcode.com&sz=64" alt="Amp logo" width="16" valign="middle" /> Amp</kbd></a> &nbsp;
  <a href="https://openclaude.gitlawb.com/"><kbd><img src="../../resources/openclaude-logo.png" alt="OpenClaude logo" width="16" valign="middle" /> OpenClaude</kbd></a> &nbsp;
  <a href="https://antigravity.google/docs/cli-overview"><kbd><img src="https://www.google.com/s2/favicons?domain=antigravity.google&sz=64" alt="Antigravity logo" width="16" valign="middle" /> Antigravity</kbd></a> &nbsp;
  <a href="https://pi.dev"><kbd><img src="https://pi.dev/favicon.svg" alt="Pi logo" width="16" valign="middle" /> Pi</kbd></a> &nbsp;
  <a href="https://omp.sh"><kbd><img src="https://omp.sh/favicon.svg" alt="oh-my-pi logo" width="16" valign="middle" /> oh-my-pi</kbd></a> &nbsp;
  <a href="https://hermes-agent.nousresearch.com/docs/"><kbd><img src="https://www.google.com/s2/favicons?domain=nousresearch.com&sz=64" alt="Hermes Agent logo" width="16" valign="middle" /> Hermes Agent</kbd></a> &nbsp;
  <a href="https://goose-docs.ai/docs/quickstart/"><kbd><img src="https://www.google.com/s2/favicons?domain=goose-docs.ai&sz=64" alt="Goose logo" width="16" valign="middle" /> Goose</kbd></a> &nbsp;
  <a href="https://docs.augmentcode.com/cli/overview"><kbd><img src="https://www.google.com/s2/favicons?domain=augmentcode.com&sz=64" alt="Auggie logo" width="16" valign="middle" /> Auggie</kbd></a> &nbsp;
  <a href="https://github.com/autohandai/code-cli"><kbd><img src="https://www.google.com/s2/favicons?domain=autohand.ai&sz=64" alt="Autohand Code logo" width="16" valign="middle" /> Autohand Code</kbd></a> &nbsp;
  <a href="https://github.com/charmbracelet/crush"><kbd><img src="https://www.google.com/s2/favicons?domain=charm.sh&sz=64" alt="Charm logo" width="16" valign="middle" /> Charm</kbd></a> &nbsp;
  <a href="https://docs.cline.bot/cline-cli/overview"><kbd><img src="https://www.google.com/s2/favicons?domain=cline.bot&sz=64" alt="Cline logo" width="16" valign="middle" /> Cline</kbd></a> &nbsp;
  <a href="https://www.codebuff.com/docs/help/quick-start"><kbd><img src="https://www.google.com/s2/favicons?domain=codebuff.com&sz=64" alt="Codebuff logo" width="16" valign="middle" /> Codebuff</kbd></a> &nbsp;
  <a href="https://freebuff.com/cli"><kbd><img src="https://www.google.com/s2/favicons?domain=freebuff.com&sz=64" alt="Freebuff logo" width="16" valign="middle" /> Freebuff</kbd></a> &nbsp;
  <a href="https://commandcode.ai/docs/quickstart"><kbd><img src="https://www.google.com/s2/favicons?domain=commandcode.ai&sz=64" alt="Command Code logo" width="16" valign="middle" /> Command Code</kbd></a> &nbsp;
  <a href="https://docs.continue.dev/cli/quickstart"><kbd><img src="https://www.google.com/s2/favicons?domain=continue.dev&sz=64" alt="Continue logo" width="16" valign="middle" /> Continue</kbd></a> &nbsp;
  <a href="https://docs.factory.ai/cli/getting-started/quickstart"><kbd><img src="../assets/droid-logo.svg" alt="Droid logo" width="16" valign="middle" /> Droid</kbd></a> &nbsp;
  <a href="https://kilo.ai/docs/cli"><kbd><img src="https://raw.githubusercontent.com/Kilo-Org/kilocode/main/packages/kilo-vscode/assets/icons/kilo-light.svg" alt="Kilocode logo" width="16" valign="middle" /> Kilocode</kbd></a> &nbsp;
  <a href="https://www.kimi.com/code/docs/en/kimi-code-cli/getting-started.html"><kbd><img src="https://www.google.com/s2/favicons?domain=moonshot.cn&sz=64" alt="Kimi logo" width="16" valign="middle" /> Kimi</kbd></a> &nbsp;
  <a href="https://kiro.dev/docs/cli/"><kbd><img src="https://www.google.com/s2/favicons?domain=kiro.dev&sz=64" alt="Kiro logo" width="16" valign="middle" /> Kiro</kbd></a> &nbsp;
  <a href="https://github.com/mistralai/mistral-vibe"><kbd><img src="https://www.google.com/s2/favicons?domain=mistral.ai&sz=64" alt="Mistral Vibe logo" width="16" valign="middle" /> Mistral Vibe</kbd></a> &nbsp;
  <a href="https://github.com/QwenLM/qwen-code"><kbd><img src="https://www.google.com/s2/favicons?domain=qwenlm.github.io&sz=64" alt="Qwen Code logo" width="16" valign="middle" /> Qwen Code</kbd></a> &nbsp;
  <a href="https://support.atlassian.com/rovo/docs/install-and-run-rovo-dev-cli-on-your-device/"><kbd><img src="https://www.google.com/s2/favicons?domain=atlassian.com&sz=64" alt="Rovo Dev logo" width="16" valign="middle" /> Rovo Dev</kbd></a> &nbsp;
  <kbd>+ any CLI agent</kbd>
</p>

---

## インストール

### デスクトップ — macOS, Windows, Linux

- **[markov.outhad.com からダウンロード](https://markov.outhad.com/download)**
- またはビルドを直接入手: [macOS Apple Silicon](https://github.com/tanzil7890/markov/releases/latest/download/markov-macos-arm64.dmg) · [macOS Intel](https://github.com/tanzil7890/markov/releases/latest/download/markov-macos-x64.dmg) · [Windows (.exe)](https://github.com/tanzil7890/markov/releases/latest/download/markov-windows-setup.exe) · [Linux AppImage](https://github.com/tanzil7890/markov/releases/latest/download/markov-linux.AppImage) · [すべてのビルド](https://github.com/tanzil7890/markov/releases/latest)

_パッケージマネージャーからもインストールできます:_

```bash
# macOS (Homebrew)
brew install --cask tanzil7890/markov/markov
# 既存のインストールをアップグレード
brew upgrade --cask tanzil7890/markov/markov
```

### モバイル Companion — iOS, Android

デスクトップアプリとペアリングして、スマートフォンからエージェントを監視・操作できます。

- **iOS:** [App Store からダウンロード](https://markov.outhad.com/download/ios)
- **Android:** [APK をダウンロード](https://markov.outhad.com/download/android)

---

## コミュニティとサポート

- **GitHub:** [Report a bug or request a feature](https://github.com/tanzil7890/markov/issues).
- **フィードバックとアイデア:** 私たちは高速にリリースしています。足りない機能がありますか？[機能リクエストを送信](https://github.com/tanzil7890/markov/issues)してください。
- **プライバシー:** Markov が収集する匿名の利用データとオプトアウトの方法については、[プライバシーとテレメトリーのドキュメント](https://markov.outhad.com/docs/telemetry)をご覧ください。
- **応援する:** 毎日のリリースを追うために、このリポジトリに[スター](https://github.com/tanzil7890/markov)を付けてください。

---

## 開発について

貢献したい、またはローカルで実行したいですか？ [CONTRIBUTING.md](../../.github/CONTRIBUTING.md) ガイドをご覧ください。

<a href="https://github.com/tanzil7890/markov/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=tanzil7890/markov" alt="Markov のコントリビューター" />
</a>

## ライセンス

Markov は [MIT License](../../LICENSE) の下で無料かつオープンソースです。

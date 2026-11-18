import { defineFixture } from '../../component-fixtures/component-fixture'
import { NativeChatPaneHeader } from './NativeChatPaneHeader'

export const splitMenu = defineFixture({
  width: 420,
  render: () => (
    <div className="relative bg-background p-6 pb-20">
      <NativeChatPaneHeader
        tabId="fixture-chat"
        worktreeId="fixture-workspace"
        groupId="fixture-group"
        focused
        colorScheme={undefined}
      />
    </div>
  ),
  interact: (frame) => {
    frame
      .querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }
})

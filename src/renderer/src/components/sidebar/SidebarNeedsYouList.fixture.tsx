import { defineFixture } from '../../component-fixtures/component-fixture'
import { SidebarNeedsYouList } from './SidebarNeedsYouList'

const noop = (): void => {}

export const waiting = defineFixture({
  width: 288,
  render: () => (
    <div className="bg-worktree-sidebar pb-2">
      <SidebarNeedsYouList
        items={[
          {
            key: 'a',
            state: 'permission',
            title: 'One-click agent CLI install',
            detail: 'onboarding-agent-setup · Run pnpm tc before committing?',
            age: '2m'
          },
          {
            key: 'b',
            state: 'waiting',
            title: 'Rebuild the icon set',
            detail: 'Which sizes should the tray icon ship?',
            age: '14m'
          }
        ]}
        hiddenCount={2}
        onSelect={noop}
        onViewAll={noop}
      />
    </div>
  )
})

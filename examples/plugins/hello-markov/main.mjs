// Sample plugin runs in a lazily forked plain-Node worker; its default export receives commands, events and capability-gated host API.
export default function activate(markov) {
  markov.commands.register('hello-ping', async () => {
    const stored = await markov.host.call('storage.get', { key: 'pings' })
    const count = (typeof stored?.value === 'number' ? stored.value : 0) + 1
    await markov.host.call('storage.set', { key: 'pings', value: count })
    // A string result is shown as-is in Markov; objects are shown as JSON.
    return count === 1 ? 'Pong! First ping.' : `Pong! ${count} pings so far.`
  })

  markov.events.on('workspace.created', async (payload) => {
    markov.log(`${payload.kind} created: ${payload.workspaceId} at ${payload.path}`)
    await markov.host.call('notifications.show', {
      title: 'Workspace created',
      body: payload.path
    })
  })

  markov.events.on('agent.status.changed', (payload) => {
    markov.log(`agent status: ${payload.state} in ${payload.workspaceId ?? 'unknown workspace'}`)
  })
}

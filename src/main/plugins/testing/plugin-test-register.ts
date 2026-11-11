/** `node --import markov-test-register.mjs`: installs the plugin test hooks shipped beside it. */
import { register } from 'node:module'

register('./markov-test-hooks.mjs', import.meta.url)

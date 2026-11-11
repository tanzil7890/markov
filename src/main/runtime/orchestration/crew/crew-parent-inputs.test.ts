import { expect, it } from 'vitest'
import { readCrewParentInputs } from './crew-parent-inputs'
import { fixture } from './crew-read-model.test-fixture'

it('claims a dispatch addressed only by its session mail address', () => {
  const f = fixture()
  const dispatch = f.assign('term_worker')
  f.db.db
    .prepare('UPDATE dispatch_contexts SET assignee_markov_session_id = ? WHERE id = ?')
    .run('0b7e4c2a-5f1d-4e8a-9c3b-2d6f8a1e4b70', dispatch.id)

  const { claims } = readCrewParentInputs(
    f.db,
    ['markov_session_id:0b7e4c2a-5f1d-4e8a-9c3b-2d6f8a1e4b70'],
    []
  )

  expect(claims.map((claim) => claim.id)).toEqual([dispatch.id])
})

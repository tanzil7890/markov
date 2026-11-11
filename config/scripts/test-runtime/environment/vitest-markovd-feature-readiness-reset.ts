// A startMarkovd test that fails partway must not leave latches closed: later tests in the worker would wait 10 s.
import { afterEach } from 'vitest'
import { _resetMarkovdFeatureReadinessForTests } from '../../../../src/main/runtime/rpc/markovd-feature-readiness'

afterEach(() => {
  _resetMarkovdFeatureReadinessForTests()
})

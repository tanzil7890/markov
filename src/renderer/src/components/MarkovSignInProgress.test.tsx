// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { MarkovCloudSignInProgress } from '../../../shared/markov-profiles'
import { MarkovSignInButton, MarkovSignInWaitNotice } from './MarkovSignInProgress'

type SignInState = {
  markovProfileSignInProgress: MarkovCloudSignInProgress | null
  connectCurrentMarkovProfile: Mock
}

const mocks = vi.hoisted((): { state: SignInState; toastError: Mock; toastSuccess: Mock } => ({
  state: { markovProfileSignInProgress: null, connectCurrentMarkovProfile: vi.fn() },
  toastError: vi.fn(),
  toastSuccess: vi.fn()
}))

vi.mock('../store', () => ({
  useAppStore: (selector: (state: SignInState) => unknown) => selector(mocks.state)
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess }
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

const LINK = 'https://login.example/authorize?state=abc'

describe('Markov sign-in progress', () => {
  const writeClipboardText = vi.fn()
  const cancelSignIn = vi.fn()

  beforeEach(() => {
    mocks.state.markovProfileSignInProgress = null
    mocks.state.connectCurrentMarkovProfile.mockReset()
    mocks.toastError.mockReset()
    mocks.toastSuccess.mockReset()
    writeClipboardText.mockReset().mockResolvedValue(undefined)
    cancelSignIn.mockReset().mockResolvedValue(undefined)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { writeClipboardText }, markovProfiles: { cancelSignIn } }
    })
  })

  afterEach(() => cleanup())

  it('starts a sign-in from the button', async () => {
    render(<MarkovSignInButton>Sign in to Markov</MarkovSignInButton>)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in to Markov' }))

    expect(mocks.state.connectCurrentMarkovProfile).toHaveBeenCalledOnce()
  })

  it('greys the button out as Signing in… while a sign-in is in flight', () => {
    mocks.state.markovProfileSignInProgress = { link: null }
    render(<MarkovSignInButton>Sign in to Markov</MarkovSignInButton>)

    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled()
  })

  it('omits the waiting notice until the sign-in link is available', () => {
    mocks.state.markovProfileSignInProgress = { link: null }
    const { container } = render(<MarkovSignInWaitNotice />)
    expect(container).toBeEmptyDOMElement()
  })

  it('copies the waiting link', async () => {
    mocks.state.markovProfileSignInProgress = { link: LINK }
    render(<MarkovSignInWaitNotice />)
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for sign-in in your browser')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Copy sign-in link' }))

    expect(writeClipboardText).toHaveBeenCalledWith(LINK)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Sign-in link copied')
  })

  it('reports a failed clipboard write', async () => {
    mocks.state.markovProfileSignInProgress = { link: LINK }
    writeClipboardText.mockRejectedValue(new Error('denied'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<MarkovSignInWaitNotice />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Copy sign-in link' }))

    expect(mocks.toastError).toHaveBeenCalledWith('Could not copy the link.')
  })

  it('cancels the browser wait', async () => {
    mocks.state.markovProfileSignInProgress = { link: LINK }
    render(<MarkovSignInWaitNotice />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }))

    expect(cancelSignIn).toHaveBeenCalledOnce()
  })
})

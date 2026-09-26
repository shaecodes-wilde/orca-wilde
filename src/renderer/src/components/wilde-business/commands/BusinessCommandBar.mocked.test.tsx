// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BusinessCommandBar } from './BusinessCommandBar'

const audio = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  flushBufferedAudio: vi.fn(),
  discardBufferedAudio: vi.fn()
}))
vi.mock('@/hooks/use-audio-capture', () => ({ useAudioCapture: () => audio }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ settings: { voice: {} } }) } }))
type Transcript = { sessionId: string; text: string }
const finals = new Set<(event: Transcript) => void>()
const partials = new Set<(event: Transcript) => void>()
const stops = new Set<(event: { sessionId: string }) => void>()
const errors = new Set<(event: { sessionId: string; error: string }) => void>()
function listener<T>(set: Set<(value: T) => void>) {
  return (callback: (value: T) => void) => {
    set.add(callback)
    return () => {
      set.delete(callback)
    }
  }
}
const speech = {
  getModelStates: vi.fn(),
  startDictation: vi.fn(),
  stopDictation: vi.fn(),
  onPartialTranscript: listener(partials),
  onFinalTranscript: listener(finals),
  onStopped: listener(stops),
  onError: listener(errors)
}
function emit<T>(set: Set<(event: T) => void>, event: T) {
  act(() => {
    for (const callback of set) {
      callback(event)
    }
  })
}
function button() {
  return screen.getByRole('button', { name: 'Hold to speak a business command' })
}
async function hold() {
  fireEvent.keyDown(button(), { key: ' ', repeat: false })
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Listening locally'))
  return speech.startDictation.mock.calls.at(-1)?.[2]
}
beforeEach(() => {
  vi.clearAllMocks()
  speech.getModelStates.mockResolvedValue([{ id: 'parakeet-tdt-0.6b-v3-int8', status: 'ready' }])
  speech.startDictation.mockResolvedValue(undefined)
  speech.stopDictation.mockResolvedValue(undefined)
  audio.start.mockResolvedValue({ fellBackToDefaultMicrophone: false })
  audio.flushBufferedAudio.mockResolvedValue(undefined)
  Object.defineProperty(window, 'api', { configurable: true, value: { speech } })
})
afterEach(() => {
  cleanup()
  finals.clear()
  partials.clear()
  stops.clear()
  errors.clear()
  vi.useRealTimers()
})

describe('business command bar with mocked audio and speech IPC', () => {
  it('uses mouse hold/release and reports silence without running a command', async () => {
    const onCommand = vi.fn()
    render(<BusinessCommandBar scopeKey="home" onCommand={onCommand} />)
    fireEvent.pointerDown(button(), { button: 0, pointerId: 1 })
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Listening locally')
    )
    const sessionId = speech.startDictation.mock.calls[0][2]
    fireEvent.pointerUp(button(), { button: 0, pointerId: 1 })
    emit(stops, { sessionId })
    expect(onCommand).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toContain('No speech detected')
  })
  it('stops cancelled provider startup again after late completion without dispatching', async () => {
    let resolveStart: (() => void) | undefined
    speech.startDictation.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve
        })
    )
    const onCommand = vi.fn()
    render(<BusinessCommandBar scopeKey="home" onCommand={onCommand} />)
    fireEvent.keyDown(button(), { key: ' ' })
    await waitFor(() => expect(speech.startDictation).toHaveBeenCalled())
    const sessionId = speech.startDictation.mock.calls[0][2]
    fireEvent.keyDown(window, { key: 'Escape' })
    await act(async () => resolveStart?.())
    expect(speech.stopDictation).toHaveBeenCalledWith(sessionId)
    expect(audio.flushBufferedAudio).not.toHaveBeenCalled()
    emit(finals, { sessionId, text: 'Open clients' })
    emit(stops, { sessionId })
    expect(onCommand).not.toHaveBeenCalled()
  })
  it('retains typed commands when the local model is unavailable without opening the microphone', async () => {
    speech.getModelStates.mockResolvedValue([])
    const onCommand = vi.fn()
    render(<BusinessCommandBar scopeKey="home" onCommand={onCommand} />)
    fireEvent.keyDown(button(), { key: ' ' })
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Parakeet v3 is not ready')
    )
    expect(audio.start).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'Open clients' } })
    fireEvent.click(screen.getByRole('button', { name: 'Run command' }))
    expect(onCommand).toHaveBeenCalledExactlyOnceWith('Open clients')
    expect(speech.startDictation).not.toHaveBeenCalled()
  })
  it('accumulates only its session finals and dispatches once after release and stopped', async () => {
    const onCommand = vi.fn()
    render(<BusinessCommandBar scopeKey="home" onCommand={onCommand} />)
    const sessionId = await hold()
    expect(sessionId).toMatch(/^wilde-command:/)
    expect(speech.startDictation).toHaveBeenCalledWith(
      'parakeet-tdt-0.6b-v3-int8',
      undefined,
      sessionId
    )
    emit(finals, { sessionId: '1', text: 'Foreign dictation' })
    emit(finals, { sessionId, text: 'Show failed' })
    emit(finals, { sessionId, text: 'Show failed' })
    emit(finals, { sessionId, text: 'automations this week.' })
    expect(onCommand).not.toHaveBeenCalled()
    fireEvent.keyUp(button(), { key: ' ' })
    await waitFor(() => expect(speech.stopDictation).toHaveBeenCalledWith(sessionId))
    expect(onCommand).not.toHaveBeenCalled()
    emit(stops, { sessionId })
    emit(stops, { sessionId })
    emit(finals, { sessionId, text: 'Late text' })
    expect(onCommand).toHaveBeenCalledExactlyOnceWith('Show failed automations this week.')
  })
  it.each(['escape', 'blur', 'scope', 'device', 'unmount'])(
    'cancels on %s and ignores late finals',
    async (reason) => {
      const onCommand = vi.fn()
      const view = render(<BusinessCommandBar scopeKey="home" onCommand={onCommand} />)
      const sessionId = await hold()
      if (reason === 'escape') {
        fireEvent.keyDown(window, { key: 'Escape' })
      }
      if (reason === 'blur') {
        fireEvent.blur(window)
      }
      if (reason === 'scope') {
        view.rerender(<BusinessCommandBar scopeKey="client" onCommand={onCommand} />)
      }
      if (reason === 'device') {
        act(() => audio.start.mock.calls[0][0].onCaptureLost())
      }
      if (reason === 'unmount') {
        view.unmount()
      }
      emit(finals, { sessionId, text: 'Open clients' })
      emit(stops, { sessionId })
      expect(onCommand).not.toHaveBeenCalled()
      expect(speech.stopDictation).toHaveBeenCalledWith(sessionId)
      expect(audio.stop).toHaveBeenCalled()
      expect(audio.discardBufferedAudio).toHaveBeenCalled()
    }
  )
  it('cancels a pending microphone request and never starts speech after it resolves', async () => {
    let resolveCapture: (() => void) | undefined
    audio.start.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCapture = resolve
        })
    )
    const onCommand = vi.fn()
    render(<BusinessCommandBar scopeKey="home" onCommand={onCommand} />)
    fireEvent.keyDown(button(), { key: ' ' })
    await waitFor(() => expect(audio.start).toHaveBeenCalled())
    fireEvent.keyDown(window, { key: 'Escape' })
    await act(async () => resolveCapture?.())
    expect(speech.startDictation).not.toHaveBeenCalled()
    expect(onCommand).not.toHaveBeenCalled()
  })
  it('preserves startup audio when released while inference starts, then dispatches the matching final', async () => {
    let resolveStart: (() => void) | undefined
    speech.startDictation.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve
        })
    )
    const onCommand = vi.fn()
    render(<BusinessCommandBar scopeKey="home" onCommand={onCommand} />)
    fireEvent.keyDown(button(), { key: ' ' })
    await waitFor(() => expect(speech.startDictation).toHaveBeenCalled())
    const sessionId = speech.startDictation.mock.calls[0][2]
    fireEvent.keyUp(button(), { key: ' ' })
    expect(audio.stop).toHaveBeenCalledWith({ preserveBufferedAudio: true })
    await act(async () => resolveStart?.())
    expect(audio.flushBufferedAudio).toHaveBeenCalled()
    expect(speech.stopDictation).toHaveBeenCalledWith(sessionId)
    emit(finals, { sessionId, text: 'Open clients' })
    emit(stops, { sessionId })
    expect(onCommand).toHaveBeenCalledExactlyOnceWith('Open clients')
  })
  it('cancels active provider failures and long holds', async () => {
    const onCommand = vi.fn()
    render(<BusinessCommandBar scopeKey="home" onCommand={onCommand} />)
    const sessionId = await hold()
    emit(errors, { sessionId, error: 'provider failure' })
    expect(screen.getByRole('status').textContent).toContain('Local speech failed')
    emit(finals, { sessionId, text: 'Open clients' })
    emit(stops, { sessionId })
    expect(onCommand).not.toHaveBeenCalled()
    vi.useFakeTimers()
    fireEvent.keyDown(button(), { key: ' ' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(screen.getByRole('status').textContent).toContain('limited to 30 seconds')
    expect(onCommand).not.toHaveBeenCalled()
  })
})

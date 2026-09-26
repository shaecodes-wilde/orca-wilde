import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudioCapture } from '@/hooks/use-audio-capture'
import { useAppStore } from '@/store'
import { formatFinalTranscriptSegment } from '@/components/dictation/dictation-final-segments'

const MODEL = 'parakeet-tdt-0.6b-v3-int8'
type Session = {
  id: string
  scope: string
  starting: boolean
  released: boolean
  speechRequested: boolean
  stopRequested: boolean
  text: string
  segments: Set<string>
}
type CaptureStatus = 'idle' | 'starting' | 'listening' | 'transcribing'

export function useCommandCapture(onCommand: (text: string) => void, scopeKey: string) {
  const {
    start: startAudio,
    stop: stopAudio,
    flushBufferedAudio,
    discardBufferedAudio
  } = useAudioCapture()
  const active = useRef<Session | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const command = useRef(onCommand)
  const scope = useRef(scopeKey)
  command.current = onCommand
  scope.current = scopeKey
  const [status, setStatus] = useState<CaptureStatus>('idle')
  const [message, setMessage] = useState(
    'Hold to speak, then release. Escape cancels. Commands use local speech.'
  )
  const [partial, setPartial] = useState('')
  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
    }
    timer.current = null
  }, [])
  const cancel = useCallback(
    (reason = 'Voice command cancelled.') => {
      const session = active.current
      active.current = null
      clearTimer()
      stopAudio()
      discardBufferedAudio()
      setStatus('idle')
      setPartial('')
      if (session) {
        setMessage(reason)
        if (session.speechRequested) {
          void window.api.speech.stopDictation(session.id).catch(() => undefined)
        }
      }
    },
    [clearTimer, discardBufferedAudio, stopAudio]
  )
  const finish = useCallback(
    async (session: Session) => {
      if (active.current !== session || session.stopRequested || session.starting) {
        return
      }
      session.stopRequested = true
      stopAudio()
      setStatus('transcribing')
      setMessage('Transcribing locally… Escape cancels.')
      clearTimer()
      timer.current = setTimeout(
        () => cancel('Local speech did not finish. Try again or type your command.'),
        15000
      )
      try {
        await window.api.speech.stopDictation(session.id)
      } catch {
        if (active.current === session) {
          cancel('Local speech could not finish. Try again or type your command.')
        }
      }
    },
    [cancel, clearTimer, stopAudio]
  )
  const release = useCallback(() => {
    const session = active.current
    if (!session || session.released) {
      return
    }
    session.released = true
    stopAudio({ preserveBufferedAudio: true })
    if (session.starting) {
      setStatus('transcribing')
      setMessage('Finishing local speech startup… Escape cancels.')
    } else {
      void finish(session)
    }
  }, [finish, stopAudio])
  const start = useCallback(async () => {
    if (active.current) {
      return
    }
    const session: Session = {
      id: `wilde-command:${crypto.randomUUID()}`,
      scope: scope.current,
      starting: true,
      released: false,
      speechRequested: false,
      stopRequested: false,
      text: '',
      segments: new Set()
    }
    active.current = session
    setStatus('starting')
    setPartial('')
    setMessage('Checking local speech model…')
    timer.current = setTimeout(
      () => cancel('Voice commands are limited to 30 seconds. Type a longer request.'),
      30000
    )
    try {
      const models = await window.api.speech.getModelStates()
      if (active.current !== session) {
        return
      }
      if (!models.some((model) => model.id === MODEL && model.status === 'ready')) {
        cancel(
          'Local Parakeet v3 is not ready. Set it up in Settings → Voice, or type your command.'
        )
        return
      }
      if (session.released) {
        cancel()
        return
      }
      const voice = useAppStore.getState().settings?.voice
      setMessage('Opening microphone for a local command…')
      await startAudio({
        bufferAudio: true,
        sessionId: session.id,
        microphoneDeviceId: voice?.microphoneDeviceId,
        microphoneDeviceLabel: voice?.microphoneDeviceLabel,
        onCaptureLost: () => {
          if (active.current === session) {
            cancel('Microphone disconnected. Reconnect it or type your command.')
          }
        }
      })
      if (active.current !== session) {
        return
      }
      if (session.released) {
        cancel()
        return
      }
      session.speechRequested = true
      setMessage('Starting local speech… Keep holding while you speak.')
      await window.api.speech.startDictation(MODEL, undefined, session.id)
      if (active.current !== session) {
        await window.api.speech.stopDictation(session.id).catch(() => undefined)
        return
      }
      await flushBufferedAudio()
      if (active.current !== session) {
        return
      }
      session.starting = false
      if (session.released) {
        await finish(session)
      } else {
        setStatus('listening')
        setMessage('Listening locally… Release to run the command. Escape cancels.')
      }
    } catch (error) {
      if (active.current !== session) {
        return
      }
      const detail = String(error)
      cancel(
        detail.includes('dictation_already_active')
          ? 'Another voice session is active. Finish it first, or type your command.'
          : detail.includes('NotAllowedError') || detail.includes('Permission denied')
            ? 'Microphone access was denied. Allow access in system settings, or type your command.'
            : 'Local voice could not start. Check your microphone and Settings → Voice, or type your command.'
      )
    }
  }, [cancel, finish, flushBufferedAudio, startAudio])

  useEffect(() => {
    const partialCleanup = window.api.speech.onPartialTranscript((event) => {
      const session = active.current
      if (session?.id === event.sessionId && session.scope === scope.current) {
        setPartial(event.text.slice(0, 2000))
      }
    })
    const finalCleanup = window.api.speech.onFinalTranscript((event) => {
      const session = active.current
      if (
        !session ||
        session.id !== event.sessionId ||
        session.scope !== scope.current ||
        !event.text.trim()
      ) {
        return
      }
      if (!session.segments.has(event.text)) {
        if (session.text.length + event.text.length > 2000) {
          cancel('The spoken command was too long. Try a shorter command or use the text field.')
          return
        }
        session.segments.add(event.text)
        session.text += formatFinalTranscriptSegment(event.text, session.text)
      }
      setPartial(session.text)
    })
    const stoppedCleanup = window.api.speech.onStopped((event) => {
      const session = active.current
      if (!session || session.id !== event.sessionId) {
        return
      }
      if (!session.released || !session.stopRequested || session.scope !== scope.current) {
        cancel()
        return
      }
      active.current = null
      clearTimer()
      stopAudio()
      discardBufferedAudio()
      setStatus('idle')
      setPartial('')
      const text = session.text.trim()
      setMessage(text ? `Heard: ${text}` : 'No speech detected. Try again or type your command.')
      if (text) {
        command.current(text)
      }
    })
    const errorCleanup = window.api.speech.onError((event) => {
      if (active.current?.id === event.sessionId) {
        cancel('Local speech failed. Try again or type your command.')
      }
    })
    return () => {
      partialCleanup()
      finalCleanup()
      stoppedCleanup()
      errorCleanup()
    }
  }, [cancel, clearTimer, discardBufferedAudio, stopAudio])
  useEffect(() => {
    const blur = () => cancel()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && active.current) {
        event.preventDefault()
        cancel()
      }
    }
    const hidden = () => {
      if (document.hidden) {
        cancel()
      }
    }
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', escape)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('blur', blur)
      window.removeEventListener('keydown', escape)
      document.removeEventListener('visibilitychange', hidden)
      cancel()
    }
  }, [cancel])
  return { status, message, partial, start, release, cancel }
}

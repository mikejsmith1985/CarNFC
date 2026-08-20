// Thin wrapper over the browser's own dictation and speech, so the rest of the app never touches a vendor-prefixed global.
'use client'

// Framework-first: neither Next.js nor React offers speech input or output, and
// every browser that can do this ships it natively as the Web Speech API. No
// dependency is added — this file exists only to hide the vendor prefix and the
// event-based shape behind something callable.
//
// Worth knowing: recognition is not guaranteed to be on-device. Chrome sends
// audio to a Google service, so dictation can fail with no signal even though
// the rest of this app works offline. That is why every question can also be
// answered by typing, and why a network failure is reported plainly rather than
// looking like a microphone that stopped working.

/** Why dictation stopped, in terms worth showing someone under a vehicle. */
export type DictationError = 'not-allowed' | 'no-speech' | 'network' | 'unsupported' | 'unknown'

export interface DictationSession {
  /** Begins listening for a single answer. */
  start: () => void
  /** Stops listening and releases the microphone. */
  stop: () => void
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
  resultIndex: number
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null
}

/** Whether this browser can take a spoken answer at all. */
export function isDictationSupported(): boolean {
  return getRecognitionConstructor() !== null
}

/** Whether this browser can read a question out loud. */
export function isSpeechOutputSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

interface DictationHandlers {
  /** Called with the best transcript once the speaker stops. */
  onFinalResult: (transcript: string) => void
  /** Called as words arrive, so the screen can show it is hearing something. */
  onInterimResult?: (transcript: string) => void
  onError: (reason: DictationError) => void
  /** Called when listening has ended, for any reason including success. */
  onEnd: () => void
}

/**
 * Builds a dictation session, or null when the browser has no dictation.
 *
 * One answer per session: listening continuously would keep the microphone open
 * between questions, and a garage is loud enough that it would fill fields with
 * whatever else was going on.
 */
export function createDictationSession(handlers: DictationHandlers): DictationSession | null {
  const Recognition = getRecognitionConstructor()
  if (!Recognition) return null

  const recognition = new Recognition()
  recognition.lang = navigator.language || 'en-US'
  recognition.continuous = false
  recognition.interimResults = true
  recognition.maxAlternatives = 1

  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      if (!result) continue
      const transcript = result[0]?.transcript ?? ''
      if (result.isFinal) {
        handlers.onFinalResult(transcript)
      } else {
        handlers.onInterimResult?.(transcript)
      }
    }
  }

  recognition.onerror = (event) => {
    handlers.onError(toDictationError(event.error))
  }

  recognition.onend = () => handlers.onEnd()

  return {
    start: () => {
      try {
        recognition.start()
      } catch {
        // Already listening. Harmless, and better than crashing the panel.
      }
    },
    stop: () => recognition.abort(),
  }
}

function toDictationError(raw: string): DictationError {
  if (raw === 'not-allowed' || raw === 'service-not-allowed') return 'not-allowed'
  if (raw === 'no-speech') return 'no-speech'
  if (raw === 'network') return 'network'
  return 'unknown'
}

/** Reads a line out loud, calling back when it has finished speaking. */
export function speak(line: string, onSpoken?: () => void): void {
  if (!isSpeechOutputSupported()) {
    onSpoken?.()
    return
  }

  // Anything still queued is about the previous question and is now misleading.
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(line)
  utterance.lang = navigator.language || 'en-US'
  utterance.onend = () => onSpoken?.()
  utterance.onerror = () => onSpoken?.()
  window.speechSynthesis.speak(utterance)
}

/** Stops anything currently being spoken — used when the panel closes. */
export function cancelSpeech(): void {
  if (isSpeechOutputSupported()) window.speechSynthesis.cancel()
}

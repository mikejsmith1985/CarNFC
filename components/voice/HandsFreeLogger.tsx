// Asks the log questions out loud and fills the form from the spoken answers, for hands that are not free.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, MicOff, SkipForward, RotateCcw, CornerUpLeft, Check, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { useHasHydrated } from '@/components/ui/useHasHydrated'
import { getDictationScript, summarizeAnswer } from '@/lib/voice/dictation-script'
import { interpretUtterance } from '@/lib/voice/transcript'
import {
  cancelSpeech,
  createDictationSession,
  isDictationSupported,
  speak,
  type DictationError,
  type DictationSession,
} from '@/lib/voice/speech'
import type { ServiceLogDraft } from '@/lib/validation/service-log'
import type { LogCategory } from '@/types/servicecard'

interface HandsFreeLoggerProps {
  category: LogCategory
  /** Writes one answer into the draft the form is holding. */
  onAnswer: (field: keyof ServiceLogDraft, value: string) => void
  /** Called when the run ends, whether it was completed or stopped early. */
  onFinish: () => void
}

/** What the panel is doing right now, which is also what it shows. */
type Phase = 'idle' | 'asking' | 'listening' | 'confirming' | 'finished'

const ERROR_MESSAGES: Record<DictationError, string> = {
  'not-allowed': 'Microphone access was refused. Allow it in your browser, or type the answer.',
  'no-speech': "Didn't catch that.",
  network: 'Dictation needs a signal on this browser, and there is none. Type the answer instead.',
  unsupported: 'This browser cannot take spoken answers.',
  unknown: 'Dictation stopped unexpectedly.',
}

/**
 * Walks the log questions for a category, speaking each one and listening for the answer.
 *
 * The point is a phone on a wing while both hands are on the job, so every
 * question can be answered three ways: by speaking, by pressing a large button,
 * or by typing. Nothing here interprets meaning — the browser turns speech into
 * words, and a lookup table turns words into a field value. There is no model
 * involved, so it behaves the same way every time and costs nothing to run.
 */
export function HandsFreeLogger({ category, onAnswer, onFinish }: HandsFreeLoggerProps) {
  const hasHydrated = useHasHydrated()
  const script = useMemo(() => getDictationScript(category), [category])

  const [questionIndex, setQuestionIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [heard, setHeard] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [typedAnswer, setTypedAnswer] = useState('')

  const sessionRef = useRef<DictationSession | null>(null)

  const question = script[questionIndex]
  const canDictate = hasHydrated && isDictationSupported()

  // Plain function declarations, not `useCallback`: asking and answering call
  // each other — a misheard answer re-asks, a spoken "back" re-asks the previous
  // question — and hoisting is what lets that be written directly instead of
  // through a ref. Nothing depends on their identity, so nothing is gained by
  // memoising them.

  function closeSession() {
    sessionRef.current?.stop()
    sessionRef.current = null
  }

  function finish() {
    closeSession()
    cancelSpeech()
    setPhase('finished')
    onFinish()
  }

  function askQuestion(index: number) {
    const nextQuestion = script[index]
    if (!nextQuestion) {
      speak('That is everything. Check it over and save.', finish)
      return
    }

    setQuestionIndex(index)
    setTypedAnswer('')
    setNotice(null)
    setPhase('asking')
    speak(nextQuestion.prompt, () => listenFor(index))
  }

  function listenFor(index: number) {
    closeSession()
    setPhase('listening')
    setHeard('')

    const session = createDictationSession({
      onInterimResult: setHeard,
      onFinalResult: (transcript) => {
        setHeard(transcript)
        handleSpokenAnswer(index, transcript)
      },
      onError: (reason) => {
        setNotice(ERROR_MESSAGES[reason])
        setPhase('confirming')
      },
      onEnd: () => {
        sessionRef.current = null
      },
    })

    if (!session) {
      setNotice(ERROR_MESSAGES.unsupported)
      setPhase('confirming')
      return
    }

    sessionRef.current = session
    session.start()
  }

  /** Records an answer and moves on, reading back what was captured. */
  function acceptAnswer(index: number, value: string) {
    const answered = script[index]
    if (!answered) return

    onAnswer(answered.field, value)
    setPhase('confirming')
    speak(summarizeAnswer(answered.field, value), () => askQuestion(index + 1))
  }

  function handleSpokenAnswer(index: number, transcript: string) {
    const asked = script[index]
    if (!asked) return

    const utterance = interpretUtterance(transcript, asked.kind)

    switch (utterance.kind) {
      case 'control':
        if (utterance.command === 'skip') return acceptAnswer(index, '')
        if (utterance.command === 'repeat') return askQuestion(index)
        if (utterance.command === 'back') return askQuestion(Math.max(0, index - 1))
        return finish()
      case 'value':
        return acceptAnswer(index, utterance.value)
      case 'unparsed':
        setNotice('That did not sound like a number. Say it again, or type it.')
        return listenFor(index)
      case 'unheard':
        setNotice(ERROR_MESSAGES['no-speech'])
        return listenFor(index)
    }
  }

  // Release the microphone and the voice whenever this panel goes away —
  // including by the modal closing around it.
  useEffect(() => {
    return () => {
      closeSession()
      cancelSpeech()
    }
     
  }, [])

  if (phase === 'finished' || !question) return null

  // Started by a press rather than on its own: iOS will not speak or open a
  // microphone unless a person asked it to in that moment, so a panel that
  // began talking by itself would be silent on exactly the phone most likely
  // to be propped on a wing.
  if (phase === 'idle') {
    return (
      <section
        aria-label="Hands-free logging"
        className="rounded-card border border-accent/40 bg-accent/5 p-4"
      >
        <p className="text-sm text-text-secondary">
          {script.length} questions, read out loud. Answer by speaking, or press Skip. Say
          &ldquo;back&rdquo;, &ldquo;repeat&rdquo; or &ldquo;done&rdquo; at any point.
        </p>
        <Button
          variant="primary"
          size="large"
          fullWidth
          icon={<Mic size={18} aria-hidden />}
          onClick={() => askQuestion(0)}
          className="mt-3"
        >
          Start asking
        </Button>
      </section>
    )
  }

  return (
    <section
      aria-label="Hands-free logging"
      className="rounded-card border border-accent/40 bg-accent/5 p-4"
    >
      <ProgressLine current={questionIndex + 1} total={script.length} />

      <p className="mt-2 text-lg font-bold text-text-primary">{question.prompt}</p>

      <ListeningIndicator phase={phase} heard={heard} canDictate={canDictate} />

      {notice ? (
        <p role="status" className="mt-2 text-sm text-warning">
          {notice}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Button
          variant="secondary"
          icon={<CornerUpLeft size={16} aria-hidden />}
          onClick={() => askQuestion(Math.max(0, questionIndex - 1))}
          disabled={questionIndex === 0}
        >
          Back
        </Button>
        <Button
          variant="secondary"
          icon={<RotateCcw size={16} aria-hidden />}
          onClick={() => askQuestion(questionIndex)}
        >
          Repeat
        </Button>
        <Button
          variant="secondary"
          icon={<SkipForward size={16} aria-hidden />}
          onClick={() => acceptAnswer(questionIndex, '')}
        >
          Skip
        </Button>
      </div>

      {/*
        Always present, never a fallback that has to be discovered: dictation
        fails for ordinary reasons — a loud workshop, a refused permission, a
        browser that sends audio to a server and has no signal to do it with.
      */}
      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <TextField
            label="Or type the answer"
            value={typedAnswer}
            placeholder={question.kind === 'number' ? '0' : ''}
            inputMode={question.kind === 'number' ? 'decimal' : 'text'}
            onChange={(event) => setTypedAnswer(event.target.value)}
          />
        </div>
        <Button
          variant="primary"
          icon={<Check size={16} aria-hidden />}
          onClick={() => acceptAnswer(questionIndex, typedAnswer.trim())}
          disabled={typedAnswer.trim() === ''}
        >
          Use
        </Button>
      </div>

      <Button variant="ghost" fullWidth onClick={finish} className="mt-3">
        Finish and review the form
      </Button>
    </section>
  )
}

function ProgressLine({ current, total }: { current: number; total: number }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-accent">
      Hands-free · question {current} of {total}
    </p>
  )
}

function ListeningIndicator({
  phase,
  heard,
  canDictate,
}: {
  phase: Phase
  heard: string
  canDictate: boolean
}) {
  if (!canDictate) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-text-muted">
        <Keyboard size={16} aria-hidden />
        This browser cannot listen. Type each answer and press Use.
      </p>
    )
  }

  return (
    <div className="mt-3 flex items-center gap-2 text-sm">
      {phase === 'listening' ? (
        <Mic size={18} className="animate-pulse text-accent" aria-hidden />
      ) : (
        <MicOff size={18} className="text-text-muted" aria-hidden />
      )}
      <span className="text-text-secondary">
        {phase === 'listening' ? (heard === '' ? 'Listening…' : heard) : 'Speaking…'}
      </span>
    </div>
  )
}

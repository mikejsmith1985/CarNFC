// Reads what was said as either a command to hands-free mode or an answer to the question it asked.
//
// Everything here is pure text handling — no model, no network. The browser's
// own dictation produces the words; this decides what they meant. That matters
// because the whole point is a phone lying on a wing under a raised bonnet,
// possibly with no signal at all.

import { spokenToNumber } from '@/lib/voice/number-words'

/** How an answer should be read, which depends on the field being filled. */
export type AnswerKind = 'text' | 'number' | 'viscosity' | 'partNumber'

/** What hands-free mode should do next, other than record an answer. */
export type VoiceCommand = 'skip' | 'repeat' | 'back' | 'stop'

export type Utterance =
  | { kind: 'control'; command: VoiceCommand }
  | { kind: 'value'; value: string }
  /** Nothing was said, or nothing intelligible came back. */
  | { kind: 'unheard' }
  /** Words came back, but not ones that fit the field — a number field given prose. */
  | { kind: 'unparsed' }

/**
 * Phrases that steer the session rather than answer it.
 *
 * Matched against the whole utterance, never against part of one: "replace it
 * at the next service" is an answer that happens to contain "next", and losing
 * it to a command would be worse than not having commands at all.
 */
const CONTROL_PHRASES: Record<VoiceCommand, string[]> = {
  skip: ['skip', 'skip it', 'skip that', 'next', 'pass', 'nothing'],
  repeat: ['repeat', 'repeat that', 'again', 'say again', 'say that again', 'what'],
  back: ['back', 'go back', 'previous', 'go back one', 'undo'],
  stop: ['stop', 'done', 'i am done', "i'm done", 'im done', 'finish', 'finished', "that's all"],
}

/** Reads one utterance in the context of the question that was asked. */
export function interpretUtterance(spoken: string, kind: AnswerKind): Utterance {
  const trimmed = spoken.trim()
  if (trimmed === '') return { kind: 'unheard' }

  const command = matchControlPhrase(trimmed)
  if (command) return { kind: 'control', command }

  switch (kind) {
    case 'number': {
      const digits = spokenToNumber(trimmed)
      return digits === null ? { kind: 'unparsed' } : { kind: 'value', value: digits }
    }
    case 'viscosity':
      return { kind: 'value', value: normalizeViscosity(trimmed) }
    case 'partNumber':
      return { kind: 'value', value: normalizePartNumber(trimmed) }
    case 'text':
      return { kind: 'value', value: trimmed.replace(/\s+/g, ' ') }
  }
}

function matchControlPhrase(spoken: string): VoiceCommand | null {
  // Trailing punctuation is the engine's, not the speaker's.
  const bare = spoken
    .toLowerCase()
    .replace(/[.,!?]+$/, '')
    .trim()

  for (const [command, phrases] of Object.entries(CONTROL_PHRASES)) {
    if (phrases.includes(bare)) return command as VoiceCommand
  }
  return null
}

/** Multigrade written with digits already, however it was spaced or hyphenated. */
const DIGIT_GRADE_PATTERN = /^\s*(\d{1,3})\s*(?:w|wt|weight)\s*-?\s*(\d{1,3})\s*$/i

/** The separator between the two halves of a grade said out loud. */
const SPOKEN_GRADE_SEPARATOR = /\s+(?:w|wt|weight|double\s+u)\s+/i

/**
 * Writes an oil grade the way a bottle does — "75W-90" — however it was said.
 *
 * Dictation splits a grade every way imaginable: "75 W 90", "seventy five W
 * ninety", "10w40", "5 weight 30". Anything that is not a grade at all is left
 * exactly as spoken, because "synthetic gear oil" is a perfectly good answer to
 * what went in.
 */
export function normalizeViscosity(spoken: string): string {
  const digitForm = spoken.match(DIGIT_GRADE_PATTERN)
  if (digitForm) return `${digitForm[1]}W-${digitForm[2]}`

  const [coldHalf, hotHalf, ...extraHalves] = spoken.split(SPOKEN_GRADE_SEPARATOR)
  if (coldHalf !== undefined && hotHalf !== undefined && extraHalves.length === 0) {
    const cold = spokenToNumber(coldHalf)
    const hot = spokenToNumber(hotHalf)
    if (cold !== null && hot !== null) return `${cold}W-${hot}`
  }

  return spoken.trim().replace(/\s+/g, ' ')
}

/** A part number is one token by definition, so the gaps dictation adds come out. */
function normalizePartNumber(spoken: string): string {
  return spoken.toUpperCase().replace(/\s+/g, '')
}

// Unit tests for reading a spoken answer as either a command or a field value.

import { describe, expect, it } from 'vitest'
import { interpretUtterance, normalizeViscosity } from '@/lib/voice/transcript'

describe('control words', () => {
  it('hears "skip" as a command, not an answer', () => {
    expect(interpretUtterance('skip', 'text')).toEqual({ kind: 'control', command: 'skip' })
  })

  it('accepts "next" for the same thing, because people say both', () => {
    expect(interpretUtterance('next', 'text')).toEqual({ kind: 'control', command: 'skip' })
  })

  it('hears "repeat that"', () => {
    expect(interpretUtterance('repeat that', 'text')).toEqual({ kind: 'control', command: 'repeat' })
  })

  it('hears "go back"', () => {
    expect(interpretUtterance('go back', 'text')).toEqual({ kind: 'control', command: 'back' })
  })

  it('hears "I am done"', () => {
    expect(interpretUtterance('I am done', 'text')).toEqual({ kind: 'control', command: 'stop' })
  })

  it('ignores the case and the punctuation an engine adds', () => {
    expect(interpretUtterance('Skip.', 'text')).toEqual({ kind: 'control', command: 'skip' })
  })

  it('does not mistake a longer sentence containing "next" for a command', () => {
    const result = interpretUtterance('replace it at the next service', 'text')
    expect(result).toEqual({ kind: 'value', value: 'replace it at the next service' })
  })
})

describe('reading an answer for a text field', () => {
  it('keeps what was said, tidied', () => {
    expect(interpretUtterance('  weeping at the pinion seal  ', 'text')).toEqual({
      kind: 'value',
      value: 'weeping at the pinion seal',
    })
  })

  it('reports an empty utterance as nothing heard, rather than an empty answer', () => {
    expect(interpretUtterance('   ', 'text')).toEqual({ kind: 'unheard' })
  })
})

describe('reading an answer for a number field', () => {
  it('converts the spoken number', () => {
    expect(interpretUtterance('twenty four', 'number')).toEqual({ kind: 'value', value: '24' })
  })

  it('drops a unit said aloud, because the field already carries it', () => {
    expect(interpretUtterance('five quarts', 'number')).toEqual({ kind: 'value', value: '5' })
  })

  it('says it did not understand rather than writing nonsense into a number', () => {
    expect(interpretUtterance('the big lever', 'number')).toEqual({ kind: 'unparsed' })
  })
})

describe('reading an oil weight', () => {
  it('joins a multigrade said as three parts', () => {
    expect(interpretUtterance('seventy five W ninety', 'viscosity')).toEqual({
      kind: 'value',
      value: '75W-90',
    })
  })

  it('joins a multigrade said as digits', () => {
    expect(normalizeViscosity('5 W 30')).toBe('5W-30')
  })

  it('tidies one that arrived already joined', () => {
    expect(normalizeViscosity('10w40')).toBe('10W-40')
  })

  it('keeps a hyphen that was already there', () => {
    expect(normalizeViscosity('75W-140')).toBe('75W-140')
  })

  it('handles "weight" said instead of the letter', () => {
    expect(normalizeViscosity('5 weight 30')).toBe('5W-30')
  })

  it('leaves a single-grade oil alone', () => {
    expect(normalizeViscosity('SAE 30')).toBe('SAE 30')
  })

  it('leaves a described fluid alone rather than forcing it into a grade', () => {
    expect(normalizeViscosity('synthetic gear oil')).toBe('synthetic gear oil')
  })
})

describe('reading a part number', () => {
  it('closes up the gaps, because a part number has no spaces', () => {
    expect(interpretUtterance('F L 500 S', 'partNumber')).toEqual({ kind: 'value', value: 'FL500S' })
  })

  it('keeps a hyphen', () => {
    expect(interpretUtterance('fl-500-s', 'partNumber')).toEqual({
      kind: 'value',
      value: 'FL-500-S',
    })
  })
})

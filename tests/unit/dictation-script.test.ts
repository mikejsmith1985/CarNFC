// Unit tests for the ordered questions hands-free mode asks for each log category.

import { describe, expect, it } from 'vitest'
import { getDictationScript, summarizeAnswer } from '@/lib/voice/dictation-script'
import type { LogCategory } from '@/types/servicecard'

const EVERY_CATEGORY: LogCategory[] = ['maintenance', 'repair', 'replace', 'upgrade']

describe('getDictationScript', () => {
  it.each(EVERY_CATEGORY)('has questions for %s', (category) => {
    expect(getDictationScript(category).length).toBeGreaterThan(0)
  })

  it.each(EVERY_CATEGORY)('asks for the odometer first in %s, hands being dirtiest early', (category) => {
    expect(getDictationScript(category)[0]?.field).toBe('odometer')
  })

  it.each(EVERY_CATEGORY)('ends %s with the free-text notes', (category) => {
    const script = getDictationScript(category)
    expect(script[script.length - 1]?.field).toBe('notes')
  })

  it.each(EVERY_CATEGORY)('never asks the same field twice in %s', (category) => {
    const fields = getDictationScript(category).map((question) => question.field)
    expect(new Set(fields).size).toBe(fields.length)
  })

  it.each(EVERY_CATEGORY)('gives every question in %s something to say out loud', (category) => {
    for (const question of getDictationScript(category)) {
      expect(question.prompt.trim().length).toBeGreaterThan(0)
    }
  })

  it('asks a maintenance job what fluid went in, and how much', () => {
    const fields = getDictationScript('maintenance').map((question) => question.field)
    expect(fields).toContain('fluidType')
    expect(fields).toContain('quantity')
  })

  it('reads the oil question as a viscosity, so "seventy five W ninety" lands correctly', () => {
    const fluid = getDictationScript('maintenance').find(
      (question) => question.field === 'fluidType',
    )
    expect(fluid?.kind).toBe('viscosity')
  })

  it('asks a repair for the symptom before the diagnosis', () => {
    const fields = getDictationScript('repair').map((question) => question.field)
    expect(fields.indexOf('symptom')).toBeLessThan(fields.indexOf('diagnosis'))
  })

  it('asks a replacement for both part numbers', () => {
    const fields = getDictationScript('replace').map((question) => question.field)
    expect(fields).toContain('oldPartNumber')
    expect(fields).toContain('newPartNumber')
  })

  it('never asks for a spec override by voice, because that needs a screen', () => {
    const fields = getDictationScript('upgrade').map((question) => String(question.field))
    expect(fields).not.toContain('specOverrides')
  })
})

describe('summarizeAnswer', () => {
  it('reads a recorded answer back for confirmation', () => {
    expect(summarizeAnswer('odometer', '123400')).toBe('Odometer, 123400 miles.')
  })

  it('says when a question was skipped rather than reading back nothing', () => {
    expect(summarizeAnswer('quantity', '')).toBe('Quantity used, skipped.')
  })

  it('falls back to the field name for anything it has no phrasing for', () => {
    expect(summarizeAnswer('notes', 'topped up the diff')).toBe('Notes, topped up the diff.')
  })
})

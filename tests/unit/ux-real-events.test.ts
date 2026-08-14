// Enforces Article V's "real events, never synthetic" rule by scanning the UX spec sources.

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SPEC_DIR = join(process.cwd(), 'tests', 'ux', 'e2e')

function readSpecs(): Array<{ name: string; source: string }> {
  return readdirSync(SPEC_DIR)
    .filter((name) => name.endsWith('.cy.ts'))
    .map((name) => ({ name, source: readFileSync(join(SPEC_DIR, name), 'utf8') }))
}

describe('UX specs use real events (Article V)', () => {
  const specs = readSpecs()

  it('finds spec files to check', () => {
    expect(specs.length).toBeGreaterThan(0)
  })

  for (const spec of specs) {
    it(`${spec.name} never calls synthetic .click()`, () => {
      // `.realClick()` contains "Click" but not ".click(", so this matches only
      // the synthetic form Article V forbids.
      const synthetic = spec.source.match(/\.click\(/g) ?? []
      expect(synthetic, `${spec.name} uses synthetic .click()`).toEqual([])
    })

    it(`${spec.name} never calls synthetic .trigger('click')`, () => {
      const triggered = spec.source.match(/\.trigger\(\s*['"]click['"]/g) ?? []
      expect(triggered).toEqual([])
    })
  }

  it('at least one spec exercises a real click, proving the plugin is wired', () => {
    const usesRealEvents = specs.some((spec) => spec.source.includes('.realClick('))
    expect(usesRealEvents).toBe(true)
  })
})

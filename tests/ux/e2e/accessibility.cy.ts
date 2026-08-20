// Accessibility and responsive checks: contrast, touch targets, and no sideways scrolling at any phone width.

import { cardPath, DEMO, MIN_TOUCH_TARGET } from '../support/fixtures'

/** Widths spanning the smallest phone still in use to a large modern handset (SC-010). */
const PHONE_WIDTHS = [320, 375, 390, 430]

const PAGES = [
  { name: 'component card', path: cardPath(DEMO.components.frontDiff) },
  { name: 'energy logger', path: cardPath(DEMO.components.fuelDoor) },
  { name: 'garage', path: '/garage' },
  { name: 'vehicle overview', path: `/v/${DEMO.vehicleSlug}` },
]

describe('touch targets (FR-014, SC-008)', () => {
  beforeEach(() => cy.signInAsDemoOwner())

  for (const page of PAGES) {
    it(`meets the 48px floor on the ${page.name}`, () => {
      cy.visit(page.path)

      cy.get('button:visible, a:visible, select:visible, input:visible').each(($element) => {
        const rect = $element[0]!.getBoundingClientRect()
        // Gloved thumbs, poor light, awkward angles — this is not cosmetic.
        expect(
          Math.round(rect.height),
          `${$element.prop('tagName')} "${$element.text().trim().slice(0, 30)}"`,
        ).to.be.at.least(MIN_TOUCH_TARGET)
      })
    })
  }
})

describe('responsive layout (SC-010)', () => {
  beforeEach(() => cy.signInAsDemoOwner())

  for (const width of PHONE_WIDTHS) {
    it(`never scrolls sideways at ${width}px`, () => {
      cy.viewport(width, 800)
      cy.visit(cardPath(DEMO.components.frontDiff))
      cy.assertNoHorizontalScroll()
    })
  }

  it('keeps the energy logger usable at the narrowest width', () => {
    cy.viewport(320, 800)
    cy.visit(cardPath(DEMO.components.fuelDoor))

    cy.contains('Gallons pumped').should('be.visible')
    cy.assertNoHorizontalScroll()
  })
})

describe('contrast (SC-008)', () => {
  beforeEach(() => cy.signInAsDemoOwner())

  it('clears 4.5:1 for body text against its background', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))

    cy.get('body').then(($body) => {
      const style = window.getComputedStyle($body[0]!)
      const ratio = contrastRatio(style.color, style.backgroundColor)
      expect(ratio, 'body text contrast').to.be.at.least(4.5)
    })
  })

  it('clears 4.5:1 for secondary text, which carries the spec labels', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))

    cy.contains('Drain torque').then(($element) => {
      const style = window.getComputedStyle($element[0]!)
      const background = window.getComputedStyle(document.body).backgroundColor
      expect(contrastRatio(style.color, background)).to.be.at.least(4.5)
    })
  })
})

/** WCAG relative contrast between two CSS colours. */
function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

function relativeLuminance(cssColor: string): number {
  const match = cssColor.match(/\d+(\.\d+)?/g)
  if (!match || match.length < 3) return 0

  const [red, green, blue] = match.slice(0, 3).map((value) => {
    const channel = Number(value) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}

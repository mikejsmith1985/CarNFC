// The core journey: tap a tag, get the exact part, with everything needed before the drain plug comes out.

import { cardPath, DEMO, MIN_TOUCH_TARGET } from '../support/fixtures'

describe('scan to card (US1)', () => {
  beforeEach(() => {
    cy.signInAsDemoOwner()
  })

  it('lands on the right component with its specs and identity', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))

    cy.contains(DEMO.vehicleLabel).should('be.visible')
    cy.contains(DEMO.odometer.toLocaleString()).should('be.visible')
    cy.contains('Front Differential').should('be.visible')
  })

  it('shows the mechanics HUD with torque and capacity before any interaction', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))

    // These are what someone reads while holding a wrench. They must be on the
    // first paint, not behind a tab or an accordion.
    cy.contains('Tools & Specifications').should('be.visible')
    cy.contains('Drain torque').should('be.visible')
    cy.contains('ft-lbs').should('be.visible')
    cy.contains('Capacity').should('be.visible')
  })

  it('never asks a signed-in owner to sign in again (FR-005)', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.url().should('include', cardPath(DEMO.components.frontDiff))
    cy.contains('Send code').should('not.exist')
  })

  it('offers every primary action without navigating away (FR-006)', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))

    cy.contains('button', 'Service').should('be.visible')
    cy.contains('button', 'Repair').should('be.visible')
    cy.contains('button', 'Upgrade').should('be.visible')
    // Opening one must not leave the card.
    cy.contains('button', 'Service').realClick()
    cy.url().should('include', cardPath(DEMO.components.frontDiff))
  })

  it('meets the touch-target floor on every control (FR-014)', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))

    cy.get('button:visible, a:visible').each(($element) => {
      const rect = $element[0]!.getBoundingClientRect()
      expect(Math.round(rect.height)).to.be.at.least(MIN_TOUCH_TARGET)
    })
  })

  it('renders an empty history invitingly rather than as an error', () => {
    cy.visit(cardPath(DEMO.components.engineOil))
    cy.contains('History').should('be.visible')
  })

  it('redirects a tag scan to the readable address', () => {
    cy.readDemoTag(DEMO.components.frontDiff).then((tagId) => {
      cy.visit(`/t/${tagId}`)
      cy.url().should('include', cardPath(DEMO.components.frontDiff))
    })
  })

  it('discloses nothing for a tag belonging to someone else', () => {
    cy.clearCookies()
    cy.readDemoTag(DEMO.components.frontDiff).then((tagId) => {
      cy.visit(`/t/${tagId}`, { failOnStatusCode: false })
      cy.contains(DEMO.vehicleLabel).should('not.exist')
      cy.contains('Front Differential').should('not.exist')
    })
  })
})

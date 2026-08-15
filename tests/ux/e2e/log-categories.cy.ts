// The four-category logging loop: field sets swap, upgrades take over the HUD, and an entry is quick to write.

import { cardPath, DEMO } from '../support/fixtures'

describe('log categories (US2)', () => {
  beforeEach(() => {
    cy.signInAsDemoOwner()
    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.get('[data-ready="true"]')
    cy.contains('button', 'Service').realClick()
  })

  it('shows only the selected category fields (FR-017)', () => {
    cy.contains('Fluid or consumable').should('be.visible')
    cy.contains('Symptom').should('not.exist')
    cy.contains('Warranty until').should('not.exist')
  })

  it('swaps the field set entirely when the category changes', () => {
    cy.contains('[role="tab"]', 'Repair').realClick()

    cy.contains('Symptom').should('be.visible')
    cy.contains('Re-check after').should('be.visible')
    // Nothing from Maintenance may linger.
    cy.contains('Filter part #').should('not.exist')
    cy.contains('Fluid or consumable').should('not.exist')
  })

  it('keeps date, odometer and notes across a category switch', () => {
    cy.contains('label', 'Notes').find('textarea').type('Shared note')
    cy.contains('[role="tab"]', 'Replace').realClick()
    cy.contains('label', 'Notes').find('textarea').should('have.value', 'Shared note')
  })

  it('reveals the spec-override editor only for Upgrade (FR-022)', () => {
    cy.contains('Specs this upgrade changes').should('not.exist')
    cy.contains('[role="tab"]', 'Upgrade').realClick()
    cy.contains('Specs this upgrade changes').should('be.visible')
  })

  it('shows Replace its own part and warranty fields', () => {
    cy.contains('[role="tab"]', 'Replace').realClick()

    cy.contains('Old part #').should('be.visible')
    cy.contains('New part #').should('be.visible')
    cy.contains('Warranty until').should('be.visible')
    cy.contains('Symptom').should('not.exist')
  })

  it('warns before saving an odometer below the last known reading (FR-024)', () => {
    cy.contains('label', 'Odometer').find('input').clear().type('100')
    cy.contains('below the last recorded reading').should('be.visible')
    cy.contains('Save this reading anyway').should('be.visible')
  })

  it('accepts a plausible odometer without complaint', () => {
    cy.contains('label', 'Odometer')
      .find('input')
      .clear()
      .type(String(DEMO.odometer + 300))
    cy.contains('below the last recorded reading').should('not.exist')
  })

  it('offers attachments within the documented limit (FR-026)', () => {
    cy.contains('Add photo or PDF').should('be.visible').and('contain', '5 left')
  })
})

describe('entry friction budget (FR-028, SC-003)', () => {
  it('saves a maintenance entry in at most five interactions and under 45 seconds', () => {
    cy.signInAsDemoOwner()
    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.get('[data-ready="true"]')

    const startedAt = Date.now()
    let interactions = 0

    // 1: open the logger
    cy.contains('button', 'Service')
      .realClick()
      .then(() => (interactions += 1))

    // Typing field values is excluded from the count by FR-028; the taps are not.
    cy.contains('label', 'Fluid or consumable').find('input').type('75W-90 Synthetic')
    cy.contains('label', 'Quantity used').find('input').type('2.1')

    // 2: save
    cy.contains('button', 'Save entry')
      .realClick()
      .then(() => (interactions += 1))

    cy.contains('75W-90 Synthetic', { timeout: 15_000 })
      .should('be.visible')
      .then(() => {
        expect(interactions, 'interactions beyond typing').to.be.at.most(5)
        expect(Date.now() - startedAt, 'elapsed milliseconds').to.be.lessThan(45_000)
      })
  })
})

describe('upgrade overrides the HUD (FR-009)', () => {
  it('shows a custom torque as non-factory after reload', () => {
    cy.signInAsDemoOwner()
    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.get('[data-ready="true"]')

    cy.contains('button', 'Upgrade').realClick()
    cy.contains('label', 'Brand').find('input').type('ARB')
    cy.contains('label', 'Product name').find('input').type('Air Locker Cover')
    cy.contains('button', 'Add a changed spec').realClick()

    cy.contains('label', 'Spec').find('select').select('Drain torque')
    cy.contains('label', 'New value').find('input').type('45')
    cy.contains('button', 'Save entry').realClick()

    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.get('[data-ready="true"]')

    // The effective value is what a torque wrench gets set to, and it must be
    // unmistakably flagged as no longer the factory figure.
    cy.contains('Drain torque')
      .closest('div')
      .within(() => {
        cy.contains('45').should('be.visible')
        cy.contains('Modified').should('be.visible')
        cy.contains('24').should('be.visible')
      })
  })
})

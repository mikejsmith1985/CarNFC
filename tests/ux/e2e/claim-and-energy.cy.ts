// Claiming a stock tag (US3) and the energy loggers a fuel or charge port opens (US4).

import { cardPath, DEMO } from '../support/fixtures'

describe('claim a tag (US3)', () => {
  beforeEach(() => {
    cy.signInAsDemoOwner()
  })

  it('routes an unclaimed tag to the claim flow with the tag id preserved (FR-002)', () => {
    cy.readDemoTag('unclaimed').then((tagId) => {
      cy.visit(`/t/${tagId}`)
      cy.url().should('include', '/claim')
      cy.url().should('include', tagId)
    })
  })

  it('completes in two steps and lands on the new card', () => {
    cy.readDemoTag('unclaimed').then((tagId) => {
      cy.visit(`/claim?tag_id=${tagId}`)
      cy.get('[data-ready="true"]') // wait for hydration before clicking

      cy.contains('Which vehicle?').should('be.visible')
      cy.contains('button', DEMO.vehicleLabel).realClick()

      cy.contains('What is this tag on?').should('be.visible')
      cy.get('[data-ready="true"]')
      cy.contains('button', 'Transfer Case').realClick()
      cy.contains('button', 'Claim this tag').realClick()

      cy.url({ timeout: 15_000 }).should('include', `/v/${DEMO.vehicleSlug}/c/`)
      cy.contains('Transfer Case').should('be.visible')
    })
  })

  it('pre-populates specs from the library so the HUD is useful immediately (FR-053)', () => {
    cy.readDemoTag('unclaimed').then((tagId) => {
      cy.visit(`/claim?tag_id=${tagId}`)
      cy.get('[data-ready="true"]') // wait for hydration before clicking
      cy.contains('button', DEMO.vehicleLabel).realClick()
      cy.contains('button', 'Transfer Case').realClick()
      cy.contains('button', 'Claim this tag').realClick()

      cy.contains('Tools & Specifications', { timeout: 15_000 }).should('be.visible')
      cy.contains('Fluid').should('be.visible')
    })
  })

  it('hides a charge port from a gasoline vehicle (FR-029)', () => {
    cy.readDemoTag('unclaimed').then((tagId) => {
      cy.visit(`/claim?tag_id=${tagId}`)
      cy.get('[data-ready="true"]') // wait for hydration before clicking
      cy.contains('button', DEMO.vehicleLabel).realClick()

      // Binding one would produce a card that can never be used.
      cy.contains('button', 'EV Charge Port').should('not.exist')
      cy.contains('button', 'Fuel Filler').should('be.visible')
    })
  })

  it('lets a vehicle be created inside the flow without losing the tag (US3 scenario 3)', () => {
    cy.readDemoTag('unclaimed').then((tagId) => {
      cy.visit(`/claim?tag_id=${tagId}`)
      cy.get('[data-ready="true"]') // wait for hydration before clicking
      cy.contains('button', 'Add a vehicle').realClick()

      cy.contains('label', 'Nickname').find('input').type('Second Truck')
      cy.contains('label', 'Make').find('input').type('Toyota')
      cy.contains('button', 'Add vehicle').realClick()

      // Still in the claim flow, still holding the tag.
      cy.contains('What is this tag on?', { timeout: 15_000 }).should('be.visible')
      cy.url().should('include', tagId)
    })
  })
})

describe('energy logging (US4)', () => {
  beforeEach(() => {
    cy.signInAsDemoOwner()
  })

  it('opens the energy logger for a fuel-door tag rather than the standard card (FR-004)', () => {
    cy.visit(cardPath(DEMO.components.fuelDoor))

    cy.contains('Gallons pumped').should('be.visible')
    // No service card furniture here.
    cy.contains('Tools & Specifications').should('not.exist')
  })

  it('offers only fuel on a gasoline vehicle (FR-029)', () => {
    cy.visit(cardPath(DEMO.components.fuelDoor))
    cy.contains('[role="tab"]', 'Charge').should('not.exist')
  })

  it('derives total cost from gallons and unit price (FR-031)', () => {
    cy.visit(cardPath(DEMO.components.fuelDoor))

    cy.contains('label', 'Gallons pumped').find('input').type('20')
    cy.contains('label', 'Price / gal').find('input').type('3.5').should('have.value', '3.5').blur()

    cy.contains('label', 'Total cost').find('input').should('have.value', '70')
  })

  it('computes 15.0 mpg for 300 miles on 20 gallons (SC-006)', () => {
    cy.visit(cardPath(DEMO.components.fuelDoor))

    // First fill establishes the baseline.
    cy.contains('label', 'Odometer').find('input').clear().type(String(DEMO.odometer))
    cy.contains('label', 'Gallons pumped').find('input').type('18')
    cy.contains('button', 'Save fill-up').realClick()
    cy.contains('Fill-up saved', { timeout: 15_000 }).should('be.visible')

    // Second fill, 300 miles later on 20 gallons.
    cy.visit(cardPath(DEMO.components.fuelDoor))
    cy.contains('label', 'Odometer')
      .find('input')
      .clear()
      .type(String(DEMO.odometer + 300))
    cy.contains('label', 'Gallons pumped').find('input').type('20')

    cy.contains('15 mpg').should('be.visible')
  })

  it('explains why a partial fill produces no economy figure (FR-033)', () => {
    // Establishes its own baseline rather than inheriting one from the test
    // above: economy needs a previous entry AND distance between the two, so a
    // test that supplies neither is told "no distance covered" — which is the
    // right answer to a different question.
    cy.visit(cardPath(DEMO.components.fuelDoor))
    cy.contains('label', 'Odometer').find('input').clear().type(String(DEMO.odometer))
    cy.contains('label', 'Gallons pumped').find('input').type('18')
    cy.contains('button', 'Save fill-up').realClick()
    cy.contains('Fill-up saved', { timeout: 15_000 }).should('be.visible')

    cy.visit(cardPath(DEMO.components.fuelDoor))
    cy.contains('label', 'Odometer')
      .find('input')
      .clear()
      .type(String(DEMO.odometer + 200))
    cy.contains('label', 'Gallons pumped').find('input').type('10')
    // Splashing in ten gallons is not a full tank, so the volume between the
    // two readings is not the fuel actually burned.
    cy.contains('button', 'Filled the tank').realClick()

    cy.contains('Partial fill').should('be.visible')
  })
})

// The offline journey (US5): read a cached card with no signal, log against it, and watch it upload by itself.

import { cardPath, DEMO } from '../support/fixtures'

/** Cypress cannot toggle a real radio, so the browser's own offline mode is used. */
function goOffline() {
  cy.log('**going offline**')
  return Cypress.automation('remote:debugger:protocol', {
    command: 'Network.emulateNetworkConditions',
    params: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
  })
}

function goOnline() {
  cy.log('**going online**')
  return Cypress.automation('remote:debugger:protocol', {
    command: 'Network.emulateNetworkConditions',
    params: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  })
}

describe('offline capture and sync (US5)', () => {
  beforeEach(() => {
    cy.signInAsDemoOwner()
  })

  afterEach(() => {
    goOnline()
  })

  it('renders a previously visited card from cache with a staleness stamp (FR-038)', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.contains('Tools & Specifications').should('be.visible')

    goOffline()
    cy.reload()

    cy.contains('Drain torque').should('be.visible')
    cy.contains('Showing a saved copy').should('be.visible')
  })

  it('accepts a log entry with no connectivity and marks it pending (FR-039)', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))
    goOffline()

    cy.contains('button', 'Service').realClick()
    cy.contains('label', 'Fluid or consumable').find('input').type('Offline fluid')
    cy.contains('button', 'Save entry').realClick()

    // Saved on the device, and the owner is told so plainly.
    cy.contains(/saved here|upload when you have signal/i, { timeout: 15_000 }).should('be.visible')
  })

  it('uploads by itself when signal returns, with no button to press (FR-040)', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))
    goOffline()

    cy.contains('button', 'Service').realClick()
    cy.contains('label', 'Fluid or consumable').find('input').type('Syncs by itself')
    cy.contains('button', 'Save entry').realClick()
    cy.contains(/saved here/i, { timeout: 15_000 }).should('be.visible')

    goOnline()
    cy.window().trigger('online')

    cy.contains(/saved here/i, { timeout: 30_000 }).should('not.exist')

    cy.reload()
    cy.contains('Syncs by itself').should('be.visible')
  })

  it('says plainly when a card was never loaded online (FR-038)', () => {
    goOffline()
    cy.visit('/v/raptor/c/never-visited', { failOnStatusCode: false })
    cy.contains(/no connection|offline/i).should('be.visible')
  })

  it('shows the offline state in the sync indicator', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))
    goOffline()
    cy.window().trigger('offline')

    cy.contains(/offline/i).should('be.visible')
  })
})

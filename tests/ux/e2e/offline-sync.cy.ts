// The offline journey (US5): read a cached card with no signal, log against it, and watch it upload by itself.

import { cardPath, DEMO, HYDRATION_TIMEOUT_MS } from '../support/fixtures'

/*
  Cypress cannot toggle a real radio, so the browser's own offline mode is used.

  The call has to happen inside `cy.then`. `Cypress.automation` is an ordinary
  function, so writing it at the top level of a test runs it while the test body
  is still being read — before `cy.visit` has executed. Every test that
  mentioned going offline anywhere was therefore offline from its very first
  line: the page load was cut short, the markup arrived without its stylesheet
  or its script, and the card never hydrated. It looked like a hydration bug for
  a long time. `cy.wrap` around the promise does not help, because the promise
  has already been created by then.
*/
function goOffline() {
  cy.log('**going offline**')
  return cy.then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'Network.emulateNetworkConditions',
      params: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
    }),
  )
}

function goOnline() {
  cy.log('**going online**')
  return cy.then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'Network.emulateNetworkConditions',
      params: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
    }),
  )
}

/**
 * Waits for the service worker to finish taking over.
 *
 * These are the only specs that depend on a worker being in charge, and it
 * installs and claims the page while the first visit is still loading. Asserting
 * before that settles races a real, expected, one-time event.
 */
function waitForServiceWorker() {
  // Polls for a controller rather than awaiting `serviceWorker.ready`, which
  // does not settle here — a registration can exist and be activating while
  // `ready` is still waiting, and a hung promise reports as a timeout with
  // nothing to diagnose.
  cy.window({ timeout: HYDRATION_TIMEOUT_MS })
    .its('navigator.serviceWorker.controller', { timeout: HYDRATION_TIMEOUT_MS })
    .should('not.be.null')
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
    cy.get('[data-ready="true"]', { timeout: HYDRATION_TIMEOUT_MS })
    waitForServiceWorker()
    cy.contains('Tools & Specifications').should('be.visible')

    goOffline()
    cy.reload()

    cy.contains('Drain torque').should('be.visible')
    cy.contains('Showing a saved copy').should('be.visible')
  })

  it('accepts a log entry with no connectivity and marks it pending (FR-039)', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.get('[data-ready="true"]', { timeout: HYDRATION_TIMEOUT_MS })
    waitForServiceWorker()
    goOffline()

    cy.contains('button', 'Service').realClick()
    cy.contains('label', 'Fluid or consumable').find('input').type('Offline fluid')
    cy.contains('button', 'Save entry').realClick()

    // Saved on the device, and the owner is told so plainly.
    cy.contains(/saved here|upload when you have signal/i, { timeout: 15_000 }).should('be.visible')
  })

  it('uploads by itself when signal returns, with no button to press (FR-040)', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.get('[data-ready="true"]', { timeout: HYDRATION_TIMEOUT_MS })
    waitForServiceWorker()
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
    // Signal is lost while the app is already in use, which is the only way it
    // happens in life. Going offline before the worker controls the page leaves
    // nothing able to answer the request, so there would be no fallback to show.
    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.get('[data-ready="true"]', { timeout: HYDRATION_TIMEOUT_MS })
    waitForServiceWorker()

    goOffline()
    cy.visit('/v/raptor/c/never-visited', { failOnStatusCode: false })
    cy.contains(/no connection|offline/i).should('be.visible')
  })

  it('shows the offline state in the sync indicator', () => {
    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.get('[data-ready="true"]', { timeout: HYDRATION_TIMEOUT_MS })
    waitForServiceWorker()
    goOffline()
    cy.window().trigger('offline')

    cy.contains(/offline/i).should('be.visible')
  })
})

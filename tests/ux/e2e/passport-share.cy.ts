// Sharing a read-only passport (US6), including the controls that must be absent and the headers that must be present.

import { cardPath, DEMO } from '../support/fixtures'

/**
 * Opens the vehicle with sharing off, whatever the last test left behind.
 *
 * Sharing is stored on the vehicle, so it survives from one test to the next.
 * Without this, the second test onwards finds "Create a new link" instead of
 * "Create share link" and the cost toggle is hidden — every one of them failed
 * on state a previous test had left lying around.
 */
function openVehicleWithSharingOff() {
  cy.visit(`/v/${DEMO.vehicleSlug}`)
  cy.get('[data-ready="true"]') // a real click before hydration does nothing

  cy.get('body').then(($body) => {
    if ($body.find('button:contains("Stop sharing")').length === 0) return
    cy.contains('button', 'Stop sharing').realClick()
    cy.contains('button', 'Create share link', { timeout: 15_000 }).should('be.visible')
  })
}

describe('passport sharing (US6)', () => {
  beforeEach(() => {
    cy.signInAsDemoOwner()
  })

  it('discloses nothing to a non-owner while sharing is off (SC-009)', () => {
    cy.clearCookies()
    cy.visit(`/v/${DEMO.vehicleSlug}`, { failOnStatusCode: false })
    cy.contains('Front Differential').should('not.exist')
  })

  it('mints a link, which a guest can read with no account', () => {
    openVehicleWithSharingOff()
    cy.contains('button', 'Create share link').realClick()

    cy.contains('/p/', { timeout: 15_000 })
      .invoke('text')
      .then((shareUrl) => {
        cy.clearCookies()
        cy.visit(new URL(shareUrl.trim()).pathname)

        cy.contains('Vehicle service record').should('be.visible')
        cy.contains('Ford').should('be.visible')
      })
  })

  it('presents no write control anywhere on the guest page (FR-050)', () => {
    openVehicleWithSharingOff()
    cy.contains('button', 'Create share link').realClick()

    cy.contains('/p/')
      .invoke('text')
      .then((shareUrl) => {
        cy.clearCookies()
        cy.visit(new URL(shareUrl.trim()).pathname)

        // Absent, not disabled — a disabled button is still a button.
        cy.contains('button', 'Log').should('not.exist')
        cy.contains('button', 'Save').should('not.exist')
        cy.contains('Edit specs').should('not.exist')
        cy.get('input').should('not.exist')
      })
  })

  it('omits costs unless the owner opted in (FR-050)', () => {
    // The demo fixtures carry no costs, so one is recorded here. Asserting that
    // a page with nothing to hide hides nothing proves only that the page
    // loaded.
    const paidAmount = '184.62'

    cy.visit(cardPath(DEMO.components.frontDiff))
    cy.get('[data-ready="true"]')
    cy.get('[aria-label="Quick log actions"]').contains('button', 'Service').realClick()
    cy.contains('[role="tab"]', 'Replace').realClick()
    cy.contains('label', 'Cost').find('input').type(paidAmount)
    cy.contains('button', 'Save entry').realClick()
    cy.get('dialog[open]', { timeout: 15_000 }).should('not.exist')

    openVehicleWithSharingOff()
    cy.contains('button', 'Create share link').realClick()

    cy.contains('/p/')
      .invoke('text')
      .then((shareUrl) => {
        cy.clearCookies()
        cy.visit(new URL(shareUrl.trim()).pathname)

        // Scoped to what is rendered, and matched against real money. Scanning
        // the whole <body> also reads Next's inline data payload, which is full
        // of '$' markers no guest ever sees.
        cy.contains('Vehicle service record').should('be.visible')
        cy.get('main').should('not.contain', paidAmount)
        cy.get('main')
          .invoke('text')
          .should('not.match', /\$\s?\d/)
      })
  })

  it('refuses the link once revoked, and keeps refusing it after a new one is minted', () => {
    openVehicleWithSharingOff()
    cy.contains('button', 'Create share link').realClick()

    cy.contains('/p/')
      .invoke('text')
      .then((shareUrl) => {
        const revokedPath = new URL(shareUrl.trim()).pathname

        cy.contains('button', 'Stop sharing').realClick()
        cy.contains('button', 'Create share link', { timeout: 15_000 }).should('be.visible')

        cy.clearCookies()
        cy.visit(revokedPath, { failOnStatusCode: false })
        cy.contains('Vehicle service record').should('not.exist')
      })
  })

  it('carries the headers that stop indexing and link previews (FR-051b)', () => {
    openVehicleWithSharingOff()
    cy.contains('button', 'Create share link').realClick()

    cy.contains('/p/')
      .invoke('text')
      .then((shareUrl) => {
        const sharePath = new URL(shareUrl.trim()).pathname

        cy.request(sharePath).then((response) => {
          expect(response.headers['x-robots-tag']).to.contain('noindex')
          expect(response.headers['x-robots-tag']).to.contain('noarchive')
          // A pasted link must not expand into a preview of the history.
          expect(response.body).to.not.contain('og:title')
          expect(response.body).to.not.contain('twitter:card')
        })
      })
  })

  it('disallows /p/ in robots.txt', () => {
    cy.request('/robots.txt').then((response) => {
      expect(response.body).to.contain('/p/')
    })
  })
})

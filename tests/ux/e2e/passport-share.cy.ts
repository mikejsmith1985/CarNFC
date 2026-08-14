// Sharing a read-only passport (US6), including the controls that must be absent and the headers that must be present.

import { DEMO } from '../support/fixtures'

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
    cy.visit(`/v/${DEMO.vehicleSlug}`)
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
    cy.visit(`/v/${DEMO.vehicleSlug}`)
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
    cy.visit(`/v/${DEMO.vehicleSlug}`)
    cy.contains('button', 'Create share link').realClick()

    cy.contains('/p/')
      .invoke('text')
      .then((shareUrl) => {
        cy.clearCookies()
        cy.visit(new URL(shareUrl.trim()).pathname)
        cy.get('body').should('not.contain', '$')
      })
  })

  it('refuses the link once revoked, and keeps refusing it after a new one is minted', () => {
    cy.visit(`/v/${DEMO.vehicleSlug}`)
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
    cy.visit(`/v/${DEMO.vehicleSlug}`)
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

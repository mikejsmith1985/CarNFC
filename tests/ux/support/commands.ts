// Custom Cypress commands shared by the UX specs.

import { DEMO } from './fixtures'

declare global {
  namespace Cypress {
    interface Chainable {
      /** Signs in as the seeded demo owner, bypassing the emailed code. */
      signInAsDemoOwner(): Chainable<void>
      /** Returns the tag id bound to a seeded component. */
      readDemoTag(componentSlug: string): Chainable<string>
      /** Asserts the page never scrolls sideways at the current viewport. */
      assertNoHorizontalScroll(): Chainable<void>
    }
  }
}

/**
 * Signs in without going through the emailed code.
 *
 * The local Supabase stack exposes a fixed test OTP, so the real verify path is
 * exercised rather than a mocked session — the point is that the session cookie
 * is genuine, not that the email arrived.
 */
Cypress.Commands.add('signInAsDemoOwner', () => {
  cy.session('demo-owner', () => {
    cy.request('POST', '/api/test/sign-in', { email: DEMO.email })
  })
})

Cypress.Commands.add('readDemoTag', (componentSlug: string) => {
  return cy
    .request('GET', `/api/test/tag?component=${encodeURIComponent(componentSlug)}`)
    .then((response) => response.body.tagId as string)
})

Cypress.Commands.add('assertNoHorizontalScroll', () => {
  cy.window().then((win) => {
    const documentWidth = win.document.documentElement.scrollWidth
    // A card that scrolls sideways is unusable one-handed under a vehicle.
    expect(documentWidth).to.be.at.most(win.innerWidth + 1)
  })
})

export {}

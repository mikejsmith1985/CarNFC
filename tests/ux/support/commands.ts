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

/**
 * Reads a seeded tag id, retrying through dev-server compilation.
 *
 * Next's dev server compiles routes on demand, and a request arriving while it
 * writes a build manifest gets a 500 from its own loader — visible as
 * `SyntaxError: Unexpected end of JSON input` with the time spent inside
 * next.js rather than application code. It is transient and unrelated to what
 * the specs assert, so it is retried rather than allowed to fail a run.
 */
Cypress.Commands.add('readDemoTag', (componentSlug: string) => {
  const url = `/api/test/tag?component=${encodeURIComponent(componentSlug)}`

  const attempt = (remaining: number): Cypress.Chainable<string> =>
    cy.request({ url, failOnStatusCode: false }).then((response) => {
      if (response.status === 200) return cy.wrap(response.body.tagId as string)
      if (remaining === 0) {
        throw new Error(`${url} returned ${response.status} after retries`)
      }
      return cy.wait(1000).then(() => attempt(remaining - 1))
    })

  return attempt(5)
})

Cypress.Commands.add('assertNoHorizontalScroll', () => {
  cy.window().then((win) => {
    const documentWidth = win.document.documentElement.scrollWidth
    // A card that scrolls sideways is unusable one-handed under a vehicle.
    expect(documentWidth).to.be.at.most(win.innerWidth + 1)
  })
})

export {}

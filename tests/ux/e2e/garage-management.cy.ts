// Managing the garage itself (FR-048, FR-046): adding a vehicle, correcting it, moving a tag, removing it.

import { DEMO, HYDRATION_TIMEOUT_MS } from '../support/fixtures'

/** How much of a tag id the rebinder shows, mirrored here so the assertion matches. */
const TAG_ID_PREVIEW_LENGTH = 8

/**
 * Adds a vehicle and leaves the browser on it.
 *
 * Each test makes its own rather than inheriting one, so a failure part-way
 * through a spec cannot make the next test fail for an unrelated reason.
 */
function addVehicle(nickname: string) {
  cy.visit('/garage')
  cy.get('[data-ready="true"]', { timeout: HYDRATION_TIMEOUT_MS })

  cy.contains('button', 'Add a vehicle').realClick()
  cy.contains('label', 'Nickname').find('input').type(nickname)
  cy.contains('button', 'Add vehicle').realClick()

  cy.contains(nickname, { timeout: HYDRATION_TIMEOUT_MS }).should('be.visible')
  // Ready, not merely present: a real click on a section React has not wired
  // up yet does nothing at all.
  cy.get('[aria-label="Vehicle settings"][data-ready="true"]', {
    timeout: HYDRATION_TIMEOUT_MS,
  }).should('exist')
}

function removeVehicle(nickname: string) {
  // Arriving here by navigation means hydration has to be waited for again.
  cy.get('[aria-label="Vehicle settings"][data-ready="true"]', {
    timeout: HYDRATION_TIMEOUT_MS,
  }).should('exist')
  cy.contains('button', 'Delete this vehicle').scrollIntoView().realClick()
  cy.contains('label', 'to confirm').find('input').type(nickname)
  cy.contains('button', 'Delete forever').realClick()
  cy.url({ timeout: HYDRATION_TIMEOUT_MS }).should('include', '/garage')
}

describe('garage management (FR-048)', () => {
  beforeEach(() => {
    cy.signInAsDemoOwner()
  })

  it('adds a vehicle without needing a tag first, and lands on it', () => {
    const nickname = 'Bench Truck Add'
    addVehicle(nickname)
    cy.url().should('include', '/v/')

    cy.visit('/garage')
    cy.contains(nickname).should('be.visible')

    cy.contains(nickname).realClick()
    removeVehicle(nickname)
  })

  it('renames a vehicle, and the garage shows the new name', () => {
    const nickname = 'Bench Truck Rename'
    const renamed = 'Bench Truck Renamed'
    addVehicle(nickname)

    cy.contains('button', 'Edit details').scrollIntoView().realClick()
    cy.contains('label', 'Nickname').find('input').clear().type(renamed)
    cy.contains('button', 'Save changes').realClick()
    cy.contains(renamed, { timeout: HYDRATION_TIMEOUT_MS }).should('be.visible')

    cy.visit('/garage')
    cy.contains(renamed).should('be.visible')
    cy.contains(nickname).should('not.exist')

    cy.contains(renamed).realClick()
    removeVehicle(renamed)
  })

  it('refuses to delete until the name is typed back exactly', () => {
    const nickname = 'Bench Truck Guard'
    addVehicle(nickname)

    cy.contains('button', 'Delete this vehicle').scrollIntoView().realClick()

    // Nothing typed: the control that destroys a service history stays inert.
    cy.contains('button', 'Delete forever').should('be.disabled')

    cy.contains('label', 'to confirm').find('input').type('not the name')
    cy.contains('button', 'Delete forever').realClick()

    // Still here, and told why.
    cy.contains('to confirm').should('be.visible')
    cy.url().should('include', '/v/')

    cy.contains('label', 'to confirm').find('input').clear().type(nickname)
    cy.contains('button', 'Delete forever').realClick()
    cy.url({ timeout: HYDRATION_TIMEOUT_MS }).should('include', '/garage')
    cy.contains(nickname).should('not.exist')
  })

  it('never touches the seeded vehicle', () => {
    cy.visit('/garage')
    cy.contains(DEMO.vehicleLabel).should('be.visible')
  })
})

describe('moving a tag to another part (FR-046)', () => {
  it('re-points a tag without replacing the hardware', () => {
    cy.signInAsDemoOwner()
    cy.visit(`/v/${DEMO.vehicleSlug}`)
    cy.get('[data-ready="true"]', { timeout: HYDRATION_TIMEOUT_MS })

    cy.readDemoTag(DEMO.components.frontDiff).then((tagId) => {
      cy.get('[aria-label="Tags on this vehicle"][data-ready="true"]', {
        timeout: HYDRATION_TIMEOUT_MS,
      })
        .scrollIntoView()
        .should('be.visible')
      cy.contains(tagId.slice(0, TAG_ID_PREVIEW_LENGTH)).should('be.visible')

      // The identifier printed on the hardware never changes; only what it
      // points at does.
      cy.contains(tagId.slice(0, TAG_ID_PREVIEW_LENGTH))
        .closest('li')
        .within(() => {
          cy.contains('label', 'Now on').find('select').select('Engine Oil & Filter')
          cy.contains('button', 'Move this tag').realClick()
        })

      cy.visit(`/t/${tagId}`)
      cy.url({ timeout: HYDRATION_TIMEOUT_MS }).should('include', '/c/engine-oil')

      // Put it back where every other spec expects to find it.
      cy.visit(`/v/${DEMO.vehicleSlug}`)
      cy.get('[data-ready="true"]', { timeout: HYDRATION_TIMEOUT_MS })
      cy.contains(tagId.slice(0, TAG_ID_PREVIEW_LENGTH))
        .closest('li')
        .within(() => {
          cy.contains('label', 'Now on').find('select').select('Front Differential')
          cy.contains('button', 'Move this tag').realClick()
        })

      cy.visit(`/t/${tagId}`)
      cy.url({ timeout: HYDRATION_TIMEOUT_MS }).should('include', '/c/front-diff')
    })
  })
})

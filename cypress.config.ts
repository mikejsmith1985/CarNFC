// Cypress configuration for the UX layer. Article V requires real events and a dev server started by run-dev-clean.ps1.
import { defineConfig } from 'cypress'

/** Fixed port so run-dev-clean.ps1 and Cypress always agree on the target. */
const DEV_SERVER_PORT = 3100

/** Smallest phone width the card must remain usable at (SC-010). */
const VIEWPORT_WIDTH = 390
const VIEWPORT_HEIGHT = 844

export default defineConfig({
  e2e: {
    baseUrl: `http://localhost:${DEV_SERVER_PORT}`,
    specPattern: 'tests/ux/e2e/**/*.cy.ts',
    supportFile: 'tests/ux/support/e2e.ts',
    fixturesFolder: 'tests/ux/fixtures',
    screenshotsFolder: 'tests/ux/screenshots',
    videosFolder: 'tests/ux/videos',
    viewportWidth: VIEWPORT_WIDTH,
    viewportHeight: VIEWPORT_HEIGHT,
    video: false,
    retries: { runMode: 1, openMode: 0 },
  },
})

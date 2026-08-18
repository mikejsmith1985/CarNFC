// Shared fixture references for UX specs. These match what scripts/seed-demo.ts creates.

export const DEMO = {
  email: 'demo@servicecard.local',
  vehicleSlug: 'raptor',
  vehicleLabel: 'Raptor',
  odometer: 112_450,
  components: {
    frontDiff: 'front-diff',
    engineOil: 'engine-oil',
    /** Also the tag-move spec's fixture: no other spec reads this tag. */
    fuelDoor: 'fuel-door',
  },
} as const

/** The card address a tag scan ultimately lands on. */
export function cardPath(componentSlug: string): string {
  return `/v/${DEMO.vehicleSlug}/c/${componentSlug}`
}

/**
 * Minimum touch target in CSS pixels.
 *
 * Asserted directly in specs rather than trusted to the component library,
 * because a call site can always override a class (FR-014, SC-008).
 */
export const MIN_TOUCH_TARGET = 48

/**
 * How long to allow for a page to become interactive.
 *
 * The dev server compiles a route the first time it is asked for, so whichever
 * spec runs first pays tens of seconds that a warm route never does. Cypress's
 * four-second default turns that into a failure that looks like a broken page —
 * the giveaway is markup with no styling, because the chunks had not arrived.
 */
export const HYDRATION_TIMEOUT_MS = 30_000

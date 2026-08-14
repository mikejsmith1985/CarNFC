// Shared fixture references for UX specs. These match what scripts/seed-demo.ts creates.

export const DEMO = {
  email: 'demo@servicecard.local',
  vehicleSlug: 'raptor',
  vehicleLabel: 'Raptor',
  odometer: 112_450,
  components: {
    frontDiff: 'front-diff',
    engineOil: 'engine-oil',
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

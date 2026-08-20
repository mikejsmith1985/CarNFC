// Unit tests for the parts a zone badge offers to create when it has nothing to show.

import { describe, expect, it } from 'vitest'
import { missingTemplatesForZone } from '@/lib/zones/zone-setup'
import { findZone } from '@/lib/zones/zones'
import type { ComponentTemplateSummary } from '@/lib/claim/compatibility'

const UNDER_HOOD = findZone('under-hood')!
const FUEL_CHARGE = findZone('fuel-charge')!

/** A stand-in library covering both zones under test. */
const LIBRARY: ComponentTemplateSummary[] = [
  {
    key: 'engine-oil',
    displayName: 'Engine Oil & Filter',
    isEnergyPort: false,
    energyModeHint: null,
  },
  { key: 'coolant', displayName: 'Cooling System', isEnergyPort: false, energyModeHint: null },
  { key: 'battery', displayName: '12V Battery', isEnergyPort: false, energyModeHint: null },
  { key: 'transmission', displayName: 'Transmission', isEnergyPort: false, energyModeHint: null },
  { key: 'fuel-door', displayName: 'Fuel Filler', isEnergyPort: true, energyModeHint: 'fuel' },
  {
    key: 'charge-port',
    displayName: 'EV Charge Port',
    isEnergyPort: true,
    energyModeHint: 'charge',
  },
  {
    key: 'rear-differential',
    displayName: 'Rear Differential',
    isEnergyPort: false,
    energyModeHint: null,
  },
]

describe('missingTemplatesForZone', () => {
  // The defect this exists for: a vehicle claimed with one zone badge had no
  // parts at all, so the badge opened to an empty screen and the only way out
  // led back to a vehicle page that could not add parts either.
  it('offers every part in the zone when the vehicle has none', () => {
    const missing = missingTemplatesForZone(UNDER_HOOD, LIBRARY, 'gasoline', [])
    expect(missing.map((template) => template.key)).toEqual([
      'engine-oil',
      'coolant',
      'battery',
      'transmission',
    ])
  })

  it('keeps the zone order rather than the library order', () => {
    const shuffled = [...LIBRARY].reverse()
    const missing = missingTemplatesForZone(UNDER_HOOD, shuffled, 'gasoline', [])
    expect(missing[0]?.key).toBe('engine-oil')
  })

  it('leaves out parts the vehicle already has', () => {
    const missing = missingTemplatesForZone(UNDER_HOOD, LIBRARY, 'gasoline', [
      'engine-oil',
      'battery',
    ])
    expect(missing.map((template) => template.key)).toEqual(['coolant', 'transmission'])
  })

  it('offers nothing once the zone is fully set up', () => {
    const missing = missingTemplatesForZone(UNDER_HOOD, LIBRARY, 'gasoline', [
      'engine-oil',
      'coolant',
      'battery',
      'transmission',
    ])
    expect(missing).toEqual([])
  })

  // A hand-named part carries no template. Treating null as a key would let one
  // unnamed part suppress every offer in the zone.
  it('ignores parts that came from no template', () => {
    const missing = missingTemplatesForZone(UNDER_HOOD, LIBRARY, 'gasoline', [null, null])
    expect(missing).toHaveLength(4)
  })

  it('never offers a fuel filler on an electric vehicle', () => {
    const missing = missingTemplatesForZone(FUEL_CHARGE, LIBRARY, 'electric', [])
    expect(missing.map((template) => template.key)).toEqual(['charge-port'])
  })

  it('never offers a charge port on a fuel vehicle', () => {
    const missing = missingTemplatesForZone(FUEL_CHARGE, LIBRARY, 'gasoline', [])
    expect(missing.map((template) => template.key)).toEqual(['fuel-door'])
  })

  it('offers both to a plug-in hybrid', () => {
    const missing = missingTemplatesForZone(FUEL_CHARGE, LIBRARY, 'both', [])
    expect(missing.map((template) => template.key)).toEqual(['fuel-door', 'charge-port'])
  })

  // The zone declares template keys, not the library. A build whose library is
  // missing a key must skip it rather than render an undefined tile.
  it('skips a zone key the library does not carry', () => {
    const thinLibrary = LIBRARY.filter((template) => template.key !== 'coolant')
    const missing = missingTemplatesForZone(UNDER_HOOD, thinLibrary, 'gasoline', [])
    expect(missing.map((template) => template.key)).toEqual([
      'engine-oil',
      'battery',
      'transmission',
    ])
  })

  it('never offers a part from a different zone', () => {
    const missing = missingTemplatesForZone(UNDER_HOOD, LIBRARY, 'gasoline', [])
    expect(missing.some((template) => template.key === 'rear-differential')).toBe(false)
  })
})

// Unit tests for template/powertrain compatibility at claim time (FR-029, spec Edge Cases).

import { describe, expect, it } from 'vitest'
import {
  checkTemplateCompatibility,
  filterCompatibleTemplates,
  type ComponentTemplateSummary,
} from '@/lib/claim/compatibility'

const fuelDoor: ComponentTemplateSummary = {
  key: 'fuel-door',
  displayName: 'Fuel Filler',
  isEnergyPort: true,
  energyModeHint: 'fuel',
}

const chargePort: ComponentTemplateSummary = {
  key: 'charge-port',
  displayName: 'EV Charge Port',
  isEnergyPort: true,
  energyModeHint: 'charge',
}

const differential: ComponentTemplateSummary = {
  key: 'front-differential',
  displayName: 'Front Differential',
  isEnergyPort: false,
  energyModeHint: null,
}

describe('checkTemplateCompatibility', () => {
  it('rejects a fuel filler on a battery-electric vehicle', () => {
    const result = checkTemplateCompatibility(fuelDoor, 'electric')
    expect(result.isCompatible).toBe(false)
    expect(result.reason).toBe('fuel_port_on_electric')
  })

  it('rejects a charge port on a gasoline vehicle', () => {
    const result = checkTemplateCompatibility(chargePort, 'gasoline')
    expect(result.isCompatible).toBe(false)
    expect(result.reason).toBe('charge_port_on_gasoline')
  })

  it('accepts a fuel filler on a gasoline vehicle', () => {
    expect(checkTemplateCompatibility(fuelDoor, 'gasoline').isCompatible).toBe(true)
  })

  it('accepts a charge port on an electric vehicle', () => {
    expect(checkTemplateCompatibility(chargePort, 'electric').isCompatible).toBe(true)
  })

  it('accepts both energy ports on a plug-in hybrid', () => {
    expect(checkTemplateCompatibility(fuelDoor, 'both').isCompatible).toBe(true)
    expect(checkTemplateCompatibility(chargePort, 'both').isCompatible).toBe(true)
  })

  it('never blocks a non-energy component, whatever the powertrain', () => {
    // A differential on an EV is unusual but real; this is not the product's call.
    expect(checkTemplateCompatibility(differential, 'electric').isCompatible).toBe(true)
    expect(checkTemplateCompatibility(differential, 'gasoline').isCompatible).toBe(true)
  })

  it('explains the rejection in words the owner can act on', () => {
    expect(checkTemplateCompatibility(fuelDoor, 'electric').message).toContain('electric')
  })
})

describe('filterCompatibleTemplates', () => {
  const library = [fuelDoor, chargePort, differential]

  it('hides the charge port from a gasoline vehicle', () => {
    const keys = filterCompatibleTemplates(library, 'gasoline').map((entry) => entry.key)
    expect(keys).toEqual(['fuel-door', 'front-differential'])
  })

  it('hides the fuel filler from an electric vehicle', () => {
    const keys = filterCompatibleTemplates(library, 'electric').map((entry) => entry.key)
    expect(keys).toEqual(['charge-port', 'front-differential'])
  })

  it('keeps everything for a plug-in hybrid', () => {
    expect(filterCompatibleTemplates(library, 'both')).toHaveLength(3)
  })
})

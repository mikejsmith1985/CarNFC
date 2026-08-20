// Checks that a component template makes sense on a given vehicle before a tag is bound to it.

import type { EnergyMode, PowerSource } from '@/types/servicecard'

export interface ComponentTemplateSummary {
  key: string
  displayName: string
  isEnergyPort: boolean
  energyModeHint: EnergyMode | null
}

export type IncompatibilityReason = 'fuel_port_on_electric' | 'charge_port_on_gasoline'

export interface CompatibilityResult {
  isCompatible: boolean
  reason: IncompatibilityReason | null
  message: string | null
}

/**
 * Decides whether a template can be bound to a vehicle.
 *
 * The case that matters is an energy port on the wrong powertrain: a fuel-door
 * tag on a battery-electric car opens a logger asking for gallons, which is not
 * a small annoyance — it is a card that can never be used and a tag that has to
 * be peeled off and re-stuck.
 *
 * Everything non-energy passes. A differential on an EV is unusual but real,
 * and the product has no business second-guessing what someone bolted to their
 * own vehicle.
 */
export function checkTemplateCompatibility(
  template: ComponentTemplateSummary,
  powerSource: PowerSource,
): CompatibilityResult {
  if (!template.isEnergyPort) {
    return { isCompatible: true, reason: null, message: null }
  }

  if (template.energyModeHint === 'fuel' && powerSource === 'electric') {
    return {
      isCompatible: false,
      reason: 'fuel_port_on_electric',
      message: 'This vehicle is electric — it has no fuel filler to tag.',
    }
  }

  if (template.energyModeHint === 'charge' && powerSource === 'gasoline') {
    return {
      isCompatible: false,
      reason: 'charge_port_on_gasoline',
      message: 'This vehicle runs on fuel — it has no charge port to tag.',
    }
  }

  return { isCompatible: true, reason: null, message: null }
}

/** Filters a template library down to what can actually be bound to this vehicle. */
export function filterCompatibleTemplates<TemplateType extends ComponentTemplateSummary>(
  templates: readonly TemplateType[],
  powerSource: PowerSource,
): TemplateType[] {
  return templates.filter(
    (template) => checkTemplateCompatibility(template, powerSource).isCompatible,
  )
}

// Works out which parts a zone badge is still missing, so it can offer to create them.

import { filterCompatibleTemplates, type ComponentTemplateSummary } from '@/lib/claim/compatibility'
import type { Zone } from '@/lib/zones/zones'
import type { PowerSource } from '@/types/servicecard'

/**
 * The parts a zone expects that this vehicle does not have yet.
 *
 * A zone badge is a promise about a place: "everything you reach from the front
 * of the engine bay". On a vehicle whose parts were never created that promise
 * resolves to an empty screen, so the badge has to be able to fill itself in.
 *
 * Kept in the zone's declared order rather than alphabetically, because that is
 * the order someone works in — oil, then coolant, then the battery.
 */
export function missingTemplatesForZone<TemplateType extends ComponentTemplateSummary>(
  zone: Zone,
  templates: readonly TemplateType[],
  powerSource: PowerSource,
  existingTemplateKeys: readonly (string | null)[],
): TemplateType[] {
  const alreadyOnVehicle = new Set(
    existingTemplateKeys.filter((key): key is string => key !== null),
  )
  const byKey = new Map(templates.map((template) => [template.key, template]))

  const candidates = zone.templateKeys
    .filter((key) => !alreadyOnVehicle.has(key))
    .map((key) => byKey.get(key))
    .filter((template): template is TemplateType => template !== undefined)

  // A fuel filler offered on a battery-electric car creates a card that can
  // never be used, so the powertrain filter applies here exactly as it does in
  // the claim wizard.
  return filterCompatibleTemplates(candidates, powerSource)
}

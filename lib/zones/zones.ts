// The working zones a tag can cover, and which parts belong to each.
//
// One tag per part is the sharpest thing this product does — tap the diff, get
// the diff — but nobody is putting twenty tags on a truck. A zone tag is the
// other end of that trade: one badge in a place you already work, covering
// every part you reach from there.
//
// Fixed rather than owner-defined. A zone has to mean the same thing on every
// vehicle for a badge to be worth printing, and three of them cover the places
// a person actually stands: at the engine bay, at the filler, and under the car.

import type { LogCategory } from '@/types/servicecard'

export type ZoneKey = 'under-hood' | 'fuel-charge' | 'underbody'

/** What an owner can set on a part to override where it lives. */
export const NO_ZONE = 'none'

/** A part's placement: a zone, deliberately nowhere, or unset. */
export type ZoneAssignment = ZoneKey | typeof NO_ZONE | null

export interface Zone {
  key: ZoneKey
  label: string
  /** Where the badge goes, in words someone can act on. */
  placement: string
  /** Component template keys this zone is expected to cover. */
  templateKeys: string[]
  /** The category a quick-log button opens for parts in this zone. */
  defaultCategory: LogCategory
}

const ZONES: Zone[] = [
  {
    key: 'under-hood',
    label: 'Under-hood',
    placement: 'Radiator shroud or fuse box lid',
    templateKeys: ['engine-oil', 'coolant', 'battery', 'transmission'],
    defaultCategory: 'maintenance',
  },
  {
    key: 'fuel-charge',
    label: 'Fuel & charging',
    placement: 'Inside the fuel door or charge flap',
    templateKeys: ['fuel-door', 'charge-port'],
    defaultCategory: 'maintenance',
  },
  {
    key: 'underbody',
    label: 'Underbody',
    placement: 'Frame rail or door jamb',
    templateKeys: [
      'front-differential',
      'rear-differential',
      'transfer-case',
      'brakes-front-left',
      'brakes-front-right',
      'brakes-rear-left',
      'brakes-rear-right',
    ],
    defaultCategory: 'maintenance',
  },
]

/** Every zone, in the order they are offered when claiming a tag. */
export function listZones(): Zone[] {
  return ZONES
}

/** One zone by key, or null if the key is not one we define. */
export function findZone(zoneKey: string | null | undefined): Zone | null {
  if (!zoneKey) return null
  return ZONES.find((zone) => zone.key === zoneKey) ?? null
}

/** Whether a string names a zone this build knows about. */
export function isZoneKey(candidate: string | null | undefined): candidate is ZoneKey {
  return findZone(candidate) !== null
}

/**
 * Which of a vehicle's components belong in a zone, in the order to show them.
 *
 * Placement follows the template a part was created from, never its name — an
 * owner can rename a part to anything, and where it physically sits does not
 * change when they do.
 *
 * An owner can override that. They have to be able to: a part added by hand has
 * no template, so nothing here would otherwise know where it is, and a badge on
 * the bonnet could never reach it.
 */
export function componentsInZone<
  ComponentType extends { templateKey: string | null; zoneKey?: string | null },
>(zone: Zone, components: ComponentType[]): ComponentType[] {
  const templateOrder = new Map(zone.templateKeys.map((key, index) => [key, index]))

  const placed = components.filter((component) => resolveZoneKey(component) === zone.key)

  // Template-placed parts keep the zone's declared order, because that is the
  // order someone works in. Anything an owner moved here has no natural place
  // in that sequence, so it follows on the end rather than displacing it.
  return placed.sort((left, right) => {
    const leftIndex = indexWithinZone(left, templateOrder)
    const rightIndex = indexWithinZone(right, templateOrder)
    return leftIndex - rightIndex
  })
}

/** Where a part actually lives: what the owner said, else what its template implies. */
export function resolveZoneKey(component: {
  templateKey: string | null
  zoneKey?: string | null
}): ZoneKey | null {
  const assigned = component.zoneKey

  // Deliberately nowhere. An owner can take a part out of every zone.
  if (assigned === NO_ZONE) return null

  if (isZoneKey(assigned)) return assigned

  // Unset, or naming a zone this build does not define — fall back to the
  // template rather than letting the part disappear from the app entirely.
  return zoneForTemplate(component.templateKey)?.key ?? null
}

/** Sort position within a zone; overridden parts sort after templated ones. */
function indexWithinZone(
  component: { templateKey: string | null; zoneKey?: string | null },
  templateOrder: Map<string, number>,
): number {
  const templateIndex =
    component.templateKey === null ? undefined : templateOrder.get(component.templateKey)

  return templateIndex ?? Number.MAX_SAFE_INTEGER
}

/** The zone a template belongs to, or null when it belongs to none. */
export function zoneForTemplate(templateKey: string | null | undefined): Zone | null {
  if (!templateKey) return null
  return ZONES.find((zone) => zone.templateKeys.includes(templateKey)) ?? null
}

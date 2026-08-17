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
 * Matched on the template a component was created from rather than on its name,
 * because an owner can rename a component to anything and the badge on the
 * bonnet cannot be reprinted. A component with no template — one somebody added
 * by hand — belongs to no zone, which is honest: nothing here knows where it is.
 */
export function componentsInZone<ComponentType extends { templateKey: string | null }>(
  zone: Zone,
  components: ComponentType[],
): ComponentType[] {
  const order = new Map(zone.templateKeys.map((key, index) => [key, index]))

  return components
    .filter((component) => component.templateKey !== null && order.has(component.templateKey))
    .sort((left, right) => {
      const leftIndex = order.get(left.templateKey as string) ?? 0
      const rightIndex = order.get(right.templateKey as string) ?? 0
      return leftIndex - rightIndex
    })
}

/** The zone a template belongs to, or null when it belongs to none. */
export function zoneForTemplate(templateKey: string | null | undefined): Zone | null {
  if (!templateKey) return null
  return ZONES.find((zone) => zone.templateKeys.includes(templateKey)) ?? null
}

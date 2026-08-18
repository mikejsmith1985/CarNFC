// Unit tests for the working zones a single tag can cover.

import { describe, expect, it } from 'vitest'
import {
  componentsInZone,
  findZone,
  isZoneKey,
  listZones,
  zoneForTemplate,
} from '@/lib/zones/zones'

describe('the zone list', () => {
  it('offers three, because a badge in every working place is still only three places', () => {
    expect(listZones()).toHaveLength(3)
  })

  it('gives every zone somewhere to physically put the badge', () => {
    for (const zone of listZones()) {
      expect(zone.placement.trim().length).toBeGreaterThan(0)
    }
  })

  it('never claims the same part for two zones', () => {
    const allKeys = listZones().flatMap((zone) => zone.templateKeys)
    expect(new Set(allKeys).size).toBe(allKeys.length)
  })

  it('covers the drivetrain parts a tag would realistically be stuck near', () => {
    const allKeys = listZones().flatMap((zone) => zone.templateKeys)
    for (const key of ['engine-oil', 'fuel-door', 'charge-port', 'front-differential']) {
      expect(allKeys).toContain(key)
    }
  })
})

describe('findZone', () => {
  it('finds a zone by key', () => {
    expect(findZone('under-hood')?.label).toBe('Under-hood')
  })

  it('returns null for a key it does not define', () => {
    expect(findZone('boot-lid')).toBeNull()
  })

  it('returns null for nothing at all', () => {
    expect(findZone(undefined)).toBeNull()
  })
})

describe('isZoneKey', () => {
  it('accepts a real zone', () => {
    expect(isZoneKey('fuel-charge')).toBe(true)
  })

  // A tag id arrives from a URL, so what it names has to be checked.
  it('rejects anything else', () => {
    expect(isZoneKey('../../etc/passwd')).toBe(false)
  })
})

describe('componentsInZone', () => {
  const components = [
    { slug: 'rear-diff', templateKey: 'rear-differential' },
    { slug: 'engine-oil', templateKey: 'engine-oil' },
    { slug: 'front-diff', templateKey: 'front-differential' },
    { slug: 'coolant', templateKey: 'coolant' },
    { slug: 'homemade', templateKey: null },
  ]

  it('returns only the parts belonging to that zone', () => {
    const underHood = componentsInZone(findZone('under-hood')!, components)
    expect(underHood.map((component) => component.slug)).toEqual(['engine-oil', 'coolant'])
  })

  it('orders them as the zone declares, not as the vehicle stores them', () => {
    const underbody = componentsInZone(findZone('underbody')!, components)
    expect(underbody.map((component) => component.slug)).toEqual(['front-diff', 'rear-diff'])
  })

  // Renaming a component must not move it: the badge on the bonnet cannot be
  // reprinted, so placement follows the template it was created from.
  it('is unaffected by what the owner called the component', () => {
    const renamed = [{ slug: 'my-special-name', templateKey: 'engine-oil' }]
    expect(componentsInZone(findZone('under-hood')!, renamed)).toHaveLength(1)
  })

  it('leaves a hand-made component out of every zone, because nothing knows where it is', () => {
    for (const zone of listZones()) {
      const matched = componentsInZone(zone, [{ slug: 'homemade', templateKey: null }])
      expect(matched).toHaveLength(0)
    }
  })

  it('returns nothing when the vehicle has no parts in that zone', () => {
    expect(componentsInZone(findZone('fuel-charge')!, components)).toHaveLength(0)
  })
})

describe('zoneForTemplate', () => {
  it('places a part in its zone', () => {
    expect(zoneForTemplate('charge-port')?.key).toBe('fuel-charge')
  })

  it('places nothing for a part with no template', () => {
    expect(zoneForTemplate(null)).toBeNull()
  })

  it('places nothing for a template no zone claims', () => {
    expect(zoneForTemplate('cup-holder')).toBeNull()
  })
})

describe('an owner overriding where a part lives', () => {
  const zone = findZone('under-hood')!

  it('puts a part in a zone its template would not have chosen', () => {
    const parts = [{ slug: 'skid-plate', templateKey: null, zoneKey: 'under-hood' }]
    expect(componentsInZone(zone, parts).map((part) => part.slug)).toEqual(['skid-plate'])
  })

  // Without this a hand-added part belongs to no zone at all, so a badge on the
  // bonnet cannot reach it — the gap that made overrides necessary.
  it('rescues a hand-made component that has no template', () => {
    const parts = [{ slug: 'homemade', templateKey: null, zoneKey: 'underbody' }]
    expect(componentsInZone(findZone('underbody')!, parts)).toHaveLength(1)
  })

  it('moves a part out of the zone its template implies', () => {
    const parts = [{ slug: 'engine-oil', templateKey: 'engine-oil', zoneKey: 'underbody' }]
    expect(componentsInZone(zone, parts)).toHaveLength(0)
    expect(componentsInZone(findZone('underbody')!, parts)).toHaveLength(1)
  })

  it('takes a part out of every zone when told none', () => {
    const parts = [{ slug: 'engine-oil', templateKey: 'engine-oil', zoneKey: 'none' }]
    for (const each of listZones()) {
      expect(componentsInZone(each, parts)).toHaveLength(0)
    }
  })

  it('falls back to the template when no override is set', () => {
    const parts = [{ slug: 'engine-oil', templateKey: 'engine-oil', zoneKey: null }]
    expect(componentsInZone(zone, parts)).toHaveLength(1)
  })

  it('ignores an override naming a zone this build does not define', () => {
    const parts = [{ slug: 'engine-oil', templateKey: 'engine-oil', zoneKey: 'boot-lid' }]
    // Falls back to the template rather than vanishing from the app entirely.
    expect(componentsInZone(zone, parts)).toHaveLength(1)
  })

  it('lists template-placed parts before overridden ones, so the usual order holds', () => {
    const parts = [
      { slug: 'skid-plate', templateKey: null, zoneKey: 'under-hood' },
      { slug: 'coolant', templateKey: 'coolant', zoneKey: null },
      { slug: 'engine-oil', templateKey: 'engine-oil', zoneKey: null },
    ]
    expect(componentsInZone(zone, parts).map((part) => part.slug)).toEqual([
      'engine-oil',
      'coolant',
      'skid-plate',
    ])
  })
})

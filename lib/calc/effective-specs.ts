// Client-side mirror of the effective-spec resolution the database performs.
//
// The database view is the source of truth for what a card renders. This mirror
// exists for the offline path, where a cached payload has to be merged with
// entries that have not yet been delivered — and the two must agree, or a card
// would change under someone's hands the moment their signal returned.

import type { SpecOrigin } from '@/types/servicecard'

export interface FactorySpec {
  specKey: string
  label: string
  value: string
  unit: string | null
}

export interface OverrideSpec {
  specKey: string
  label: string
  newValue: string
  unit: string | null
  supersededValue: string | null
  revisionId: string
  /** Server receipt of the upgrade revision that introduced this override. */
  serverReceivedAt: string | null
}

export interface EffectiveSpec {
  specKey: string
  label: string
  effectiveValue: string
  unit: string | null
  origin: SpecOrigin
  factoryValue: string | null
  overrideRevisionId: string | null
  supersededOverrideCount: number
}

/**
 * Overlays factory specifications with the most recent active override.
 *
 * The result is what a torque wrench gets set to, so the rules are deliberately
 * strict: newest override wins, the factory value is retained for display, and
 * an override introducing a spec the factory never had still surfaces. Mirrors
 * `v_component_effective_specs` (FR-009, FR-010).
 */
export function resolveEffectiveSpecs(
  factory: FactorySpec[],
  overrides: OverrideSpec[],
): EffectiveSpec[] {
  const winners = selectWinningOverrides(overrides)

  const resolved = factory.map((spec) => overlayFactorySpec(spec, winners.get(spec.specKey)))
  const introduced = collectIntroducedSpecs(factory, winners)

  return [...resolved, ...introduced]
}

interface OverrideWinner {
  winner: OverrideSpec
  total: number
}

/** Picks the effective override per spec key, and counts how many it superseded. */
function selectWinningOverrides(overrides: OverrideSpec[]): Map<string, OverrideWinner> {
  const byKey = new Map<string, OverrideSpec[]>()
  for (const override of overrides) {
    const group = byKey.get(override.specKey) ?? []
    group.push(override)
    byKey.set(override.specKey, group)
  }

  const winners = new Map<string, OverrideWinner>()
  for (const [specKey, group] of byKey) {
    const winner = group.reduce((best, candidate) =>
      compareOverrides(candidate, best) > 0 ? candidate : best,
    )
    winners.set(specKey, { winner, total: group.length })
  }

  return winners
}

/** Returns a factory spec, or the override that has taken it over. */
function overlayFactorySpec(spec: FactorySpec, match: OverrideWinner | undefined): EffectiveSpec {
  if (!match) {
    return {
      specKey: spec.specKey,
      label: spec.label,
      effectiveValue: spec.value,
      unit: spec.unit,
      origin: 'factory',
      factoryValue: spec.value,
      overrideRevisionId: null,
      supersededOverrideCount: 0,
    }
  }

  return {
    specKey: spec.specKey,
    label: match.winner.label,
    effectiveValue: match.winner.newValue,
    unit: match.winner.unit ?? spec.unit,
    origin: 'override',
    factoryValue: spec.value,
    overrideRevisionId: match.winner.revisionId,
    supersededOverrideCount: match.total - 1,
  }
}

/**
 * Specs an upgrade introduced that the factory never had.
 *
 * An aftermarket part can carry a figure the OEM equivalent had no counterpart
 * for, and it still has to reach the HUD.
 */
function collectIntroducedSpecs(
  factory: FactorySpec[],
  winners: Map<string, OverrideWinner>,
): EffectiveSpec[] {
  const introduced: EffectiveSpec[] = []

  for (const [specKey, match] of winners) {
    if (factory.some((spec) => spec.specKey === specKey)) continue
    introduced.push({
      specKey,
      label: match.winner.label,
      effectiveValue: match.winner.newValue,
      unit: match.winner.unit,
      origin: 'override',
      factoryValue: null,
      overrideRevisionId: match.winner.revisionId,
      supersededOverrideCount: match.total - 1,
    })
  }

  return introduced
}

function compareOverrides(left: OverrideSpec, right: OverrideSpec): number {
  if (left.serverReceivedAt === null && right.serverReceivedAt !== null) return 1
  if (left.serverReceivedAt !== null && right.serverReceivedAt === null) return -1

  if (left.serverReceivedAt !== null && right.serverReceivedAt !== null) {
    const comparison = left.serverReceivedAt.localeCompare(right.serverReceivedAt)
    if (comparison !== 0) return comparison
  }

  return left.revisionId.localeCompare(right.revisionId)
}

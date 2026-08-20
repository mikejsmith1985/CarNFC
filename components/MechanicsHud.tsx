// The mechanics HUD: tools, torque, fluid, capacity, and part numbers, with aftermarket overrides flagged as non-factory.
import { Wrench, AlertTriangle } from 'lucide-react'
import type { ComponentSpec, SpecKind } from '@/types/servicecard'

interface MechanicsHudProps {
  specs: ComponentSpec[]
}

/** Order the panel reads in: what you need in hand, then what you pour, then what you order. */
const KIND_ORDER: SpecKind[] = ['tool', 'torque', 'fluid', 'capacity', 'part_number', 'interval']

/**
 * Renders the effective specification set for a component.
 *
 * "Effective" is the operative word: where an aftermarket upgrade has superseded
 * a factory figure, the override is what is shown, because the factory manual
 * has stopped applying to this vehicle. The factory value stays visible
 * underneath so nobody is left guessing what changed (FR-009, FR-010).
 */
export function MechanicsHud({ specs }: MechanicsHudProps) {
  if (specs.length === 0) {
    return (
      <section className="px-4 py-5" aria-labelledby="hud-heading">
        <HudHeading />
        <p className="mt-3 text-sm text-text-muted">
          No specifications recorded for this component yet.
        </p>
      </section>
    )
  }

  const sortedSpecs = [...specs].sort(
    (left, right) => KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind),
  )

  return (
    <section className="px-4 py-5" aria-labelledby="hud-heading">
      <HudHeading />
      <dl className="mt-3 space-y-2">
        {sortedSpecs.map((spec) => (
          <SpecRow key={spec.specKey} spec={spec} />
        ))}
      </dl>
    </section>
  )
}

function HudHeading() {
  return (
    <h2
      id="hud-heading"
      className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-secondary"
    >
      <Wrench size={16} aria-hidden />
      Tools &amp; Specifications
    </h2>
  )
}

function SpecRow({ spec }: { spec: ComponentSpec }) {
  const isOverridden = spec.origin === 'override'

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-card border px-3 py-2.5 ${
        isOverridden ? 'border-upgrade/50 bg-upgrade/10' : 'border-border bg-surface-raised'
      }`}
    >
      <dt className="min-w-0 flex-1 text-sm text-text-secondary">
        {spec.label}
        {isOverridden ? (
          <>
            {/* Icon plus wording, not colour alone — this is the one thing on the
                card that can get someone's torque wrench set incorrectly. */}
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-upgrade/20 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-upgrade">
              <AlertTriangle size={11} aria-hidden />
              Modified
            </span>
            {spec.factoryValue ? (
              <span className="mt-1 block text-xs text-text-muted">
                Factory was{' '}
                <s className="tabular">
                  {spec.factoryValue}
                  {spec.unit ? ` ${spec.unit}` : ''}
                </s>
                {spec.supersededOverrideCount > 0
                  ? ` · ${spec.supersededOverrideCount} earlier override superseded`
                  : ''}
              </span>
            ) : (
              <span className="mt-1 block text-xs text-text-muted">No factory equivalent</span>
            )}
          </>
        ) : null}
      </dt>

      <dd
        className={`shrink-0 text-right text-base font-bold tabular ${
          isOverridden ? 'text-upgrade' : 'text-text-primary'
        }`}
      >
        {spec.effectiveValue}
        {spec.unit ? <span className="ml-1 text-xs font-normal">{spec.unit}</span> : null}
      </dd>
    </div>
  )
}

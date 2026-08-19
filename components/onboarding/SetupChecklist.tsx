// The guided setup a new owner works through, with the next step opened for them.
'use client'

import Link from 'next/link'
import { Check, Circle, ChevronRight } from 'lucide-react'
import { AddVehicleSheet } from '@/components/garage/AddVehicleSheet'
import { TagMinter } from '@/components/garage/TagMinter'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import {
  buildOnboardingSteps,
  currentOnboardingStep,
  type OnboardingProgress,
  type OnboardingStepKey,
} from '@/lib/onboarding/steps'

interface SetupChecklistProps {
  progress: OnboardingProgress
  appUrl: string
  /** Where to send someone whose next move is on a vehicle they already have. */
  firstVehicleSlug: string | null
}

/**
 * Shows what is done, what is next, and does the next thing where it can.
 *
 * The previous attempt was a list of instructions and a button, which explained
 * the product without moving anyone through it. This tracks real state — a
 * vehicle exists, a tag is claimed, something has been logged — so it cannot
 * congratulate someone for work they have not done, and it disappears on its
 * own once there is nothing left to say.
 */
export function SetupChecklist({ progress, appUrl, firstVehicleSlug }: SetupChecklistProps) {
  const isReady = useIsHydrated()
  const steps = buildOnboardingSteps(progress)
  const current = currentOnboardingStep(progress)

  if (!current) return null

  const doneCount = steps.filter((step) => step.isDone).length

  return (
    <section
      className="rounded-card border border-accent/40 bg-accent/5 p-4"
      aria-label="Getting set up"
      {...hydrationMarker(isReady)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-accent">Getting set up</h2>
        <span className="tabular text-xs text-text-muted">
          {doneCount} of {steps.length}
        </span>
      </div>

      <ol className="mt-4 space-y-3">
        {steps.map((step) => {
          const isCurrent = step.key === current.key

          return (
            <li key={step.key}>
              <div className="flex gap-3">
                <span className="mt-0.5 shrink-0">
                  {step.isDone ? (
                    <Check size={18} className="text-success" aria-label="Done" />
                  ) : (
                    <Circle
                      size={18}
                      className={isCurrent ? 'text-accent' : 'text-text-muted'}
                      aria-hidden
                    />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      step.isDone ? 'text-text-muted line-through' : 'text-text-primary'
                    }`}
                  >
                    {step.title}
                  </p>

                  {/* Only the step being worked on explains itself. The rest are
                      titles, so the list reads as a list rather than a wall. */}
                  {isCurrent ? (
                    <>
                      <p className="mt-1 text-sm text-text-secondary">{step.detail}</p>
                      <div className="mt-3">
                        <StepAction
                          stepKey={step.key}
                          appUrl={appUrl}
                          firstVehicleSlug={firstVehicleSlug}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** The thing to press for whichever step is outstanding. */
function StepAction({
  stepKey,
  appUrl,
  firstVehicleSlug,
}: {
  stepKey: OnboardingStepKey
  appUrl: string
  firstVehicleSlug: string | null
}) {
  if (stepKey === 'vehicle') return <AddVehicleSheet />

  if (stepKey === 'tag') {
    return (
      <div className="space-y-3">
        <TagMinter appUrl={appUrl} />
        <p className="text-xs text-text-muted">
          Bought a tag ready-made? Skip this — stick it on and tap it.
        </p>
      </div>
    )
  }

  if (stepKey === 'claim') {
    return (
      <p className="text-sm text-text-muted">
        Hold your phone to the tag. It opens here and asks what the tag is on.
      </p>
    )
  }

  // Logging happens on a part, which is a place rather than a button.
  return firstVehicleSlug ? (
    <Link
      href={`/v/${firstVehicleSlug}`}
      className="inline-flex min-h-touch items-center gap-1 rounded-card border border-border-strong px-4 text-sm font-semibold text-text-primary"
    >
      Open your vehicle
      <ChevronRight size={16} aria-hidden />
    </Link>
  ) : null
}

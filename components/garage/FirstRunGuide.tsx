// What a first-time owner sees instead of an empty garage that explains nothing.
'use client'

import { useState } from 'react'
import { Nfc, Car, MapPin, Wrench, ChevronDown } from 'lucide-react'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import { TagMinter } from '@/components/garage/TagMinter'

interface FirstRunGuideProps {
  /** Where a tag points, so the instructions can show a real address. */
  appUrl: string
}

/**
 * Explains where tags come from, which nothing else in the product does.
 *
 * Every other screen assumes the owner arrived by tapping a tag that already
 * exists. Someone who buys a badge and opens the site cold has no path at all:
 * the garage offers to add a vehicle and never mentions the thing they are
 * holding. This is the only screen that can close that gap, because an empty
 * garage is exactly where they land.
 */
export function FirstRunGuide({ appUrl }: FirstRunGuideProps) {
  const isReady = useIsHydrated()
  const [isWritingOpen, setIsWritingOpen] = useState(false)

  return (
    <section
      className="rounded-card border border-border bg-surface-raised p-4 text-left"
      aria-label="Getting started"
      {...hydrationMarker(isReady)}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-accent">
        <Nfc size={16} aria-hidden />
        How this works
      </h2>

      <ol className="mt-4 space-y-4">
        <Step
          icon={<Car size={18} aria-hidden />}
          title="Add your vehicle"
          detail="Or let the tag do it — claiming your first tag creates the vehicle as part of the flow."
        />
        <Step
          icon={<MapPin size={18} aria-hidden />}
          title="Stick a tag where you work"
          detail="On the part itself for a card that opens straight to it, or somewhere you reach several parts from — under the bonnet, at the filler, on a frame rail."
        />
        <Step
          icon={<Wrench size={18} aria-hidden />}
          title="Tap it and claim it"
          detail="The first tap asks what the tag is on. Every tap after that opens the part with its torque figures, fluids and history."
        />
      </ol>

      <div className="mt-5 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setIsWritingOpen((previous) => !previous)}
          aria-expanded={isWritingOpen}
          className="flex min-h-touch w-full items-center justify-between text-left text-sm font-semibold text-text-primary"
        >
          I have blank tags — how do I write one?
          <ChevronDown
            size={18}
            aria-hidden
            className={`shrink-0 transition-transform ${isWritingOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isWritingOpen ? (
          <div className="mt-3 space-y-3 text-sm text-text-secondary">
            <p>
              A tag holds one web address and nothing else. Write it with any NFC writing app — NFC
              Tools on either phone works.
            </p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Choose Write, then add a URL record.</li>
              <li>
                Enter your tag&apos;s address — it looks like{' '}
                <span className="tabular break-all text-text-primary">{appUrl}/t/…</span>
              </li>
              <li>Hold the tag to the top of your phone until it confirms.</li>
            </ol>
            <p className="text-text-muted">
              Tags bought ready-made are already written. Lock a tag after writing if you want it to
              stay that way — an unlocked tag can be overwritten by anyone who can touch it.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function Step({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-text-secondary">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text-primary">{title}</span>
        <span className="block text-sm text-text-muted">{detail}</span>
      </span>
    </li>
  )
}

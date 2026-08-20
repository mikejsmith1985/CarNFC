// The three quick log actions on the card, and the modal they open.
'use client'

import { useState } from 'react'
import { Droplet, Wrench, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LogModal } from '@/components/LogModal'
import { SpecEditor, SpecEditorTrigger } from '@/components/SpecEditor'
import type { ComponentCard, LogCategory } from '@/types/servicecard'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'

interface QuickActionsProps {
  componentId: string
  componentName: string
  vehicleSlug: string
  currentOdometer: number
  specs: ComponentCard['specs']
}

/**
 * Renders Log Service, Log Repair, and Log Upgrade (FR-011).
 *
 * Three buttons rather than four: Replace is reachable from inside the modal.
 * The card is operated one-handed, and a fourth target on this row would push
 * every button below a comfortable width on a 320px screen.
 */
export function QuickActions({
  componentId,
  componentName,
  vehicleSlug,
  currentOdometer,
  specs,
}: QuickActionsProps) {
  const isReady = useIsHydrated()
  const [openCategory, setOpenCategory] = useState<LogCategory | null>(null)
  const [isEditingSpecs, setIsEditingSpecs] = useState(false)

  return (
    <>
      <section className="px-4 py-2" aria-label="Quick log actions" {...hydrationMarker(isReady)}>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="primary"
            icon={<Droplet size={18} aria-hidden />}
            onClick={() => setOpenCategory('maintenance')}
            className="flex-col !gap-1 !px-2 text-xs"
          >
            Service
          </Button>
          <Button
            variant="secondary"
            icon={<Wrench size={18} aria-hidden />}
            onClick={() => setOpenCategory('repair')}
            className="flex-col !gap-1 !px-2 text-xs"
          >
            Repair
          </Button>
          <Button
            variant="secondary"
            icon={<Zap size={18} aria-hidden />}
            onClick={() => setOpenCategory('upgrade')}
            className="flex-col !gap-1 !px-2 text-xs"
          >
            Upgrade
          </Button>
        </div>

        <div className="mt-1 flex justify-end">
          <SpecEditorTrigger onOpen={() => setIsEditingSpecs(true)} />
        </div>
      </section>

      <SpecEditor
        isOpen={isEditingSpecs}
        onClose={() => setIsEditingSpecs(false)}
        componentId={componentId}
        vehicleSlug={vehicleSlug}
        specs={specs}
      />

      <LogModal
        isOpen={openCategory !== null}
        initialCategory={openCategory ?? 'maintenance'}
        onClose={() => setOpenCategory(null)}
        componentId={componentId}
        componentName={componentName}
        vehicleSlug={vehicleSlug}
        currentOdometer={currentOdometer}
        specs={specs}
      />
    </>
  )
}

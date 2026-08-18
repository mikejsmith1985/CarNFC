// Moves a tag that has been peeled off one part and stuck on another.
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Tag as TagIcon, MoveRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SelectField } from '@/components/ui/Field'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import { rebindTag } from '@/app/actions/claim'

export interface BoundTag {
  tagId: string
  componentId: string
  componentName: string
}

interface TagRebinderProps {
  vehicleId: string
  tags: BoundTag[]
  components: Array<{ id: string; displayName: string }>
}

/** How much of a tag id to show — enough to tell two apart, not a wall of characters. */
const TAG_ID_PREVIEW_LENGTH = 8

/**
 * Re-points a tag at a different component on the same vehicle (FR-046).
 *
 * A tag stuck to a frame rail cannot be reprogrammed, and peeling one off a
 * differential to put it on a transfer case is an ordinary afternoon. Only the
 * binding moves; the identifier printed on the hardware stays exactly as it is,
 * so nothing has to be re-tagged or thrown away.
 */
export function TagRebinder({ vehicleId, tags, components }: TagRebinderProps) {
  const router = useRouter()
  const isReady = useIsHydrated()

  const [selection, setSelection] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [movedTagId, setMovedTagId] = useState<string | null>(null)
  const [isWorking, startWorking] = useTransition()

  // Counted, not flagged, so consecutive moves each refresh. A refresh called
  // from inside the transition that did the moving is swallowed: the tag moves
  // in the database and the list keeps showing where it used to be.
  const [moveCount, setMoveCount] = useState(0)

  useEffect(() => {
    if (moveCount === 0) return
    router.refresh()
  }, [moveCount, router])

  if (tags.length === 0) return null

  const handleMove = (tag: BoundTag) => {
    const targetComponentId = selection[tag.tagId] ?? tag.componentId
    if (targetComponentId === tag.componentId) return

    setFormError(null)
    setMovedTagId(null)
    startWorking(async () => {
      const result = await rebindTag(tag.tagId, vehicleId, targetComponentId)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setMovedTagId(tag.tagId)
      setMoveCount((previous) => previous + 1)
    })
  }

  return (
    <section
      className="rounded-card border border-border bg-surface-raised p-4"
      aria-label="Tags on this vehicle"
      {...hydrationMarker(isReady)}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-secondary">
        <TagIcon size={16} aria-hidden />
        Tags on this vehicle
      </h2>

      <p className="mt-2 text-sm text-text-muted">
        Moved a tag to a different part? Point it at the new one — the sticker keeps its identity.
      </p>

      <ul className="mt-4 space-y-4">
        {tags.map((tag) => {
          const targetComponentId = selection[tag.tagId] ?? tag.componentId
          const hasMoved = targetComponentId !== tag.componentId

          return (
            <li key={tag.tagId} className="rounded-card border border-border bg-surface-sunken p-3">
              <p className="tabular text-xs text-text-muted">
                {tag.tagId.slice(0, TAG_ID_PREVIEW_LENGTH)}… · currently{' '}
                <span className="font-semibold text-text-secondary">{tag.componentName}</span>
              </p>

              <div className="mt-2">
                <SelectField
                  label="Now on"
                  value={targetComponentId}
                  onChange={(event) =>
                    setSelection((previous) => ({ ...previous, [tag.tagId]: event.target.value }))
                  }
                  options={components.map((component) => ({
                    value: component.id,
                    label: component.displayName,
                  }))}
                />
              </div>

              <Button
                variant="secondary"
                fullWidth
                icon={<MoveRight size={16} aria-hidden />}
                onClick={() => handleMove(tag)}
                disabled={isWorking || !hasMoved}
                className="mt-2"
              >
                {isWorking ? 'Moving…' : 'Move this tag'}
              </Button>

              {movedTagId === tag.tagId ? (
                <p role="status" className="mt-2 text-sm text-success">
                  Moved. Tapping it now opens {tag.componentName}.
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>

      {formError ? (
        <p
          role="alert"
          className="mt-3 rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}
    </section>
  )
}

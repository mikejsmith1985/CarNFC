// The component history timeline: every recorded event against this part, newest first.
import { FileText, Pencil, Paperclip } from 'lucide-react'
import { CategoryBadge, CATEGORY_PRESENTATION } from '@/components/ui/CategoryBadge'
import type { TimelineEntry } from '@/types/servicecard'
import { UNIT_DISTANCE } from '@/lib/constants'

interface ComponentTimelineProps {
  entries: TimelineEntry[]
  hasMore: boolean
  componentName: string
}

/** Renders the component's history, or an empty state inviting the first log (FR-012). */
export function ComponentTimeline({ entries, hasMore, componentName }: ComponentTimelineProps) {
  return (
    <section className="px-4 py-5" aria-labelledby="timeline-heading">
      <h2
        id="timeline-heading"
        className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-secondary"
      >
        <FileText size={16} aria-hidden />
        History
      </h2>

      {entries.length === 0 ? (
        <EmptyTimeline componentName={componentName} />
      ) : (
        <ol className="mt-3 space-y-3">
          {entries.map((entry) => (
            <TimelineRow key={entry.revisionId} entry={entry} />
          ))}
        </ol>
      )}

      {hasMore ? (
        <p className="mt-4 text-center text-sm text-text-muted">
          Older entries continue below the first {entries.length}.
        </p>
      ) : null}
    </section>
  )
}

function EmptyTimeline({ componentName }: { componentName: string }) {
  return (
    <div className="mt-3 rounded-card border border-dashed border-border-strong px-4 py-8 text-center">
      <p className="text-sm font-semibold text-text-secondary">
        Nothing logged for {componentName} yet.
      </p>
      <p className="mt-1 text-sm text-text-muted">
        The specs above are ready. Log the first service when you do the work.
      </p>
    </div>
  )
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const { dotClass } = CATEGORY_PRESENTATION[entry.category]
  const summary = summarizeEntry(entry)

  return (
    <li className="relative rounded-card border border-border bg-surface-raised p-3 pl-5">
      <span aria-hidden className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${dotClass}`} />

      <div className="flex flex-wrap items-center gap-2">
        <CategoryBadge category={entry.category} />
        {entry.isEdited ? (
          // A buyer reading a shared passport should be able to see that a
          // record was revised, even though the earlier version is not shown.
          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
            <Pencil size={11} aria-hidden />
            Edited
          </span>
        ) : null}
        {entry.attachments.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-text-muted">
            <Paperclip size={11} aria-hidden />
            {entry.attachments.length}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm font-semibold tabular text-text-primary">
        {formatDate(entry.performedOn)} · {entry.odometer.toLocaleString()} {UNIT_DISTANCE}
      </p>

      {summary ? <p className="mt-1 text-sm text-text-secondary">{summary}</p> : null}
      {entry.notes ? <p className="mt-1 text-sm text-text-muted">{entry.notes}</p> : null}
    </li>
  )
}

/**
 * One line describing what was actually done, drawn from whichever
 * category-specific fields the entry carries.
 */
function summarizeEntry(entry: TimelineEntry): string | null {
  const fields = entry.categoryFields
  const parts: string[] = []

  const push = (value: unknown, prefix = '') => {
    if (value !== null && value !== undefined && value !== '') parts.push(`${prefix}${value}`)
  }

  switch (entry.category) {
    case 'maintenance':
      push(fields.fluid_type)
      if (fields.quantity) push(`${fields.quantity} ${fields.quantity_unit ?? ''}`.trim())
      push(fields.filter_part_number, 'Filter ')
      break
    case 'repair':
      push(fields.symptom)
      push(fields.action_taken)
      break
    case 'replace':
      if (fields.new_part_number) push(`New part ${fields.new_part_number}`)
      push(fields.brand)
      if (fields.warranty_expires_on) push(`Warranty to ${fields.warranty_expires_on}`)
      break
    case 'upgrade':
      push(fields.upgrade_brand)
      push(fields.product_name)
      break
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

/** Formats an ISO date for a phone screen held at arm's length under a vehicle. */
function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

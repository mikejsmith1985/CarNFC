// Category badge for the four log types. Pairs colour with an icon and a text label, because colour alone is not a signal (FR-012).
import { Droplet, Wrench, RefreshCw, Zap } from 'lucide-react'
import type { LogCategory } from '@/types/servicecard'

interface CategoryPresentation {
  label: string
  Icon: typeof Droplet
  /** Utility classes rather than a raw token, so Tailwind keeps them in the build. */
  colorClass: string
  dotClass: string
}

/**
 * How each category is presented.
 *
 * Every entry carries an icon and a word as well as a colour, so the timeline
 * stays readable to someone with colour-vision deficiency and in the washed-out
 * contrast of direct sunlight at a gas pump.
 */
export const CATEGORY_PRESENTATION: Record<LogCategory, CategoryPresentation> = {
  maintenance: {
    label: 'Maintenance',
    Icon: Droplet,
    colorClass: 'text-maintenance border-maintenance/40 bg-maintenance/10',
    dotClass: 'bg-maintenance',
  },
  repair: {
    label: 'Repair',
    Icon: Wrench,
    colorClass: 'text-repair border-repair/40 bg-repair/10',
    dotClass: 'bg-repair',
  },
  replace: {
    label: 'Replace',
    Icon: RefreshCw,
    colorClass: 'text-replace border-replace/40 bg-replace/10',
    dotClass: 'bg-replace',
  },
  upgrade: {
    label: 'Upgrade',
    Icon: Zap,
    colorClass: 'text-upgrade border-upgrade/40 bg-upgrade/10',
    dotClass: 'bg-upgrade',
  },
}

/** Renders the icon-plus-label badge for a log category. */
export function CategoryBadge({ category }: { category: LogCategory }) {
  const { label, Icon, colorClass } = CATEGORY_PRESENTATION[category]

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${colorClass}`}
    >
      <Icon size={14} aria-hidden />
      {label}
    </span>
  )
}

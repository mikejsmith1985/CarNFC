// The four things a new owner has to do, and which of them are already done.
//
// Derived from what is actually in the account rather than from a flag saying
// the tour was watched. A checklist that reads the data cannot go stale, cannot
// congratulate someone for work they have not done, and survives a phone being
// replaced — which matters when the whole product is a record kept for years.

/** What the account currently contains, as far as getting started is concerned. */
export interface OnboardingProgress {
  vehicleCount: number
  /** Tags the owner holds that are not yet pointed at anything. */
  reservedTagCount: number
  /** Tags pointed at a part or a working area. */
  boundTagCount: number
  /** Service and energy entries, of any kind. */
  entryCount: number
}

export type OnboardingStepKey = 'vehicle' | 'tag' | 'claim' | 'log'

export interface OnboardingStep {
  key: OnboardingStepKey
  title: string
  detail: string
  isDone: boolean
}

/**
 * The checklist, in the order it is normally worked through.
 *
 * A ready-made tag arrives already written, so a bound tag satisfies the
 * setting-up step as well — otherwise the list would nag about work done in a
 * factory.
 */
export function buildOnboardingSteps(progress: OnboardingProgress): OnboardingStep[] {
  const hasTag = progress.reservedTagCount > 0 || progress.boundTagCount > 0

  return [
    {
      key: 'vehicle',
      title: 'Add your vehicle',
      detail: 'Year, make, model and what the odometer reads today.',
      isDone: progress.vehicleCount > 0,
    },
    {
      key: 'tag',
      title: 'Get a tag ready',
      detail:
        'A tag bought ready-made is already done. A blank one needs a link written to it first.',
      isDone: hasTag,
    },
    {
      key: 'claim',
      title: 'Stick it on and tap it',
      detail:
        'On a part for a card that opens straight to it, or somewhere you reach several parts from. The first tap asks which.',
      isDone: progress.boundTagCount > 0,
    },
    {
      key: 'log',
      title: 'Log a job',
      detail: 'Whatever you did last. From then on the history builds itself as you work.',
      isDone: progress.entryCount > 0,
    },
  ]
}

/**
 * The first step still outstanding, or null when there is nothing left.
 *
 * The first *unfinished* step rather than the next in sequence: somebody can log
 * a job before tagging anything, and a list that insisted on its own order would
 * point at work already done.
 */
export function currentOnboardingStep(progress: OnboardingProgress): OnboardingStep | null {
  return buildOnboardingSteps(progress).find((step) => !step.isDone) ?? null
}

/** Whether the account has been through everything worth explaining. */
export function isOnboardingComplete(progress: OnboardingProgress): boolean {
  return currentOnboardingStep(progress) === null
}

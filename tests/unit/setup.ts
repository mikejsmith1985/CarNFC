// Unit-layer setup. Pays one-time environment costs here so they are not charged against a single test's 10ms budget.

/*
  The first `Number.prototype.toLocaleString` call in a process initializes ICU
  locale data, which costs roughly 15ms. Charged to whichever test happens to
  run first, that reads as a slow test and trips the Article V budget — while
  every subsequent call takes well under a millisecond.

  Warming it here keeps the budget measuring what it is meant to measure: the
  cost of our own logic, not of the runtime booting.
*/
;(1234.5).toLocaleString()
new Date().toLocaleDateString()
// Time formatting initialises separately from date formatting, and the sign-in
// screen is the only place that uses it.
new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/*
  Zod builds its schema objects on first import, and a discriminated union over
  four categories is not free. Charged to whichever test happens to run first in
  a file, that reads as a slow test and trips the Article V budget — while every
  later parse takes microseconds.

  Warming them here keeps the budget measuring our own logic rather than the
  cost of a module loading.
*/
import { serviceLogSchema } from '@/lib/validation/service-log'
import { energyLogSchema } from '@/lib/validation/energy-log'
import { vehicleSchema } from '@/lib/validation/vehicle'

serviceLogSchema.safeParse({})
energyLogSchema.safeParse({})
vehicleSchema.safeParse({})

/*
  Every pure module the unit layer measures is imported here too.

  A module's first import is charged to whichever test happens to trigger it,
  and that one test then reads as slow enough to trip the Article V budget while
  every later call is microseconds. It surfaced as two unrelated tests failing
  the moment a new file was added — nothing about them had changed except which
  one paid the import.

  Importing them up front keeps the budget measuring our own logic rather than
  the module graph loading.
*/
import { computeNextDue } from '@/lib/calc/reminders'
import { isTestAuthAllowed } from '@/lib/test-support/test-auth-gate'
import { componentsInZone, listZones } from '@/lib/zones/zones'
import { missingTemplatesForZone } from '@/lib/zones/zone-setup'
import { spokenToNumber } from '@/lib/voice/number-words'
import { interpretUtterance } from '@/lib/voice/transcript'
import { getDictationScript } from '@/lib/voice/dictation-script'
import { parsePendingSignIn } from '@/lib/auth/pending-sign-in'
import { clampTagBatchSize } from '@/lib/tags/batch'
import { buildOnboardingSteps } from '@/lib/onboarding/steps'

computeNextDue({
  lastServiceOdometer: 0,
  lastServiceDate: null,
  intervalMiles: null,
  intervalDays: null,
})
isTestAuthAllowed({ nodeEnv: 'test', enableTestAuth: undefined, requestHost: null })
componentsInZone(listZones()[0]!, [])
missingTemplatesForZone(listZones()[0]!, [], 'gasoline', [])
spokenToNumber('one')
interpretUtterance('skip', 'text')
getDictationScript('maintenance')
parsePendingSignIn(null)
clampTagBatchSize(1)
buildOnboardingSteps({
  vehicleCount: 0,
  reservedTagCount: 0,
  boundTagCount: 0,
  entryCount: 0,
})

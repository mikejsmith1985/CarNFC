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

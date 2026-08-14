// Cypress support file registering cypress-real-events, which Article V requires instead of synthetic events.
//
// The rule is enforced statically, by tests/unit/ux-real-events.test.ts scanning
// the spec sources. An earlier version overrode `cy.click` to throw at runtime,
// which also broke Cypress's own internal use of click inside `.type()` and
// `.select()` — it failed legitimate specs while proving nothing a source scan
// cannot prove more cheaply.

import 'cypress-real-events'
import './commands'

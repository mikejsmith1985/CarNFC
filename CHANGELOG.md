# Changelog — CarNFC

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Forge Workflow initialized with Forge Terminal Workflow Architect
- Next.js 16 toolchain: TypeScript, Tailwind CSS 4 (CSS-first), ESLint enforcing the
  Article IV naming and complexity rules, Prettier, and a Vitest configuration split into
  two projects so Article V's layers stay separated — unit tests carry a 10ms per-test
  budget, integration tests get real containers.
- `scripts/run-dev-clean.ps1`, the mandated UX-test launcher. Terminates the port owner by
  PID only, never a wildcard process match (Article II).
- `scripts/check-secret-boundaries.ts`, which fails the build if the service-role key could
  reach a browser bundle (Article IX).
- `scripts/local-release.ps1`, verifying and publishing entirely on the local machine —
  never a GitHub Actions runner (Article VIII).
- **ServiceCard database schema** in `lib/supabase/schema.sql`: 14 tables, 3 views, 5 RPCs,
  Row Level Security forced on every table, and a private attachments bucket.
  - Service and energy history is append-only. An edit writes a superseding revision and a
    delete writes a tombstone, so two devices that both acted offline converge without
    either one's work disappearing — and a shared record cannot be quietly rewritten.
  - Ordering reads `server_received_at` only. The specification assumes a phone's clock may
    be wrong, so a device clock never decides whose edit survives.
  - Revision ids are client-generated UUIDv7, which turns exactly-once delivery into a
    database constraint (`ON CONFLICT DO NOTHING`) rather than queue bookkeeping.
  - Two `SECURITY DEFINER` guest paths, `resolve_tag` and `get_public_passport`, are the
    only routes to vehicle data without a session. Cost and owner-identity redaction happen
    in SQL, so a client bug cannot leak them. Their security review is recorded as a comment
    on each function.
  - A seeded component-template library so a freshly claimed tag has a useful mechanics HUD
    before any manual data entry.
- **Type surface and domain logic.** `types/servicecard.ts` models the four log categories
  as a discriminated union over `category`, and fuel versus charging as one over `mode`.
  Zod schemas in `lib/validation/` are the single definition, shared by the client form and
  the server action — a device offline for days cannot be trusted to have validated
  correctly, so the server re-checks with the same schema.
- **Offline write queue** (`lib/offline/`) — the one custom component in the feature, built
  against a documented framework gap. Entries are accepted with no connectivity, delivered
  exactly once, retried with capped exponential backoff, and never discarded: a record
  leaves the queue only on a confirmed acknowledgement, and one that stops being retryable
  is surfaced as stuck rather than dropped.
- Pure calculation modules for fuel economy, EV efficiency, odometer plausibility, service
  reminders and effective-spec resolution, kept free of I/O so they stay inside the unit
  layer's 10ms budget.
- **Component Service Card** at `/v/[vehicle_id]/c/[component_id]`: mechanics HUD with
  aftermarket overrides flagged against the factory value, history timeline, reminders and
  quick log actions. Header and HUD render outside Suspense so the torque figure paints
  before the 2019 history.
- **Tag resolver** at `/t/[tag_id]`, redirecting to the card, the claim flow, or an
  information-free error state — `forbidden` and `unknown` are indistinguishable, so the
  tag space cannot be used to enumerate claimed tags.
- `LogModal` covering all four categories with the field set swapping per category, and
  `EnergyLogger` computing MPG, mi/kWh, Wh/mi and cost per mile live.
- **Email one-time-code sign-in**, no password path anywhere. The scanned address survives
  the round trip via a `next` parameter, sanitized against open redirects.
- **Two-step claim wizard** — a vehicle can be created inside the flow so a first-ever
  claim never loses the pending tag id, and an energy-port template is refused when the
  powertrain cannot use it.
- **Shareable vehicle passport** at `/p/[share_token]`: read-only, no account needed, off
  by default. Only the token's SHA-256 hash is stored, revoked rows are retained forever so
  a re-minted link cannot revive an old token, and the page carries `noindex` with no
  OpenGraph metadata so a pasted link cannot expand into a preview of the history.
- `SyncIndicator`, `StalenessBanner` and a sign-out guarded against discarding entries that
  have not reached the server.
- On-device photo compression using native browser APIs — `createImageBitmap` with
  `imageOrientation: 'from-image'` and `OffscreenCanvas` in a worker. The framework-first
  gate passed, so no third-party library was added.

- **Hands-free logging.** A log can now be filled in by talking to it: the app reads each
  question out loud and writes down the answer, so a job can be recorded without picking the
  phone up. The questions are the ones worth asking aloud — what fluid went in, how much,
  what torque, what part number came off — and anything needing a screen to answer sensibly,
  like a spec override or a photo, is left to the form.
  - **No AI, no network, no cost.** The browser's own Web Speech API turns speech into words;
    a lookup table and an accumulator turn those words into a field value. It behaves the
    same way every time and there is nothing to bill or to rate-limit.
  - Oil grades survive however they are said. Dictation splits them every way imaginable —
    "75 W 90", "seventy five W ninety", "10w40", "5 weight 30" — and all of them are written
    as `75W-90`. Something that is not a grade at all, like "synthetic gear oil", is left
    exactly as spoken rather than forced into one.
  - Numbers are read the way people say them, so "one hundred twenty three thousand four
    hundred" reaches an odometer field as `123400`, and a unit said aloud out of habit —
    "five quarts" — does not end up inside the number.
  - "Skip", "repeat", "back" and "done" steer the run, but only as a whole utterance:
    "replace it at the next service" is an answer, not a command to skip.
  - Every question can equally be answered by pressing a button or typing, always visible
    rather than a fallback to be discovered. Dictation fails for ordinary reasons — a loud
    workshop, a refused permission, or a browser that sends audio to a server and has no
    signal to do it with — and each of those says so plainly.
  - Started by a press, never on its own: iOS will not speak or open a microphone unless a
    person asked for it in that moment, so a panel that began talking by itself would be
    silent on exactly the phone most likely to be propped on a wing.
- A card opened with no signal and no saved copy redirects to the offline page rather than
  falling through to the not-found page. Telling someone standing at their own vehicle that the
  part does not exist is worse than saying the phone cannot reach it. The redirect does not yet
  win over the precached not-found page in every case, which is the one offline spec still
  failing.
- The unit layer's 10ms budget was being charged for module loading. A module's first import
  fell on whichever test happened to trigger it, so adding an unrelated file made two
  long-standing tests fail without either of them changing. Every measured module is now
  imported up front, alongside the ICU and schema warm-ups already there.
- **A deploy was invisible to anyone already carrying the old app.** A service worker keeps
  serving what it has until something replaces it, so seeing a fix meant clearing website data by
  hand — which nobody will do and no customer could be asked to. The app now notices when a new
  version takes over and reloads itself, checks for one when a backgrounded tab is opened again,
  and skips the reload on a first visit where nothing is stale.
- **Blank tags had nowhere to get an address from.** The instructions for writing one ended at
  "it looks like this", because the only source of a tag address was a script run by hand. An
  owner can now ask the app for as many as they need, up to a pack, and copy them out to write.
- **A vehicle had no way to say what its odometer reads.** The figure is derived from the
  highest logged entry, which is right for corrections and useless for a vehicle that has no
  entries yet: a truck bought at 112,450 miles insisted it had never been driven until something
  was logged against it. Adding or editing a vehicle now asks for the current reading, in the
  garage and in the claim flow where most vehicles are actually born. Entries still only ever
  raise it, so a logged reading always wins over a typed one (FR-025).
- **Nothing explained where tags come from.** Every screen assumed the owner had arrived by
  tapping a tag that already existed, so somebody who bought a badge and opened the site cold had
  no path at all — the garage offered to add a vehicle and never mentioned the thing in their
  hand. An empty garage now explains the three steps, and offers instructions for writing a blank
  tag, including the advice to lock it afterwards.
- **Nothing said that asking for a new sign-in code kills the old one.** Three emails arrive
  looking identical, only the newest works, and the natural response to a rejected code is to
  request another — which destroys the one that would have worked. The code step now names the
  time the code was sent, so it can be matched against the inbox, states plainly that asking
  for another stops earlier ones working, and confirms a resend with its own time rather than
  leaving a restarted countdown as the only clue.
- **A card with no signal said the part did not exist.** With no connection and no saved copy
  there is nothing to render, and the app fell through to a plain not-found page — telling
  someone standing at their own vehicle that the part is not there, when the truth is only that
  the phone cannot reach it. The card's not-found state now asks the radio first: no connection
  says so and explains that anything logged meanwhile is kept and uploaded later; a genuinely
  missing part still says that plainly, with a way back to the garage. The offline page is also
  stored ahead of time now — Serwist keeps a build's scripts but not its rendered pages, so
  there had been nothing to show at the one moment it exists for.
- **Moving a tag confirmed the wrong part.** The message named the component the tag had just
  left rather than the one it now opens, which is precisely backwards for the only sentence
  telling you the move worked.
- **The offline specs were offline before they started.** `Cypress.automation` is an ordinary
  function, so calling it at the top level of a test ran it while the test body was still being
  read — before the first `cy.visit`. Every test that mentioned going offline anywhere was
  therefore offline from its opening line: the page load was cut short, markup arrived with no
  stylesheet and no script, and the card never hydrated. It presented for a long time as a
  hydration bug, and four separate theories were tried and discarded before the cause was
  found. Wrapping the call in `cy.then` puts it back in command order. The suite went from one
  passing to four, and from three minutes to fifteen seconds.
- **A saved edit appeared not to save.** Editing a vehicle, or moving a tag to another part,
  wrote to the database and then left the old value on screen — the refresh was called from
  inside the transition that did the writing, where it is swallowed. It reads as an edit that
  silently failed, which is the worst way for a bug to present: the natural response is to do
  it again.
- **The service worker could serve a stale React payload.** Card routes were cached
  stale-while-revalidate for everything except the page document, which included the payloads
  the app uses to refresh itself. Everything under a vehicle now comes from the network when
  there is one, and from the cache only when there is not.
- **Owners can say which zone a part belongs to.** Placement follows the template a part was
  created from, which covers the seeded library and nothing added by hand — a part with no
  template belonged to no zone, so no badge on the vehicle could ever reach it. A part can now
  be placed in any zone, returned to its template default, or taken out of every zone without
  being deleted. Template-placed parts keep the zone's working order; anything moved in follows
  on the end rather than displacing it.
- **Zone tags.** A tag can now cover a working area instead of a single part. One tag per
  part is the sharpest thing this product does — tap the diff, get the diff — and it does not
  scale to a whole vehicle, because nobody is putting twenty badges on a truck. A zone tag is
  the other end of that trade: one badge where a person already stands, opening everything
  they reach from there.
  - Three fixed zones: **Under-hood** (radiator shroud or fuse box lid), **Fuel & charging**
    (inside the filler or charge flap), and **Underbody** (frame rail or door jamb). Fixed
    rather than owner-defined, because a zone has to mean the same thing on every vehicle for
    a badge to be worth printing.
  - Tapping one opens what is due soonest, then a one-press log sheet for every part in that
    zone, then a way through to the rest of the vehicle. Due dates are projected with the same
    calculation the card uses, so the two can never disagree.
  - Parts are matched by the template they were created from, never by name — an owner can
    rename a component to anything, and the badge on the bonnet cannot be reprinted.
  - A tag binds to a part **or** a zone, never both and never neither, enforced by a database
    constraint rather than by the application remembering.
- **The component card was a dead end.** Arriving by tag leaves no history to go back through,
  and the vehicle name in the header was plain text, so there was no way to the vehicle or the
  garage from the screen a tap lands on. It is now a link, at the full touch-target size.
- **Garage management** (FR-048, FR-046). A vehicle could be born inside the claim flow and
  never touched again: the garage listed vehicles and offered nothing else.
  - **Add a vehicle** from the garage, before any tag exists. Someone setting up before their
    tags arrive now has somewhere to start, and lands on the new vehicle rather than back on
    a list.
  - **Edit** year, make, model, trim, nickname and power source. The readable address is
    deliberately left alone — it is bookmarked, shared and reached from a tag, so renaming
    must not break a link somebody already holds. The odometer is not editable either: it
    follows the highest confirmed reading across entries (FR-025), so a number typed here
    would be overwritten by the next fill-up and mean nothing in the meantime.
  - **Delete**, guarded by retyping the vehicle's name rather than a second tap. It takes
    every component and the entire service history with it, and that history is the product.
    The physical tags survive as unclaimed hardware, so labels can be reused rather than
    binned.
  - **Move a tag to another part** (FR-046). `rebindTag` had existed since the claim flow was
    built and had never had a caller — a tag peeled off a differential and stuck on a
    transfer case could not be re-pointed. The identifier printed on the hardware never
    changes; only what it points at does.
- **Integration suite against real PostgreSQL** via testcontainers, applying the real
  migrations and exercising the real policies — no mocked drivers. Covers owner isolation,
  append-only privileges, the grant surface, every CHECK constraint, override precedence
  and tombstone fallback, both `SECURITY DEFINER` guest paths, and the outbox driven end to
  end: an insert that loses its acknowledgement still yields one row, 100 offline entries
  arrive complete, and a device whose clock runs three days fast does not win precedence.
- **Cypress UX suite** using `cypress-real-events`, launched via `run-dev-clean.ps1`.
  Covers the scan-to-card journey, the four-category field swap, claiming, energy logging,
  passport sharing, offline capture, and an automated audit of touch targets, contrast and
  responsive layout.

### Changed
- **Cloudflare Workers deployment** via OpenNext, matching how rootlevellabs.tech is already
  served. `wrangler.jsonc` carries only public values; the service-role key is set with
  `wrangler secret put` so it never reaches the repository or a build log.
- **Reverted `proxy.ts` back to `middleware.ts`.** Next 16's own upgrade guide states the edge
  runtime is not supported in `proxy` — it is always `nodejs` and cannot be configured — and
  OpenNext cannot run Node.js middleware on Workers. `middleware` is the documented route to
  the edge runtime, so the deployment target decides this rather than preference.
- Pre-commit test gate now enforces Article V's three-layer separation rather than a
  co-located filename convention. `.forge/test-coverage-policy.json` declares which layer
  covers which paths; coverage stays mandatory and the gate still blocks an untested file
  under `lib/`, but a Server Component is no longer asked for a mocked unit test it could
  not meaningfully have.

### Fixed

- **A UX spec was breaking four unrelated tests in the next spec.** The tag-move test moved
  the seeded front-differential tag and put it back at the end — a restore that only runs when
  the test passes, which is exactly when it is not needed. Every failure left the fixture
  pointing at the wrong part, and the scan-to-card suite then failed for a reason that had
  nothing to do with scanning. It now moves a fixture no other spec reads, which removes the
  problem rather than trying to undo it.
- **The service worker could serve a card that paints and then does nothing.** Component
  card pages were cached with `stale-while-revalidate`, which returns the previous copy while
  it fetches a new one — including the page's HTML. A document from this app names the exact
  build chunks it needs, so a stale one handed back against a newer bundle leaves React with
  markup from a different build: the card paints, and every button on it is dead. With
  `skipWaiting` and `clientsClaim` the worker takes over mid-load, so this could happen on a
  first visit after a deploy, and it looks exactly like a broken feature rather than a stale
  cache. Card documents now come from the network whenever there is one and from the cache
  only when there is not, which keeps a tap working with no signal without ever risking that
  on a tap that had one. Data payloads, which name no build, are still served cache-first.
- The test-only sign-in and tag routes are gated on the request having arrived on this
  machine, not merely on the build being a development one. That lets the UX suite run
  against a local production build — the only build that has a service worker, and therefore
  the only one where the offline behaviour is the real thing — while a request from anywhere
  else, tunnel included, still gets a 404 whatever the environment says.
- **Two of the card's three quick actions opened the wrong form.** `LogModal` held the
  category in its own state, set the first time it mounted and never revisited, so Repair
  and Upgrade both opened Maintenance. The three buttons are the card's entire purpose. The
  button that opens the sheet now decides the category; a tab press inside overrides it, and
  only until the sheet closes.
- **Passport sharing lost every click.** The panel carried no hydration marker, so a real
  click landed before React was listening — no link, no error, no pending state, nothing.
  It now advertises readiness the way every other interactive root already does.
- Serwist can be enabled in development with `run-dev-clean.ps1 -WithServiceWorker`. Without
  a worker there is nothing to serve the page when the radio is off, so the offline specs
  were failing on a blank page rather than on the behaviour they describe.
- **Tapping a claimed tag while signed out was a dead end.** Everything claimed reads as
  forbidden to a caller with no session — including the owner's own tag, and an owner on a
  phone is signed out regularly. The tap landed on "unavailable" at their own vehicle, with
  no way through. A tap with no session now resolves nothing and goes to sign-in carrying
  the scanned address, so the round trip still ends on the part.
  This also closes an oracle. Answering differently for a real tag and an invented one told
  anyone willing to guess which tags exist; both now give the same answer until there is a
  session to judge against.
- **`run-dev-clean.ps1` could not run at all.** The mandated UX-test launcher invoked `pnpm`
  in a project that uses npm, so Article V's UX layer could not be launched the way Article V
  requires. It now uses the project's own package manager.
- The hands-free control moved into the log sheet's header. Anything above the fields pushes
  them off a phone screen, and the fields are what the sheet is for.
- **Walking to the inbox to fetch the sign-in code lost your place.** The second step of
  sign-in requires leaving the page — the code arrives by email — but which step to show
  was held only in component state, so returning to the tab landed on an empty email field
  having just been sent a perfectly good code. On a phone the tab is often discarded
  outright while the mail app is open, so the record now lives in `localStorage`, and the
  step is *derived* from it rather than mirrored into state: sending a code writes the
  record and the form follows, and the record lapsing or being cleared returns the form to
  the email step on its own. There is no second copy of the truth to fall out of step, and
  a code sent in another tab moves this one. The remaining validity is shown as a live
  countdown matching `otp_expiry`, and a lapsed code clears itself with an explanation
  rather than silently failing on submit.
- The resumed step is gated behind hydration completing. The server cannot see the device's
  storage, so it always renders the email step; showing the code step on the first client
  render instead made React find markup it did not expect and throw the entire form away and
  rebuild it. `useSyncExternalStore`'s server snapshot did not prevent this on its own —
  verified in the browser against the actual hydration error, not assumed. The gate waits on
  a timer rather than an animation frame, because a browser paints no frames for a hidden
  tab — and a tab restored from behind the mail app is precisely the case this serves.
- **The app was unusable through a tunnel, silently.** The dev server refuses cross-origin
  requests for its own client chunks, so a tunnelled page rendered on the server but never
  hydrated — every button looked correct and did nothing. `allowedDevOrigins` fixes it, and
  `serverActions.allowedOrigins` covers the CSRF check a tunnel breaks by design, which is
  the entire sign-in path. Both are inert in a production build.
- **The sign-in email carried no code.** Supabase's default magic-link template omits
  `{{ .Token }}`, so the form asked for six digits that were never sent.
  `supabase/templates/magic-link.html` supplies both the code and the link. This applies to
  hosted Supabase as well, not only the local stack.
- **No table privileges existed at all — the application was dead on arrival.** Row Level
  Security decides which *rows* a role may touch; it does not grant permission to touch the
  table, and PostgreSQL refuses the statement before any policy is consulted. The schema
  relied on Supabase's ambient default privileges, which attach to a specific creating role
  and do not extend to tables created by the migration role, so every query for every role
  was denied. The integration harness had been granting `ALL` up front, making it strictly
  more permissive than production — the whole suite passed against a schema that could not
  work. Privileges are now enumerated explicitly per table, the harness grants nothing, and
  the grant surface is asserted directly. Found by starting the real local stack.
- Views needed their own grants: every underlying table was readable and the card still
  failed on `v_current_service_revisions`.
- `EXECUTE` is granted to `PUBLIC` by default, so `anon` could invoke the owner-facing
  RPCs. Revoked from `PUBLIC` and granted only where intended.
- **Append-only was enforceable only by Row Level Security, which `service_role` bypasses.**
  `service_role` holds `BYPASSRLS`, so any server-side path holding the service key could
  have rewritten or erased a recorded revision — the exact thing the append-only model
  exists to prevent. `UPDATE` and `DELETE` are now revoked on both revision tables, so
  immutability holds twice over: no policy, and no privilege.
- **The claim flow could never complete.** The Row Level Security policy on `tags` was
  `claimed_by = auth.uid()`, but an unclaimed tag has `claimed_by` NULL — so it matched
  nobody, including the owner standing at the vehicle trying to claim it. `claim_tag` is
  `SECURITY INVOKER`, so its own lookup was filtered out too and it raised `tag_not_found`
  every time. Unclaimed tags are now readable by any signed-in owner, which discloses
  nothing: the row carries its own id and four nulls, and the id is already in the hand of
  whoever scanned it. Found by the Cypress claim journey.
- **`v_current_energy_revisions` could not be filtered by vehicle.** It exposed `entry_id`
  but not `vehicle_id`, so the card reached for the vehicle through a PostgREST embed on a
  view — and views carry no declared relationships, so the embed silently returned nothing.
  The previous odometer was always null and economy stayed permanently blank.
- **The energy logger could never compute economy.** The component card rendered it without
  the previous odometer reading, so every interval resolved to "first entry" and MPG,
  mi/kWh and cost-per-mile were permanently blank — the whole purpose of a fuel-door tag.
  Found by the browser assertion that 300 miles on 20 gallons is 15.0 mpg.
- **`robots.txt` was redirected to sign-in by the proxy**, so a crawler would never have
  read `Disallow: /p/` — removing a layer of the passport privacy defense.
- **The root route did not exist.** `GET /` returned 404, dead-ending anyone opening the
  bare domain or launching the installed app from a home screen.
- A back link on the vehicle overview measured 19px against the 48px touch-target floor.
  Found by the automated touch-target audit.
- `checkOdometer` no longer formats its own message. Locale formatting moved to
  `describeOdometerWarning`, keeping a function that runs on every keystroke free of ICU
  initialization.
- Saving a fill-up gave no visible confirmation at all — the form simply sat there. It now
  confirms and clears, so someone at a pump can see the entry landed before walking away.
- Fuel cost now derives as the owner types rather than when they leave a field: someone
  reading two numbers off a pump display should see the third appear, not have to tab away
  to discover it.
- UUIDv7 ids generated within the same millisecond did not sort. The outbox drains in
  bursts, so the monotonic counter RFC 9562 reserves is now used.

### Removed

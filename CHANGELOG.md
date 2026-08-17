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
  verified in the browser against the actual hydration error, not assumed.
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

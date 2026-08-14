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
- Pre-commit test gate now enforces Article V's three-layer separation rather than a
  co-located filename convention. `.forge/test-coverage-policy.json` declares which layer
  covers which paths; coverage stays mandatory and the gate still blocks an untested file
  under `lib/`, but a Server Component is no longer asked for a mocked unit test it could
  not meaningfully have.

### Fixed

### Removed

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
- On-device photo compression using native browser APIs — `createImageBitmap` with
  `imageOrientation: 'from-image'` and `OffscreenCanvas` in a worker. The framework-first
  gate passed, so no third-party library was added.

### Changed
- Pre-commit test gate now enforces Article V's three-layer separation rather than a
  co-located filename convention. `.forge/test-coverage-policy.json` declares which layer
  covers which paths; coverage stays mandatory and the gate still blocks an untested file
  under `lib/`, but a Server Component is no longer asked for a mocked unit test it could
  not meaningfully have.

### Fixed

### Removed

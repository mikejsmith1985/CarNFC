# Implementation Plan: ServiceCard — Automotive NFC Companion

**Branch**: `feature/servicecard-nfc-pwa` | **Date**: 2026-08-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-servicecard-nfc-pwa/spec.md`

---

## Summary

ServiceCard is an offline-capable web application launched by tapping an NFC tag on a vehicle component. A tap resolves an opaque tag identifier to that exact part on that exact vehicle and renders a service card — mechanics HUD, effective specifications, history timeline — inside one second, then lets the owner record work in four strictly separated categories or log a fuel-up or charging session.

The technical approach rests on four decisions, each documented in [`research.md`](./research.md):

1. **One round trip to paint.** The card is a React Server Component fed by a single Postgres RPC returning header, specs, reminders, and timeline as one payload. Header and HUD render outside any Suspense boundary; the timeline streams (R11).
2. **Append-only history.** Entries are immutable. An edit writes a superseding revision, a delete writes a tombstone, and precedence is decided by server receipt time — never by a device clock the spec explicitly assumes may be wrong. This eliminates the offline conflict class rather than adjudicating it (R8).
3. **Exactly-once by primary key.** The client generates the revision's UUIDv7 before it leaves the device; the server inserts `ON CONFLICT (id) DO NOTHING`. Retry safety becomes a database constraint instead of application logic (R7).
4. **Two guest doors, both `SECURITY DEFINER`.** Tag resolution and passport reading are the only paths an unauthenticated caller may take. Both are Postgres functions returning fixed projections with redaction performed in SQL, so no RLS exception exists and a leaked anon key discloses nothing (R12, R13).

---

## Technical Context

All versions resolved against the live npm registry on 2026-08-13, not recalled.

**Language/Version**: TypeScript `7.0.2`, Node.js 22 LTS

**Primary Dependencies**: Next.js `16.3.0` (App Router) · React `19.2.8` · Tailwind CSS `4.3.3` with `@tailwindcss/postcss` · `lucide-react` `1.31.0` · `@supabase/supabase-js` `2.112.3` · `@supabase/ssr` `0.12.4` · `@serwist/next` `9.5.12` · `idb` `8.0.3` · `zod` `4.4.3`

**Storage**: PostgreSQL 15 via Supabase (RLS-enforced) · Supabase Storage for attachments · IndexedDB on-device for the offline cache and outbox

**Testing**: Vitest `4.1.10` + `@testing-library/react` `16.3.2` + `happy-dom` `20.11.2` (unit) · `testcontainers` `12.1.0` + `@testcontainers/postgresql` `12.1.0` + Supabase CLI `2.114.0` local stack (integration) · Cypress `15.20.1` + `cypress-real-events` `1.15.0` (UX)

**Target Platform**: Installable web app on current mobile browsers, iOS 17+ and Android 12+; deployed as a Node server

**Project Type**: Full-stack web application (single Next.js app; the database is the backend)

**Performance Goals**: Card interactive under 1s at p95 on a throttled mobile profile (SC-001); same offline (SC-002); `get_component_card` under 200ms p95 server-side

**Constraints**: Offline read and write for previously visited cards · exactly-once sync with zero loss (SC-005) · every touch target ≥48×48px and every text contrast ≥4.5:1 (SC-008) · usable from 320px to 430px wide (SC-010) · imperial units only

**Scale/Scope**: Personal-vehicle data volumes — tens of vehicles per account, hundreds of components, thousands of entries. Roughly 12 routes, 14 tables, 3 views, 5 RPCs.

---

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1.*

| Article | Gate | Pre-Phase 0 | Post-Phase 1 |
|---|---|---|---|
| I — Prime Directive | Best route over fastest; production-ready | ✅ Current stable versions verified against the registry; append-only history and DB-enforced constraints chosen over quicker mutable-row shortcuts | ✅ Held |
| II — Process Protection | No wildcard process kills | ✅ No process management in this feature; warning carried into `quickstart.md` | ✅ Held |
| III — Branching | Feature branch, PR to main | ✅ On `feature/servicecard-nfc-pwa`; no commits to `main` | ✅ Held |
| IV — Code Quality | Self-documenting names, verb-first functions, no magic numbers, <40-line functions, file purpose comments | ✅ Binding on implementation; enum-backed categories replace stringly-typed values; thresholds (10 MB, 5 files, 2048px, 15-min URLs) are named constants | ✅ Held |
| V — Testing | Three layers separated; Red→Green→Refactor | ⚠️ `scripts/run-dev-clean.ps1` absent — mandated as the UX launcher | ✅ Resolved: creating it is a setup task; test contracts enumerated in `contracts/` |
| VI — Documentation | `CHANGELOG.md` is the single source of truth; no ad-hoc status docs | ✅ Only `specs/001-*` pipeline artifacts produced, which are exempt | ✅ Held; CHANGELOG updates land with implementation PRs |
| VII — Framework-First | Confirm the framework does not already provide it | ⚠️ Four candidates to gate | ✅ Gated below; one justified custom component |
| VIII — Release | Local pipeline only, never Actions | ✅ `scripts/local-release.ps1` absent → `git tag` + `gh release create` (R19) | ✅ Held |
| IX — Vault Zero-Knowledge | Secrets injected, never handled | ✅ Service-role key server-only; vault injection for non-local envs | ✅ Held; no secret in any client-reachable module |
| X — Verification & Proof | Evidence, not "it compiles" | ✅ Every success criterion has a measurable check in `quickstart.md` | ✅ Held |
| XI — Output Restraint | ≤1 dashboard; no phase narration | ✅ No dashboard needed | ✅ Held |
| XII — Response Format | Tight, scannable | ✅ Applied | ✅ Held |

### Article VII — Framework-First gate detail

| Candidate | Does the framework already provide it? | Decision |
|---|---|---|
| Authentication | Yes — Supabase Auth email OTP | **Use it.** No custom auth |
| Authorization | Yes — Postgres RLS | **Use it.** No application-layer permission checks |
| File storage | Yes — Supabase Storage with path-prefix policies | **Use it** |
| Migrations | Yes — Supabase CLI | **Use it** |
| Service worker / PWA manifest | **No** — Next.js ships neither | Serwist (maintained Workbox wrapper). Documented gap, library not custom code (R5) |
| IndexedDB promises | Partially — raw IDB is a callback API | `idb`, a ~1 KB promise adapter over a browser primitive (R6) |
| On-device image compression | **Yes** — `createImageBitmap({imageOrientation:'from-image'})` + `OffscreenCanvas` in a Worker | **Gate passes with no dependency.** EXIF orientation and worker offload were the only reasons to reach for a library, and both are native (R14) |
| Offline write queue with exactly-once delivery | **No** — nothing in Next.js or Supabase provides this | **Justified custom component.** See Complexity Tracking |

---

## Project Structure

### Documentation (this feature)

```text
specs/001-servicecard-nfc-pwa/
├── plan.md                  # This file
├── spec.md                  # Requirements (75 FRs, 15 SCs)
├── research.md              # Phase 0 — 19 resolved decisions
├── data-model.md            # Phase 1 — schema, RLS, indexes
├── quickstart.md            # Phase 1 — setup + 7 validation scenarios
├── contracts/               # Phase 1
│   ├── README.md
│   ├── routes.md            # URL surface (the tag address is permanent)
│   ├── rpc.md               # 5 Postgres functions, 16 contract tests
│   └── offline-sync.md      # Outbox protocol, 6 guarantees, 9 tests
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 — created by /speckit-tasks, NOT by this command
```

### Source Code (repository root)

```text
app/
├── layout.tsx                                   # Dark-first shell, viewport, manifest link
├── globals.css                                  # Tailwind 4 @theme — high-contrast palette (SC-008)
├── manifest.ts                                  # PWA manifest (FR-044)
├── robots.ts                                    # Disallow /p/ (FR-051b)
├── t/[tag_id]/page.tsx                          # Tag resolver → redirect (FR-001a)
├── v/[vehicle_id]/
│   ├── page.tsx                                 # Vehicle overview (FR-052)
│   └── c/[component_id]/page.tsx                # Component Service Card — primary view
├── claim/page.tsx                               # Claim wizard (FR-002)
├── p/[share_token]/page.tsx                     # Read-only passport (FR-049a)
├── garage/page.tsx                              # Multi-vehicle list
├── auth/verify/page.tsx                         # Email OTP (FR-047)
└── actions/                                     # Server Actions (see contracts/routes.md)

components/
├── LogModal.tsx                                 # 4-category tabbed entry (FR-016–FR-022)
├── EnergyLogger.tsx                             # ICE + EV tabbed logger (FR-029–FR-036)
├── MechanicsHud.tsx                             # Specs with override flagging (FR-009, FR-010)
├── ComponentTimeline.tsx                        # History, category-badged (FR-012)
├── VehicleHeader.tsx                            # Identity + odometer (FR-007)
├── QuickActions.tsx                             # ≥48px targets (FR-014)
├── ReminderBanner.tsx                           # Next-due / re-check (FR-013, FR-023)
├── SyncIndicator.tsx                            # Pending + stuck state (FR-042)
├── AttachmentPicker.tsx                         # Capture + compress (FR-026)
└── ui/                                          # Primitives enforcing the 48px floor

lib/
├── supabase/
│   ├── schema.sql                               # Full schema, RLS, views, RPCs
│   ├── client.ts / server.ts / middleware.ts    # @supabase/ssr wiring
│   └── queries.ts
├── offline/
│   ├── db.ts                                    # idb stores: cards, outbox, blobs, meta
│   ├── outbox.ts                                # Enqueue / drain / backoff (custom component)
│   └── sync.ts                                  # Triggers: online, focus, background sync
├── calc/
│   ├── fuel.ts                                  # MPG, cost/mile, partial + missed fills
│   ├── ev.ts                                    # mi/kWh, Wh/mi, $/mile
│   └── specs.ts                                 # Effective-spec resolution mirror
├── media/compress.ts                            # createImageBitmap + OffscreenCanvas worker
├── validation/                                  # Zod schemas — one definition, both sides
└── constants.ts                                 # Named limits; no magic numbers (Article IV)

types/
└── servicecard.ts                               # Vehicle, ComponentTag, ServiceLog union, FuelLog, EVChargeLog

supabase/migrations/                             # Supabase CLI migrations
tests/
├── unit/                                        # Vitest, mocked, <10ms
├── integration/                                 # testcontainers + real RLS
└── ux/                                          # Cypress + cypress-real-events
scripts/
├── run-dev-clean.ps1                            # Mandated UX launcher (Article V) — to create
└── seed-demo.ts                                 # Raptor fixture from the spec
public/
```

**Structure Decision**: A single Next.js application at the repository root, not a `frontend/` + `backend/` split. The backend *is* the database: authorization is RLS, the read path is one RPC, and the only server code is Server Components and Server Actions. Introducing a separate API tier would add a hop inside a 1-second budget and duplicate authorization that Postgres already enforces. The paths `types/servicecard.ts`, `app/v/[vehicle_id]/c/[component_id]/page.tsx`, `components/LogModal.tsx`, `components/EnergyLogger.tsx`, and `lib/supabase/schema.sql` are placed exactly as the requester specified.

---

## Phase Status

| Phase | Output | Status |
|---|---|---|
| 0 — Research | `research.md` — 19 decisions, all NEEDS CLARIFICATION resolved | ✅ Complete |
| 1 — Design | `data-model.md`, `contracts/` (4 files), `quickstart.md`, agent context | ✅ Complete |
| 2 — Tasks | `tasks.md` | ⏳ `/speckit-tasks` |

---

## Complexity Tracking

> One violation of "use what the framework provides", justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Custom offline outbox and sync engine (`lib/offline/`) | FR-039 through FR-043 require accepting writes with no connectivity, delivering them exactly once, never discarding them, and converging across devices. Neither Next.js nor Supabase provides an offline write queue — a documented gap under Article VII | **Supabase Realtime** solves live collaboration, not durable offline queueing, and drops writes made with no socket. **Workbox Background Sync** replays raw HTTP requests with no idempotency and no user-visible failure state, so it cannot satisfy FR-041 or FR-042. **Waiting for connectivity** contradicts the core premise: a steel-sided garage is exactly where this product is used |

Two design choices keep that component as small as it can be: client-generated UUIDv7 primary keys push exactly-once onto a database constraint rather than queue logic (R7), and the append-only revision model means the engine performs no merge at all (R8). What remains is enqueue, drain, and backoff.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `get_public_passport` is the one unauthenticated data path | A defect is a data breach | Redaction in SQL, not in the client; 5 dedicated contract tests; reviewed as security surface |
| `resolve_tag` timing could differentiate `forbidden` from `unknown` | Claimed tags become enumerable | Identical payload shape and constant-time branch; asserted by contract test 7 |
| SC-001's 1-second budget on a mid-range phone | Core promise fails | Single RPC + RSC + Suspense on the timeline; 200ms server budget; measured under throttling, not by feel |
| TypeScript 7 is a recent major | Toolchain incompatibility | Fallback to 5.9.3 is a one-line change with no source impact (R1) |
| Next 16 async `params` mis-written as Next 14 sync | Runtime failures across every dynamic route | Called out in `research.md` and again in `quickstart.md`; caught by the first UX test |

---

## Deferred to implementation

- Exact Tailwind palette values, chosen to satisfy the 4.5:1 measurement rather than by eye.
- Full seed content of `component_templates` beyond the demo fixture.
- Copy and microcopy for error and empty states.

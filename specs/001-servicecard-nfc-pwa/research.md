# Phase 0 Research: ServiceCard — Automotive NFC Companion

**Feature**: `specs/001-servicecard-nfc-pwa` | **Date**: 2026-08-13

All package versions below were resolved against the live npm registry on 2026-08-13, not recalled from memory. Nothing in this document is marked NEEDS CLARIFICATION; every open question from Technical Context is resolved here.

---

## R1 — Framework and runtime versions

**Decision**: Next.js `16.3.0` (App Router), React `19.2.8`, TypeScript `7.0.2`, Node.js 22 LTS.

**Rationale**: The spec's requester asked for "Next.js 14+"; 16.3.0 is the current stable release and satisfies that floor. React 19.2.8 is Next 16's declared peer. TypeScript 7.0.2 is the current `latest` dist-tag (the native compiler); it is stable and materially faster on a codebase this size.

**Consequences that change how code is written**:

- **`params` is a Promise.** Since Next 15, dynamic route segment props are async. Every page under `app/v/[vehicle_id]/c/[component_id]` must `await params`. Writing Next 14-style synchronous `params.vehicle_id` will not compile. This is the single most common porting error and is called out again in `quickstart.md`.
- React 19 Server Components are the default; `"use client"` is required on every interactive component (`LogModal`, `EnergyLogger`, the sync indicator).

**Alternatives considered**: Pinning Next 14 to match the requester's literal wording — rejected, it is two majors behind and would ship a new project onto an older App Router. TypeScript 5.9.3 (last 5.x) — held as a documented fallback if any toolchain plugin proves incompatible with the TS 7 native compiler; switching is a one-line version change with no source impact.

---

## R2 — Styling

**Decision**: Tailwind CSS `4.3.3` with `@tailwindcss/postcss` `4.3.3`.

**Rationale**: Current stable. Tailwind 4 is CSS-first: theme tokens are declared in an `@theme` block inside the stylesheet, and there is no `tailwind.config.js` by default. The high-contrast dark palette required by FR-015 and SC-008 is therefore defined as CSS custom properties in `app/globals.css`, which also makes the 4.5:1 contrast ratios auditable in one file rather than scattered through class names.

**Consequences**: Do not scaffold a `tailwind.config.js` — that is Tailwind 3 shape and will be silently ignored. Dark mode is the *default* palette here, not a `dark:` variant; the app ships one committed high-contrast theme (spec has no light mode requirement), which removes an entire class of contrast bugs.

**Alternatives considered**: Tailwind 3 with a JS config — rejected as the previous major. CSS Modules — rejected; the spec's 48px-target and contrast rules are far easier to enforce as reusable utility compositions.

---

## R3 — Icons

**Decision**: `lucide-react` `1.31.0`.

**Rationale**: Requested by name in the input. Tree-shakeable per-icon imports keep the first-paint bundle small, which matters directly for SC-001's 1-second budget.

---

## R4 — Data layer, auth, and storage

**Decision**: Supabase — `@supabase/supabase-js` `2.112.3`, `@supabase/ssr` `0.12.4`, Supabase CLI `2.114.0` for local stack and migrations.

**Rationale**: Requested by name. It supplies three things the spec needs and that we must not rebuild (Article VII):

| Spec need | Supabase feature used | Custom code avoided |
|---|---|---|
| FR-047 email one-time code auth | Supabase Auth `signInWithOtp` | Entire auth system |
| FR-048 owner-only data access | Postgres Row Level Security | Application-layer authorization |
| FR-026 attachments | Supabase Storage with owner-scoped bucket policies | File upload/serving |
| Schema evolution | Supabase CLI migrations | Custom migration runner |

**Session persistence (FR-047a)**: `@supabase/ssr` stores the session in cookies so Server Components can read it. To make sessions persist "indefinitely" as FR-047a demands, refresh-token expiry is configured long (365 days) with rotation enabled, and the middleware refreshes on every request. A session that is used at least once a year never expires.

**Alternatives considered**: Firebase — rejected; the spec's access model is relational (revision chains, spec-override precedence, economy intervals over ordered odometer readings) and RLS expresses FR-048 declaratively in a way Firestore rules cannot. Custom Postgres + hand-rolled auth — rejected outright by Article VII.

---

## R5 — Offline service worker (Framework-First gate)

**Decision**: Serwist — `@serwist/next` `9.5.12` and `serwist` `9.5.12`.

**Gate finding**: Next.js ships **no** service-worker or PWA-manifest generation of its own. This is a documented framework gap, so a library is justified rather than custom infrastructure.

**Rationale**: `next-pwa`, the historical choice, is unmaintained and never gained App Router support. Serwist is its maintained successor, is built on Workbox strategies, and supports the App Router directly.

**Caching strategies mapped to requirements**:

| Requirement | Strategy |
|---|---|
| FR-038 previously visited card readable offline | `StaleWhileRevalidate` on card RPC responses, mirrored into IndexedDB with a `fetched_at` stamp |
| FR-044 installable | Serwist-generated manifest + precached app shell |
| SC-002 repeat visit under 1s offline | Precached shell paints immediately; card body hydrates from IndexedDB |

**Alternatives considered**: `next-pwa` — rejected, unmaintained. Hand-written service worker — rejected; Article VII forbids rebuilding what Workbox already provides.

---

## R6 — Local persistence

**Decision**: `idb` `8.0.3`.

**Gate finding**: The raw IndexedDB API is a callback/event API with no promise surface. `idb` is the de-facto minimal promise wrapper (~1 KB) and adds no abstraction beyond that. Accepted as a thin adapter over a browser primitive, not as reinvented infrastructure.

**Object stores**:

| Store | Key | Holds |
|---|---|---|
| `cards` | `${vehicle_slug}/${component_slug}` | Last card payload + `fetched_at` (FR-038) |
| `outbox` | revision `id` (UUIDv7) | Pending revisions awaiting sync (FR-039) |
| `blobs` | attachment `id` | Compressed attachment bytes awaiting upload (FR-026b) |
| `meta` | fixed keys | Current account, last sync attempt, failure counters (FR-042) |

---

## R7 — Exactly-once synchronization (the one genuinely custom component)

**Decision**: Client-generated UUIDv7 revision IDs, inserted with `ON CONFLICT (id) DO NOTHING`, drained from an IndexedDB outbox.

**Gate finding**: No part of Next.js or Supabase provides an offline write queue with exactly-once delivery. This is a real, documented gap, and the outbox is therefore the only custom infrastructure this feature builds. It is recorded in the plan's Complexity Tracking table.

**Rationale**: FR-041 requires that a retried submission produces exactly one stored entry. Making the primary key client-generated turns retry-safety into a database constraint rather than application logic — an ambiguous network failure followed by a retry inserts the same key and is a no-op. UUIDv7 additionally sorts by creation time, which keeps index locality good.

**Ordering (FR-043a, FR-043b)**: Every revision carries both `client_created_at` (untrusted, from a device whose clock the spec explicitly assumes may be wrong) and `server_received_at` (`default now()`, authoritative). All ordering, precedence, and last-write-wins decisions read `server_received_at` only. `client_created_at` is retained for display and audit but never for resolution.

**Never-discard (FR-042)**: The outbox drains with exponential backoff. A record is removed from the outbox only on a confirmed server acknowledgement. After a configured number of consecutive failures it is flagged `stuck` and surfaced in the UI, but is never deleted.

**Alternatives considered**: Server-assigned IDs with a separate idempotency-key table — rejected as strictly more moving parts for the same guarantee. Supabase Realtime presence-based sync — rejected; it addresses live collaboration, not durable offline queueing.

---

## R8 — Revision chain and conflict-free history

**Decision**: An identity row per entry plus an append-only revision table; "current" is the revision with the greatest `server_received_at`, tie-broken by `id`.

**Rationale**: Clarification Q3 made entries immutable — an edit writes a superseding revision and a delete writes a tombstone. A per-entry monotonic revision number cannot be assigned by two devices that are both offline, so the chain is expressed with a nullable `supersedes_revision_id` and resolved by server receipt order. This satisfies FR-027 through FR-027c and FR-043a without any conflict adjudication, because both concurrent revisions are retained and only display precedence is decided.

**Alternatives considered**: In-place updates with an `updated_at` column — rejected, it loses one device's offline edit and contradicts FR-043. Full CRDT — rejected as vastly disproportionate; a service log has no concurrent-text-editing semantics to merge.

---

## R9 — Category modelling for the four log types

**Decision**: One `service_entry_revisions` table with a `category` enum and category-specific nullable columns, guarded by `CHECK` constraints that force irrelevant columns to be NULL. Specification overrides live in a separate `spec_overrides` child table because FR-022 allows zero or more per entry.

**Rationale**: FR-016 requires each entry to be exactly one of four categories, and the requested `types/servicecard.ts` models this as a TypeScript discriminated union. A single table with per-category CHECK constraints maps one-to-one onto that union, keeps the component timeline a single ordered scan with no joins, and lets the database — not application code — enforce that a Repair never carries a warranty date.

**Alternatives considered**: Base table plus four detail tables — rejected; every timeline read becomes a four-way `LEFT JOIN` and directly threatens SC-001. A single JSONB payload column — rejected; it discards type safety and makes the CHECK constraints above impossible.

---

## R10 — Effective specification resolution (FR-009, FR-010)

**Decision**: A database view, `v_component_effective_specs`, that overlays factory specs with the most recent non-tombstoned override per spec key.

**Rationale**: The HUD must show the effective value, flag it as non-factory, and still show the superseded factory value. Computing this in the database keeps it consistent between the owner card, the shared passport, and any future export, and keeps the card a single round trip. FR-010's "most recent wins, earlier marked superseded" is an ordinary window function over `server_received_at`.

**Alternatives considered**: Client-side resolution — rejected; it would have to be reimplemented for the passport view and would ship the full override history to the browser on every card load.

---

## R11 — Single-round-trip card read (SC-001)

**Decision**: One `SECURITY INVOKER` RPC, `get_component_card(p_vehicle_slug, p_component_slug)`, returning vehicle header, effective specs, reminders, and the first page of timeline entries as a single JSON payload, called from a Server Component.

**Rationale**: SC-001 allows 1 second at the 95th percentile on a mobile connection. Sequential client-side queries cannot meet that. One server-side RPC over one connection, rendered as RSC HTML, means the phone receives paintable markup on the first response. `SECURITY INVOKER` means RLS still applies — the RPC is a performance measure, never an authorization bypass.

**Streaming**: The header and mechanics HUD render outside any Suspense boundary so they paint first; the timeline renders inside one. A user reaching for a drain plug needs the torque value, not the 2019 history.

---

## R12 — Tag resolution without leaking (FR-001a, FR-001c, FR-003)

**Decision**: Route `/t/[tag_id]` handled server-side, calling a `SECURITY DEFINER` RPC `resolve_tag(p_tag_id)` that returns a status discriminator only.

**Rationale**: An unauthenticated scan must be able to learn "this tag is unclaimed" so it can route to the claim flow (FR-002), while a scan of someone else's claimed tag must learn nothing about the vehicle (FR-003, FR-048). A plain RLS-filtered `SELECT` cannot express that asymmetry — it would return an empty row for both cases. The RPC returns exactly one of `unclaimed`, `owned` (with the readable redirect path), `forbidden`, or `unknown`, and never includes vehicle data in the `forbidden` case.

**Unguessability (FR-001c)**: Tag IDs are 128 bits of CSPRNG randomness rendered base32url (26 characters). Brute-forcing an unclaimed tag to hijack it is not feasible.

---

## R13 — Passport share links (FR-049a, FR-051, FR-051b)

**Decision**: A 256-bit random token delivered in the URL; only its SHA-256 hash is stored. Access is via `SECURITY DEFINER` RPC `get_public_passport(p_token)`.

**Rationale**: Clarification Q4 requires guest access with no account, through a link separate from the owner's readable address. A `SECURITY DEFINER` function is the correct Postgres construct: it validates the hashed token and returns only the permitted projection, so the service-role key never leaves the server and never enters a browser (Article IX).

**Revocation (FR-051)**: Revoking sets `revoked_at` and the row is retained forever, so a re-minted link creates a *new* row while the old token still hashes to a revoked row and is refused. This is what makes "MUST never be reissued" true rather than merely unlikely.

**Cost redaction (FR-050)**: The RPC nulls all cost columns unless the share row has `include_costs = true`. Redaction happens in the database, so a client bug cannot leak spending.

**No indexing (FR-051b)**: The `/p/[token]` route exports `robots: { index: false, follow: false }`, sends `X-Robots-Tag: noindex, nofollow, noarchive`, ships no OpenGraph or Twitter card metadata, and `/p/` is disallowed in `robots.txt`. Without this, pasting a share link into any chat app would expand a preview containing the vehicle's history.

---

## R14 — On-device photo compression (Framework-First gate)

**Decision**: Native browser APIs — `createImageBitmap(blob, { imageOrientation: 'from-image' })` plus `OffscreenCanvas` inside a Web Worker, encoding to WebP at quality 0.82 with a 2048px longest edge.

**Gate finding**: **Gate passes with no dependency.** The two reasons a library is normally reached for here are EXIF orientation and main-thread blocking. `imageOrientation: 'from-image'` handles orientation natively — without it, a receipt photographed in portrait renders sideways and fails SC-014 — and `OffscreenCanvas` in a worker handles offload. There is no remaining documented gap, so per Article VII no library is added.

**Rationale for the parameters**: 2048px on the longest edge keeps 8-point receipt text and stamped part numbers legible (SC-014) while bringing a typical 12-megapixel capture from roughly 4 MB to roughly 400 KB — the difference between an upload that completes while walking out of a garage and one that stalls (SC-015). PDFs are passed through unmodified per FR-026a so manuals stay searchable.

**Alternatives considered**: `browser-image-compression` `2.0.2` — a good library, rejected only because the native path now covers what it was needed for. Server-side compression — rejected; it defeats FR-026b, which requires compression *before* queueing so the outbox stays small offline.

---

## R15 — Energy calculations (FR-031 through FR-036)

**Decision**: Pure TypeScript functions in `lib/calc/`, with the database storing only raw inputs and deriving nothing.

**Rationale**: Article V requires unit tests that are 100% mocked and run under 10ms. Economy math is the highest-value target for that: it is pure arithmetic with well-defined edge cases (partial fills, missed fills, zero divisors, SoC bounds). Storing only raw inputs means correcting the formula later re-derives all history rather than requiring a data migration.

**Interval semantics**: Distance-per-gallon is computed between consecutive **full** fills. A partial fill (FR-033) contributes its volume and cost to the enclosing interval but does not close one, and any interval containing a flagged missed fill yields no economy figure and carries a reason code the UI displays.

**EV metrics (FR-035)**: `mi/kWh`, `Wh/mi`, `$/kWh`, and `$/mile` derive from odometer delta since the previous energy entry for the vehicle, and energy entries are vehicle-scoped (FR-037) so a plug-in hybrid's fuel and charge entries interleave on one continuous odometer axis.

---

## R16 — Validation

**Decision**: Zod `4.4.3`, with one schema per log category, shared by the client form and the server action.

**Rationale**: FR-036's bounds (SoC within 0–100, end not below start, volumes positive) and FR-024's odometer plausibility rules must hold on both sides of the wire — a device that has been offline for days cannot be trusted to have validated correctly. One schema definition used in both places prevents the two from drifting.

---

## R17 — Testing stack (Article V, three-layer separation)

**Decision**:

| Layer | Tooling | Scope |
|---|---|---|
| Unit — 100% mocked, <10ms | Vitest `4.1.10`, `@testing-library/react` `16.3.2`, `happy-dom` `20.11.2` | Economy math, effective-spec resolution, revision-chain resolution, odometer validation, outbox dedupe |
| Integration — real infrastructure | `testcontainers` `12.1.0` + `@testcontainers/postgresql` `12.1.0`, Supabase CLI local stack | Real schema, real RLS policies exercised as distinct roles, real RPC behaviour, real Storage policies |
| UX — real events | Cypress `15.20.1` + `cypress-real-events` `1.15.0` | Tag scan → card → log flows, offline/online transitions, 48px target verification |

**Binding constraints from the constitution**: Integration tests use a real Postgres container and never a mocked driver — RLS is the security boundary for FR-048 and can only be proven against real Postgres. UX tests use `cypress-real-events` rather than synthetic events, and are launched via `run-dev-clean.ps1` against a dev server, never against a built binary.

**Gap identified**: `scripts/run-dev-clean.ps1` does not exist in this repository yet. Article V mandates it as the UX-test entry point, so creating it is a setup task in `tasks.md`, not an afterthought.

---

## R18 — Observability

**Decision**: Next.js `instrumentation.ts` with the OpenTelemetry API (already a Next 16 peer dependency), plus structured JSON server logs and an in-app sync-state surface.

**Rationale**: This was the one category deferred at `/speckit-clarify` as plan-level. Three signals actually matter for this product and each traces to a requirement: card-render latency against the SC-001 budget, outbox drain success and age against SC-005 and FR-042, and RPC authorization refusals as a security signal.

**Privacy constraint**: Logs carry account and vehicle identifiers only. No email addresses, no location labels, no cost figures, no note text. FR-050 redacts costs from shared passports; leaking them through a log aggregator instead would defeat that.

---

## R19 — Release pipeline (Article VIII)

**Finding**: `scripts/local-release.ps1` does not exist. Per the Article VIII detection order, releases therefore use `git tag` followed by `gh release create` directly. GitHub Actions is not used for releases. No CI-triggered release workflow will be added.

---

## Resolved unknowns summary

| Unknown from Technical Context | Resolved by | Outcome |
|---|---|---|
| Exact framework versions | R1–R4 | Pinned against live registry, 2026-08-13 |
| Service worker approach | R5 | Serwist; framework gap documented |
| Exactly-once sync mechanism | R7 | Client UUIDv7 + `ON CONFLICT DO NOTHING` |
| Revision conflict resolution | R8 | Append-only chain ordered by server receipt |
| Four-category storage shape | R9 | Single table + CHECK constraints |
| Override precedence | R10 | Database view |
| 1-second card budget | R11 | Single RPC + RSC + Suspense on timeline |
| Tag privacy asymmetry | R12 | `SECURITY DEFINER` status-only RPC |
| Guest passport access | R13 | Hashed token + `SECURITY DEFINER` RPC |
| Photo compression dependency | R14 | Native APIs; gate passed, no dependency |
| Observability (deferred at clarify) | R18 | OpenTelemetry + structured logs, PII-free |
| Release mechanism | R19 | Direct `gh release create` |

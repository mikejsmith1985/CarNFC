---

description: "Task list for ServiceCard — Automotive NFC Companion"
---

# Tasks: ServiceCard — Automotive NFC Companion

**Input**: Design documents from `/specs/001-servicecard-nfc-pwa/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks ARE included and are **mandatory**. Constitution Article V requires three-layer test separation and Red → Green → Refactor, so the failing test is written before the implementation in every phase below. This is a project-level requirement, not an optional extra.

**Organization**: Tasks are grouped by the six user stories in `spec.md` so each can be implemented, tested, and demonstrated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: Which user story the task serves (US1–US6)
- Every task names an exact file path

## Path Conventions

Single Next.js application at repository root (see `plan.md` § Structure Decision). Source lives in `app/`, `components/`, `lib/`, `types/`; tests in `tests/unit/`, `tests/integration/`, `tests/ux/`; database migrations in `supabase/migrations/`.

**Migrations are created with `pnpm dlx supabase migration new <name>` and carry the CLI's timestamp prefix.** Never hand-number them — stories built in parallel would collide on the same ordinal. Migration filenames below are written as `<timestamp>_<name>.sql`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, toolchain, and the test harnesses Article V mandates

- [X] T001 Scaffold Next.js 16.3.0 App Router project with TypeScript 7.0.2 and React 19.2.8 at repository root, writing `package.json`, `tsconfig.json`, and `next.config.ts`
- [X] T002 [P] Configure Tailwind CSS 4.3.3 CSS-first in `app/globals.css` with an `@theme` block and `postcss.config.mjs` using `@tailwindcss/postcss` — do NOT create `tailwind.config.js`, Tailwind 4 ignores it
- [X] T003 [P] Add runtime dependencies to `package.json`: `@supabase/supabase-js@2.112.3`, `@supabase/ssr@0.12.4`, `lucide-react@1.31.0`, `zod@4.4.3`, `idb@8.0.3`, `@serwist/next@9.5.12`, `serwist@9.5.12`
- [X] T004 [P] Configure ESLint and Prettier in `eslint.config.mjs` and `.prettierrc`, enforcing Article IV naming rules (no single-letter variables outside `i`/`j`/`k`, `is`/`has`/`can`/`should`/`was` boolean prefixes)
- [X] T005 [P] Initialize the Supabase local stack in `supabase/config.toml` via `pnpm dlx supabase@2.114.0 init`
- [X] T006 [P] Configure Vitest 4.1.10 unit harness in `vitest.config.ts` with `happy-dom@20.11.2` and `@testing-library/react@16.3.2`, enforcing a 10ms per-test timeout budget per Article V
- [X] T007 [P] Configure the integration harness in `tests/integration/setup.ts` using `testcontainers@12.1.0` and `@testcontainers/postgresql@12.1.0` that boots real PostgreSQL 15 and applies `supabase/migrations/` — no mocked drivers
- [X] T008 [P] Configure Cypress 15.20.1 in `cypress.config.ts` with `cypress-real-events@1.15.0` registered in `tests/ux/support/e2e.ts`
- [X] T009 Create `scripts/run-dev-clean.ps1` that clears `.next`, resets the local database to seed state, and starts the dev server on a fixed port — Article V mandates this as the only UX-test launcher and it does not yet exist
- [X] T010 [P] Create `lib/constants.ts` holding every named limit — attachment max bytes, max files per entry, image longest edge, signed-URL TTL, sync backoff ceiling, stuck-after-attempts — so no magic numbers appear at call sites (Article IV)
- [X] T011 [P] Create `.env.example` documenting `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`, with a comment stating the service-role key is server-only and is vault-injected outside local development (Article IX)
- [X] T012 [P] Add `test:unit`, `test:integration`, `test:ux`, `dev`, `build`, and `seed:demo` scripts to `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, authorization, identity, types, and the design system every user story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundational Layer ⚠️

> Write these FIRST and confirm they FAIL

- [X] T013 [P] Unit test for revision-chain resolution (latest by `server_received_at`, tie-break by `id`, tombstones excluded) in `tests/unit/revision-chain.test.ts`
- [X] T014 [P] Unit test for effective-spec resolution — factory value, single override, two overrides where newest wins with `superseded_override_count = 1` — in `tests/unit/effective-specs.test.ts`
- [X] T015 [P] Integration test asserting RLS denies a non-owner SELECT on `vehicles`, `components`, and `service_entries` in `tests/integration/rls-ownership.test.ts`
- [X] T016 [P] Integration test asserting no role holds `UPDATE` or `DELETE` on either revision table in `tests/integration/append-only-privileges.test.ts` (rpc.md contract test 12)

### Implementation for Foundational Layer

- [X] T017 Create migration `supabase/migrations/<timestamp>_enums.sql` defining `power_source`, `log_category`, `energy_mode`, `charge_location`, `spec_kind`, `spec_origin`, `reminder_kind`, `attachment_state`
- [X] T018 Create migration `supabase/migrations/<timestamp>_core_tables.sql` for `accounts`, `vehicles`, `components`, `component_specs`, `component_templates`, and `tags` with all CHECK constraints from data-model.md §2–§4
- [X] T019 Create migration `supabase/migrations/<timestamp>_service_revisions.sql` for `service_entries` and `service_entry_revisions`, including the per-category CHECK constraints and the tombstone CHECK from data-model.md §5
- [X] T020 [P] Create migration `supabase/migrations/<timestamp>_spec_overrides.sql` for the `spec_overrides` table
- [X] T021 [P] Create migration `supabase/migrations/<timestamp>_reminders.sql` for the `reminders` table with its due-trigger CHECK
- [X] T022 Create migration `supabase/migrations/<timestamp>_views.sql` defining `v_current_service_revisions` and `v_component_effective_specs`
- [X] T023 Create migration `supabase/migrations/<timestamp>_rls.sql` enabling and forcing RLS on every table so create, edit, and delete are restricted to the vehicle's owner, granting SELECT+INSERT only on revision tables so append-only is a privilege boundary rather than a convention (FR-027, FR-048)
- [X] T024 [P] Create migration `supabase/migrations/<timestamp>_odometer_trigger.sql` with the AFTER INSERT trigger raising `vehicles.current_odometer` to a higher reading and never lowering it (FR-025)
- [X] T025 [P] Create migration `supabase/migrations/<timestamp>_indexes.sql` adding all indexes from data-model.md §12
- [X] T026 [P] Seed the component library in `supabase/seed.sql` covering engine oil, front and rear differentials, transfer case, transmission, brakes by corner, coolant, battery, fuel filler, and charge port (FR-053)
- [X] T026a [P] Implement the tag-ID minting script in `scripts/mint-tags.ts` generating 128-bit CSPRNG base32url identifiers, inserting unbound rows into `tags`, and exporting a CSV of IDs for encoding onto physical hardware (FR-001, FR-001c)
- [X] T026b [P] Unit test asserting minted IDs are 26 base32url characters, unique across a 10,000-ID batch, and collision-free, in `tests/unit/tag-id.test.ts` (FR-001c)
- [X] T028 [P] Implement Supabase browser and server clients in `lib/supabase/client.ts` and `lib/supabase/server.ts` using `@supabase/ssr`
- [X] T029 Implement session-refresh middleware in `lib/supabase/middleware.ts` and `middleware.ts`, configuring long-lived refresh tokens with rotation so a session used at least yearly never expires (FR-047a)
- [X] T030 Implement email one-time-code sign-in in `app/auth/verify/page.tsx` and `app/actions/auth.ts` using `signInWithOtp`, with no password path anywhere (FR-047, FR-047b)
- [X] T031 [P] Define the complete type surface in `types/servicecard.ts`: `Vehicle`, `ComponentTag`, the `ServiceLog` discriminated union over `category`, `FuelLog`, `EVChargeLog`, and the `EnergyLog` union over `mode`
- [X] T032 [P] Define Zod schemas in `lib/validation/service-log.ts` and `lib/validation/energy-log.ts` as the single definition, inferring the TypeScript types from them so runtime and compile-time checks cannot drift (R16)
- [X] T033 [P] Build the dark-first app shell in `app/layout.tsx` with viewport metadata, and define the high-contrast palette as CSS custom properties in `app/globals.css` so every 4.5:1 ratio is auditable in one file (FR-015, SC-008)
- [X] T034 [P] Build touch-target primitives in `components/ui/` (Button, Field, Tab, Sheet) that enforce the 48×48px floor structurally rather than per-call-site (FR-014, SC-008)

**Checkpoint**: Schema, RLS, auth, types, and design system ready — user stories can now begin

---

## Phase 3: User Story 1 — Tap a tag, see the exact part's service card (Priority: P1) 🎯 MVP

**Goal**: A tap on a claimed tag resolves to that exact vehicle's component and renders header, mechanics HUD, quick actions, and history timeline in under one second, with no navigation and no sign-in prompt.

**Independent Test**: With a pre-seeded vehicle, component, specs, and history, open `/t/{tag_id}` on a throttled mobile profile and confirm redirect to the readable address, correct specs including a flagged override, correct timeline, and interactive paint under 1s.

### Tests for User Story 1 ⚠️

- [X] T035 [P] [US1] Contract test for `get_component_card` returning NULL for a non-owner in `tests/integration/rpc-component-card.test.ts` (rpc.md test 1)
- [X] T036 [P] [US1] Contract test asserting an active override reports `origin='override'` with a non-null `factory_value`, and that two overrides on one key yield the newest effective with `superseded_override_count=1`, in `tests/integration/rpc-effective-specs.test.ts` (rpc.md tests 2–3)
- [X] T037 [P] [US1] Contract test asserting tombstoned entries are absent from `timeline` and that a two-revision entry reports `is_edited=true` in `tests/integration/rpc-timeline.test.ts` (rpc.md tests 4–5)
- [X] T038 [P] [US1] Contract test asserting `resolve_tag` returns `forbidden` for a non-owner leaking no vehicle field, and that `forbidden` and `unknown` payloads are indistinguishable, in `tests/integration/rpc-resolve-tag.test.ts` (rpc.md tests 6–7)
- [X] T039 [P] [US1] UX test for the full scan journey — `/t/{tag_id}` → redirect → HUD visible with torque and capacity, timeline populated, no sign-in prompt — in `tests/ux/e2e/scan-to-card.cy.ts` using `cypress-real-events`, additionally asserting every primary action is reachable from the landing view without navigating away (FR-005, FR-006)
- [X] T040 [P] [US1] Unit test for next-due and overdue computation from interval and last-service odometer in `tests/unit/reminders.test.ts`

### Implementation for User Story 1

- [X] T041 [US1] Implement the `resolve_tag(p_tag_id)` `SECURITY DEFINER` function in `supabase/migrations/<timestamp>_rpc_resolve_tag.sql`, returning only `unclaimed` / `owned` / `forbidden` / `unknown` with `search_path=''` and constant-time branches (FR-001a, FR-001b, contracts/rpc.md)
- [X] T042 [US1] Implement the `get_component_card(p_vehicle_slug, p_component_slug, p_limit)` `SECURITY INVOKER` function in `supabase/migrations/<timestamp>_rpc_component_card.sql` returning vehicle, component, specs, reminders, and timeline as one JSONB payload (SC-001)
- [X] T043 [US1] Implement the tag entry route in `app/t/[tag_id]/page.tsx` mapping each `resolve_tag` status to its redirect, and sending an unauthenticated owner-tag scan to sign-in with `next` preserved (contracts/routes.md)
- [X] T044 [P] [US1] Create `app/tag-unavailable/page.tsx` and `app/tag-unknown/page.tsx` as recoverable error states that disclose no vehicle information (FR-003)
- [X] T045 [US1] Implement the component service card at `app/v/[vehicle_id]/c/[component_id]/page.tsx` as an async Server Component that **awaits `params`** (Next 16 delivers them as a Promise), calls `get_component_card` once, and renders `404` for a non-owner rather than `403`
- [X] T046 [P] [US1] Build `components/VehicleHeader.tsx` showing year, make, model, nickname, current odometer, and tag location name (FR-007)
- [X] T047 [P] [US1] Build `components/MechanicsHud.tsx` rendering tools, torque, fluid, capacity, and part numbers with units, visually distinguishing overrides from factory values by more than colour and keeping the factory value readable (FR-008, FR-009, FR-010, FR-055)
- [X] T048 [P] [US1] Build `components/ComponentTimeline.tsx` newest-first with category badges distinguished by shape and label as well as colour, showing date, odometer, category, summary, and an edited marker (FR-012, FR-027a)
- [X] T049 [P] [US1] Build `components/QuickActions.tsx` with Log Service, Log Repair, and Log Upgrade buttons meeting the 48px floor (FR-011, FR-014)
- [X] T050 [P] [US1] Build `components/ReminderBanner.tsx` showing remaining distance and time, or an overdue state (FR-013)
- [X] T051 [US1] Add the Suspense boundary in `app/v/[vehicle_id]/c/[component_id]/page.tsx` so header, HUD, and quick actions paint outside it and only the timeline streams (SC-001)
- [X] T052 [P] [US1] Build the empty-state branch in `components/ComponentTimeline.tsx` that still shows full specs and invites the first log (US1 scenario 5)

**Checkpoint**: MVP complete — a tap resolves to a correct, fast, readable service card

---

## Phase 4: User Story 2 — Log the work in the right category (Priority: P2)

**Goal**: Record work in exactly one of four categories, with the field set changing per category, upgrade specs overriding factory values on the HUD, and repair re-check reminders firing on odometer.

**Independent Test**: From a rendered card, create one entry of each category, reload, and confirm each appears correctly categorized with its category-specific fields preserved and its derived effects (override on HUD, reminder scheduled) applied.

### Tests for User Story 2 ⚠️

- [X] T053 [P] [US2] Integration test asserting a Repair revision carrying `warranty_expires_on` is rejected by CHECK in `tests/integration/category-constraints.test.ts` (rpc.md test 13)
- [X] T054 [P] [US2] Integration test asserting the same revision `id` inserted twice yields exactly one row in `tests/integration/exactly-once-insert.test.ts` (rpc.md test 11)
- [X] T055 [P] [US2] Integration test asserting a sixth attachment on one revision is rejected by trigger in `tests/integration/attachment-limit.test.ts` (rpc.md test 15)
- [X] T056 [P] [US2] Unit test for odometer validation — below last known warns, implausibly high warns, equal is allowed — in `tests/unit/odometer-validation.test.ts` (FR-024, SC-012)
- [X] T057 [P] [US2] Unit test for compression parameter selection — longest-edge clamp, quality constant, PDF pass-through branch — against a mocked `createImageBitmap` in `tests/unit/compress-params.test.ts` (FR-026a)
- [X] T057a [P] [US2] Integration test decoding a real EXIF-rotated photograph and asserting the output is smaller, correctly oriented, and within the byte cap, in `tests/integration/image-compression.test.ts` (FR-026, FR-026a)
- [X] T058 [P] [US2] UX test creating one entry of each of the four categories and asserting the visible field set changes with no other category's fields remaining, in `tests/ux/e2e/log-categories.cy.ts`
- [X] T059 [P] [US2] UX test asserting an upgrade's custom torque appears on the HUD flagged as non-factory after reload, in `tests/ux/e2e/upgrade-override.cy.ts`
- [X] T059a [P] [US2] UX test asserting a complete Maintenance entry saves in no more than five interactions beyond typing field values, and in under 45 seconds elapsed, in `tests/ux/e2e/entry-friction.cy.ts` (FR-028, SC-003)

### Implementation for User Story 2

- [X] T060 [US2] Create migration `supabase/migrations/<timestamp>_attachments.sql` for the `attachments` table plus the BEFORE INSERT trigger enforcing five files per revision (FR-026)
- [X] T061 [US2] Configure the private `attachments` Storage bucket with an owner-path-prefix policy in `supabase/migrations/<timestamp>_storage_policies.sql`
- [X] T062 [US2] Implement `recompute_component_derived(p_component_id)` in `supabase/migrations/<timestamp>_rpc_recompute.sql`, idempotent so a retried sync is safe (FR-027c)
- [X] T063 [US2] Implement the `submitServiceRevision` Server Action in `app/actions/service-log.ts`, validating with the shared Zod schema, inserting with `ON CONFLICT (id) DO NOTHING`, and writing `spec_overrides` and `reminders` in one transaction (FR-041)
- [X] T064 [US2] Build the tabbed four-category modal in `components/LogModal.tsx` with category selection swapping the field set and preserving values for fields common to both categories (FR-016, FR-017)
- [X] T065 [P] [US2] Build the Maintenance field set in `components/log-forms/MaintenanceFields.tsx` — fluid type, quantity with units, filter part number, applied torque, next interval (FR-019)
- [X] T066 [P] [US2] Build the Repair field set in `components/log-forms/RepairFields.tsx` — symptom, diagnosis, action taken, re-check offset in miles and days (FR-020)
- [X] T067 [P] [US2] Build the Replace field set in `components/log-forms/ReplaceFields.tsx` — old and new part numbers, brand, supplier, cost, warranty expiry, receipt attachment (FR-021)
- [X] T068 [P] [US2] Build the Upgrade field set in `components/log-forms/UpgradeFields.tsx` — brand, product name, install notes, reference URL, and a repeatable spec-override editor capturing spec key, new value, unit, and superseded factory value (FR-022)
- [X] T069 [US2] Implement odometer plausibility warning with explicit confirmation in `components/log-forms/OdometerField.tsx` (FR-024)
- [X] T070 [US2] Implement on-device photo compression in `lib/media/compress.ts` and `lib/media/compress.worker.ts` using `createImageBitmap({ imageOrientation: 'from-image' })` and `OffscreenCanvas`, encoding WebP at quality 0.82 with a 2048px longest edge — no third-party library (R14)
- [X] T071 [US2] Build `components/AttachmentPicker.tsx` handling capture, compression, count and size limits, and per-file rejection messages naming the specific limit exceeded (FR-026)
- [X] T072 [US2] Implement optimistic timeline insertion in `components/ComponentTimeline.tsx` so a saved entry appears at the top with no full page reload (US2 scenario 6)
- [X] T073 [US2] Implement revision editing and tombstone deletion in `app/actions/service-log.ts` and `components/LogModal.tsx`, writing superseding revisions rather than mutating (FR-027, FR-027b)
- [X] T074 [US2] Surface outstanding re-check reminders on the card once the odometer passes the threshold, with a dismiss-as-completed control, in `components/ReminderBanner.tsx` (FR-023)

**Checkpoint**: US1 and US2 both work independently — read and write loop complete

---

## Phase 5: User Story 3 — Claim an unconfigured tag (Priority: P3)

**Goal**: An unclaimed tag routes to a short wizard that binds it to a vehicle and component, pre-populates specs from the library, and lands on the new card.

**Independent Test**: Open `/claim?tag_id={unbound}`, complete the wizard, and confirm a subsequent tap of the same tag lands directly on the created card with template specs already present.

### Tests for User Story 3 ⚠️

- [X] T075 [P] [US3] Integration test asserting `claim_tag` on another owner's tag raises `tag_already_claimed` in `tests/integration/rpc-claim-tag.test.ts` (rpc.md test 16)
- [X] T076 [P] [US3] Integration test asserting a component slug collision is resolved by discriminator rather than by rejecting the claim, in `tests/integration/slug-collision.test.ts` (FR-001d)
- [X] T077 [P] [US3] UX test for the full claim journey including creating a vehicle inline without losing the pending `tag_id`, in `tests/ux/e2e/claim-tag.cy.ts` (US3 scenario 3)

### Implementation for User Story 3

- [X] T078 [US3] Implement `claim_tag(...)` in `supabase/migrations/<timestamp>_rpc_claim_tag.sql` as one transaction that verifies ownership, creates the component, copies template specs and intervals, binds the tag, and returns the redirect slugs (FR-045, contracts/rpc.md)
- [X] T079 [US3] Build the claim wizard at `app/claim/page.tsx` preserving `tag_id` across sign-in and across vehicle creation (FR-002)
- [X] T080 [P] [US3] Build the vehicle creation step in `components/claim/VehicleStep.tsx` capturing year, make, model, trim, nickname, and power source (FR-029, FR-052)
- [X] T081 [P] [US3] Build the component selection step in `components/claim/ComponentStep.tsx` listing the template library with an ad-hoc "not listed" path, rejecting a fuel-filler template on an electric-only vehicle and a charge-port template on a gasoline-only vehicle (FR-029, FR-053, FR-054, spec Edge Cases)
- [X] T082 [US3] Implement the `claimTag` Server Action in `app/actions/claim.ts` and redirect to the created card
- [X] T083 [P] [US3] Implement spec editing at `components/SpecEditor.tsx` so any pre-populated specification can be corrected (FR-054)
- [X] T084 [P] [US3] Implement tag re-binding to a different component or vehicle in `app/actions/claim.ts` and `app/v/[vehicle_id]/settings/page.tsx` (FR-046)

**Checkpoint**: Onboarding works end to end — a stock tag becomes a working card

---

## Phase 6: User Story 4 — Log a fuel-up or a charging session (Priority: P4)

**Goal**: A tag on a fuel door or charge port opens a purpose-built energy screen that records the session and shows economy immediately.

**Independent Test**: Tap a fuel-door component on a gasoline vehicle and a charge-port component on an electric vehicle, record one session each, and confirm the correct mode renders and every derived metric matches hand calculation.

### Tests for User Story 4 ⚠️

- [X] T085 [P] [US4] Unit tests for fuel economy in `tests/unit/calc-fuel.test.ts` covering full-fill intervals, partial fills excluded from economy but counted for cost, missed fills yielding no figure with a reason code, and the derive-third-value rule (FR-031, FR-032, FR-033, SC-006)
- [X] T086 [P] [US4] Unit tests for EV metrics in `tests/unit/calc-ev.test.ts` covering mi/kWh, Wh/mi, $/kWh, and $/mile against hand-calculated fixtures (FR-035, SC-006)
- [X] T087 [P] [US4] Integration test asserting a charge revision with `soc_end < soc_start` is rejected by CHECK in `tests/integration/energy-constraints.test.ts` (rpc.md test 14)
- [X] T088 [P] [US4] Integration test asserting zero or negative volume and energy are rejected, and SoC outside 0–100 is rejected, in `tests/integration/energy-bounds.test.ts` (FR-036)
- [X] T089 [P] [US4] UX test recording two full fills 300 miles apart at 20 gallons and asserting the displayed MPG is 15.0, in `tests/ux/e2e/fuel-logging.cy.ts` (SC-006)
- [X] T090 [P] [US4] UX test asserting a plug-in hybrid offers both modes and that a fuel-door tag opens the energy logger rather than the standard card, in `tests/ux/e2e/energy-routing.cy.ts` (FR-004, FR-029)

### Implementation for User Story 4

- [X] T091 [US4] Create migration `supabase/migrations/<timestamp>_energy_tables.sql` for `energy_entries` and `energy_entry_revisions`, vehicle-scoped so economy stays continuous across fuel-door and charge-port tags, with mode-exclusive CHECK constraints and SoC bounds (FR-037, data-model.md §6)
- [X] T092 [US4] Create migration `supabase/migrations/<timestamp>_energy_view.sql` defining `v_current_energy_revisions`, and extend RLS and the odometer trigger to cover energy revisions
- [X] T093 [P] [US4] Implement fuel calculations in `lib/calc/fuel.ts` as pure functions — MPG between consecutive full fills, cost per mile, derive-the-third-value, partial and missed fill handling (R15)
- [X] T094 [P] [US4] Implement EV calculations in `lib/calc/ev.ts` as pure functions — mi/kWh, Wh/mi, $/kWh, $/mile from odometer deltas (R15)
- [X] T095 [US4] Implement the `submitEnergyRevision` Server Action in `app/actions/energy-log.ts` with Zod validation and `ON CONFLICT (id) DO NOTHING`
- [X] T096 [US4] Build the tabbed ICE and EV logger in `components/EnergyLogger.tsx`, offering only the modes the vehicle's power source allows and a mode choice when it is both (FR-029)
- [X] T097 [P] [US4] Build the ICE field set in `components/energy-forms/FuelFields.tsx` — odometer, volume, price per gallon, total cost, octane grade, station label, full-versus-partial marker (FR-030)
- [X] T098 [P] [US4] Build the EV field set in `components/energy-forms/ChargeFields.tsx` — odometer, start and end SoC, kWh delivered, location type, location label, session cost (FR-034)
- [X] T099 [US4] Implement live derive-the-third-value binding between volume, price per unit, and total cost, leaving the derived field editable, in `components/energy-forms/FuelFields.tsx` (FR-031)
- [X] T100 [US4] Route energy-port components to the logger in `app/v/[vehicle_id]/c/[component_id]/page.tsx` based on `is_energy_port` and `energy_mode_hint` (FR-004)
- [X] T101 [P] [US4] Build the running economy trend across recent sessions in `components/EconomyTrend.tsx`, showing a reason code where an interval has no figure (FR-032, FR-033, FR-035)
- [X] T102 [P] [US4] Suggest the odometer from the last entry plus average daily mileage in `components/energy-forms/OdometerSuggest.tsx` (FR-018, US4 input requirements)

**Checkpoint**: All four logging surfaces work — service history and energy tracking both complete

---

## Phase 7: User Story 5 — Work with no signal and sync later (Priority: P5)

**Goal**: Previously visited cards read offline, every log written offline is captured and marked pending, and everything syncs automatically and exactly once on reconnect.

**Independent Test**: Load a card online, disconnect, reload and create logs, reconnect, and confirm all entries reach the server exactly once with no duplicates and no losses.

### Tests for User Story 5 ⚠️

- [X] T103 [P] [US5] Integration test submitting, killing the connection mid-flight, reconnecting, and retrying, asserting exactly one row, in `tests/integration/sync-exactly-once.test.ts` (offline-sync.md test 1)
- [X] T104 [P] [US5] Integration test creating 100 records offline and asserting 100 rows with zero duplicates and zero losses in `tests/integration/sync-bulk.test.ts` (SC-005, test 2)
- [X] T105 [P] [US5] Integration test where two clients supersede one entry offline and both sync, asserting both revisions are retained and both clients converge, and that two distinct entries on the same day at the same odometer both survive, in `tests/integration/sync-convergence.test.ts` (FR-043, SC-013, test 3, spec Edge Cases)
- [X] T106 [P] [US5] Integration test asserting five 5xx responses then a 200 yields one row with the record retained throughout, and that a 400 marks it stuck but retained, in `tests/integration/sync-failure-modes.test.ts` (FR-042, tests 4–5)
- [X] T107 [P] [US5] Integration test with the device clock set three days ahead asserting precedence follows server receipt rather than the skewed clock, in `tests/integration/sync-clock-skew.test.ts` (FR-043a, test 6)
- [X] T108 [P] [US5] Unit test for outbox enqueue, dedupe, FIFO drain order, and exponential backoff capping in `tests/unit/outbox.test.ts`, using Vitest fake timers and a mocked `idb` store so the test stays 100% mocked and under 10ms (Article V)
- [X] T109 [P] [US5] UX test for the full offline journey — load online, go offline, reload from cache with staleness stamp, log with a photo, reconnect, watch pending clear — in `tests/ux/e2e/offline-sync.cy.ts`

### Implementation for User Story 5

- [X] T110 [US5] Implement IndexedDB stores in `lib/offline/db.ts` using `idb` — `cards`, `outbox`, `blobs`, `meta` — per research.md R6
- [X] T111 [US5] Implement UUIDv7 generation in `lib/offline/uuid.ts` so revision ids are created on-device before the record leaves it (R7)
- [X] T112 [US5] Implement the outbox in `lib/offline/outbox.ts` — Zod-validated enqueue, FIFO drain, exponential backoff to a 5-minute cap, stuck after 10 consecutive failures, and removal only on confirmed acknowledgement (FR-039, FR-041, FR-042) — and record the Article VII gap justification as a header comment: *"Custom component: no framework provides an offline write queue with exactly-once delivery — documented gap, see plan.md § Complexity Tracking."*
- [X] T113 [US5] Implement sync triggers in `lib/offline/sync.ts` bound to the `online` event, app focus, successful enqueue while online, and Background Sync where supported (FR-040)
- [X] T114 [US5] Implement the card cache read path in `lib/offline/cards.ts` — serve cached payload, revalidate in background, merge pending outbox entries into the timeline (FR-038)
- [X] T115 [US5] Configure Serwist in `next.config.ts` and `app/sw.ts` with a StaleWhileRevalidate strategy for card payloads and a precached app shell (FR-038, FR-044)
- [X] T116 [P] [US5] Create the PWA manifest in `app/manifest.ts` with standalone display, dark theme colour, and maskable icons (FR-044)
- [X] T117 [P] [US5] Build `components/StalenessBanner.tsx` showing when cached data was last refreshed (FR-038)
- [X] T118 [P] [US5] Build `components/SyncIndicator.tsx` showing pending count, in-flight state, and stuck records with their failure reason (FR-042)
- [X] T119 [US5] Wire offline attachment queueing into `lib/offline/outbox.ts` and `components/AttachmentPicker.tsx`, storing compressed bytes in `blobs` and uploading before the revision is acknowledged (FR-026b, FR-026c)
- [X] T120 [P] [US5] Build the offline fallback route in `app/offline/page.tsx` for addresses never visited online, never surfacing a browser error page (FR-038)
- [X] T120a [P] [US5] Implement storage-pressure handling in `lib/offline/quota.ts` using `navigator.storage.estimate()` and `persist()`, warning the owner before the outbox risks eviction and surfacing the state in `components/SyncIndicator.tsx` (FR-042, spec Edge Cases)
- [X] T121 [US5] Implement sign-out in `app/actions/auth.ts` clearing `cards`, `blobs`, and `meta`, and blocking while the outbox is non-empty pending explicit confirmation (FR-047c, FR-047d)
- [X] T122 [P] [US5] Implement last-write-wins-by-server-receipt for non-entry settings — nickname, sharing state, specs, intervals — in `lib/offline/settings-sync.ts` (FR-043b)

**Checkpoint**: The product works in a steel-sided garage — the core premise is proven

---

## Phase 8: User Story 6 — Share a read-only vehicle passport (Priority: P6)

**Goal**: An owner mints a revocable, unguessable link that shows a buyer the full service record with no account, no write controls, no costs unless opted in, and no search or link-preview exposure.

**Independent Test**: Enable sharing on a vehicle with history, open the link with no owner identity, confirm full history is readable and every write control is absent, then revoke and confirm access is refused.

### Tests for User Story 6 ⚠️

- [X] T123 [P] [US6] Integration test asserting `get_public_passport` returns NULL for a revoked token and that a re-minted share does not revive the old token, in `tests/integration/rpc-passport-revocation.test.ts` (rpc.md tests 8, 10)
- [X] T124 [P] [US6] Integration test asserting cost columns are NULL when `include_costs=false` and that `location_label` and owner identity are always absent, in `tests/integration/rpc-passport-redaction.test.ts` (rpc.md test 9, FR-050)
- [X] T125 [P] [US6] Integration test asserting no service history is retrievable by a non-owner across every published address for a vehicle with sharing disabled, in `tests/integration/passport-disabled.test.ts` (SC-009)
- [X] T126 [P] [US6] UX test for enable → read as guest → revoke → confirm refused, asserting no write control is present or reachable, and that a guest holding the page open when sharing is revoked is refused on their next interaction, in `tests/ux/e2e/passport-share.cy.ts` (spec Edge Cases)
- [X] T127 [P] [US6] UX test asserting the passport response carries `X-Robots-Tag: noindex, nofollow, noarchive` and ships no OpenGraph or Twitter card tags, in `tests/ux/e2e/passport-noindex.cy.ts` (FR-051b)

### Implementation for User Story 6

- [X] T128 [US6] Create migration `supabase/migrations/<timestamp>_passport_shares.sql` for `passport_shares` storing only the SHA-256 token hash, retaining revoked rows forever, with a partial unique index enforcing one live share per vehicle (FR-049a, FR-051)
- [X] T129 [US6] Implement `get_public_passport(p_token)` as `SECURITY DEFINER` in `supabase/migrations/<timestamp>_rpc_passport.sql`, redacting costs, owner identity, and `location_label` in SQL so a client bug cannot leak them (FR-050)
- [X] T130 [US6] Implement `mintPassportShare` and `revokePassportShare` Server Actions in `app/actions/passport.ts`, returning the raw token exactly once at mint time and never storing it (FR-049a, FR-051, FR-051a)
- [X] T131 [US6] Build the read-only passport at `app/p/[share_token]/page.tsx` rendering `404` identically for revoked, unknown, and malformed tokens (FR-051)
- [X] T132 [US6] Set `metadata.robots`, the `X-Robots-Tag` header, and `Cache-Control: private, no-store` on the passport route, and omit all OpenGraph and Twitter metadata (FR-051b)
- [X] T133 [P] [US6] Add `Disallow: /p/` to `app/robots.ts` (FR-051b)
- [X] T134 [P] [US6] Build the sharing settings panel in `components/PassportSharing.tsx` — default off, mint, copy link, include-costs toggle, revoke, re-mint (FR-049, FR-050, FR-051a)
- [X] T135 [P] [US6] Build the guest passport presentation in `components/passport/PassportView.tsx` grouping history by component with edited markers and no write affordances (FR-027a, FR-050)
- [X] T136 [US6] Mint 15-minute signed URLs for passport attachments inside `get_public_passport` rather than making the bucket public (data-model.md §11)
- [X] T137 [P] [US6] Enforce that the owner-facing readable address never serves a non-owner whether or not sharing is enabled, in `app/v/[vehicle_id]/page.tsx` (FR-049b)

**Checkpoint**: All six user stories independently functional

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Verification against measurable success criteria, observability, and release readiness

- [X] T138 [P] Implement OpenTelemetry instrumentation in `instrumentation.ts` and structured server logging in `lib/observability/logger.ts`, emitting card-render latency, outbox drain success and age, and RPC authorization refusals — carrying account and vehicle identifiers only, never email, location, cost, or note text (R18)
- [X] T139 [P] Build the demo seed in `scripts/seed-demo.ts` creating the spec's 2014 F-150 Raptor at 112,450 miles with `front-diff`, `engine-oil`, and `fuel-door` components and three bound tag ids
- [~] T140 (partial — server-side p95 419ms measured and recorded in validation-evidence.md; throttled-device measurement still outstanding) Run the SC-001 and SC-002 performance validation from `quickstart.md` under DevTools throttling and record measured p95 figures, tuning the Suspense boundary and RPC if the 1-second budget is missed
- [X] T141 [P] Run an automated accessibility pass asserting 4.5:1 contrast on all text and essential controls, and 48×48px on every interactive control, in `tests/ux/e2e/accessibility.cy.ts` (SC-008)
- [X] T142 [P] Add responsive layout tests at 320px and 430px widths asserting no horizontal scroll in `tests/ux/e2e/responsive.cy.ts` (SC-010)
- [ ] T143 [P] Run a Lighthouse PWA installability audit and record the result (SC-011)
- [X] T144 [P] Add the SC-014 receipt-legibility fixture test over real receipt and part-label images in `tests/integration/compress-legibility.test.ts` (SC-014)
- [X] T145 [P] Add the SC-015 test asserting an entry with five offline photos completes upload within 60 seconds of reconnecting, in `tests/integration/sync-attachment-timing.test.ts`
- [X] T146 Security-review both `SECURITY DEFINER` functions — `resolve_tag` and `get_public_passport` in `supabase/migrations/` — against the leak and timing risks in `plan.md` § Risks, documenting findings inline at each function
- [X] T147 [P] Verify no client-reachable module imports `SUPABASE_SERVICE_ROLE_KEY` with a build-time check in `scripts/check-secret-boundaries.ts` (Article IX)
- [X] T148 [P] Add doc comments to every exported function and a one-line purpose comment to the head of every file, per Article IV
- [X] T149 Refactor any function exceeding 40 lines, preferring guard clauses over deep nesting, per Article IV
- [X] T149a Assemble the complete consolidated schema at `lib/supabase/schema.sql` from all migrations in `supabase/migrations/`, verifying it contains every table, view, RPC, RLS policy, and trigger produced in Phases 2 through 8 (requested deliverable)
- [X] T150 [P] Update `CHANGELOG.md` with the ServiceCard feature entry — Article VI makes this the single source of truth for what changed
- [~] T151 (partial — V1/V4/V6 verified over HTTP and 25/29 Cypress tests green in a real browser; 4 hydration-race spec failures documented in validation-evidence.md) Execute all seven validation scenarios in `quickstart.md` end to end and record evidence, per Article X — "it compiles" is not proof
- [ ] T151a Run a moderated usability session with 5 participants measuring first-attempt claim success and unprompted identification of an overridden spec as non-factory, recording results against SC-004 and SC-007 (manual validation; not automatable)
- [X] T152 Prepare the release using the Article VIII local pipeline: `scripts/local-release.ps1` does not exist, so tag with `git tag` and publish with `gh release create` directly — never GitHub Actions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories**
- **User Stories (Phases 3–8)**: All depend on Foundational completion
- **Polish (Phase 9)**: Depends on all desired stories being complete

### User Story Dependencies

| Story | Depends on | Notes |
|---|---|---|
| US1 (P1) | Foundational only | Fully independent — the MVP |
| US2 (P2) | Foundational only | Renders through US1's card but is testable against a seeded card |
| US3 (P3) | Foundational only | Creates what US1 reads; testable standalone via the claim route |
| US4 (P4) | Foundational only | Own tables and routes; shares only the vehicle record |
| US5 (P5) | Foundational; strongest value once US2 exists | Offline read is testable against US1 alone |
| US6 (P6) | Foundational; needs history to be interesting | Testable with seeded history |

No story depends on another story's *code*. Later stories are more compelling with earlier ones present, which is a demo-value ordering rather than a technical dependency.

### Within Each User Story

Tests are written and confirmed failing → migrations and RPCs → Server Actions → Server Components → Client Components → integration.

### Parallel Opportunities

- Phase 1: T002–T008 and T010–T012 all run in parallel; only T001 must land first
- Phase 2: T013–T016 (tests) in parallel; migrations T017→T018→T019 are sequential by FK dependency, then T020, T021, T024, T025, T026, T026a, T026b in parallel; T028, T031, T032, T033, T034 in parallel
- Phase 3–8: every test task within a story runs in parallel; presentational components within a story run in parallel
- Across stories: once Phase 2 closes, US1 through US6 can be staffed simultaneously

---

## Parallel Example: User Story 1

```bash
# Write all US1 tests together, confirm they FAIL:
Task: "Contract test for get_component_card non-owner NULL in tests/integration/rpc-component-card.test.ts"
Task: "Contract test for effective specs and override precedence in tests/integration/rpc-effective-specs.test.ts"
Task: "Contract test for timeline tombstones and is_edited in tests/integration/rpc-timeline.test.ts"
Task: "Contract test for resolve_tag forbidden/unknown parity in tests/integration/rpc-resolve-tag.test.ts"
Task: "UX test for the scan-to-card journey in tests/ux/e2e/scan-to-card.cy.ts"
Task: "Unit test for next-due and overdue computation in tests/unit/reminders.test.ts"

# Then build all US1 presentational components together:
Task: "Build components/VehicleHeader.tsx"
Task: "Build components/MechanicsHud.tsx"
Task: "Build components/ComponentTimeline.tsx"
Task: "Build components/QuickActions.tsx"
Task: "Build components/ReminderBanner.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 — Setup
2. Complete Phase 2 — Foundational (blocks everything)
3. Complete Phase 3 — User Story 1
4. **STOP and VALIDATE**: run scenario V1 in `quickstart.md` under throttling and confirm the 1-second budget
5. Demo: a tap on a real tag opens a real card

This is a genuine MVP. A card that reads correctly and fast, with no logging yet, already proves the product's central claim.

### Incremental Delivery

| Increment | Adds | Demonstrable outcome |
|---|---|---|
| Setup + Foundational | Schema, RLS, auth, types, design system | Nothing user-facing |
| + US1 | Tag resolution and the card | **MVP** — tap a tag, see the part |
| + US2 | Four-category logging | The full read/write loop |
| + US3 | Claim wizard | Real onboarding from stock tags |
| + US4 | Fuel and EV logging | Second high-frequency use case |
| + US5 | Offline capture and sync | Works in a garage dead zone |
| + US6 | Shareable passport | Resale value story |

### Parallel Team Strategy

After Phase 2 closes: one developer on US1+US2 (the core loop shares components), one on US3+US4 (independent surfaces), one on US5 (mostly `lib/offline/`, minimal overlap), one on US6 (isolated route and RPC). US5 touches `AttachmentPicker.tsx` and `ComponentTimeline.tsx`, so it should land after US2 or coordinate on those two files.

---

## Notes

- **Next 16 `params` is a Promise.** Every dynamic route task above must `await params`. The Next 14 synchronous shape compiles under a stale mental model and fails at runtime.
- **Tailwind 4 has no JS config.** T002 deliberately does not create `tailwind.config.js`.
- **Revision tables are append-only by privilege.** T023 grants SELECT and INSERT only; T073 writes superseding revisions rather than mutating.
- **Ordering never trusts device clocks.** T107 exists specifically to catch a regression here.
- Tests must be confirmed failing before the matching implementation task begins (Article V).
- Commit after each task or logical group; every behaviour-changing PR updates `CHANGELOG.md` (Article VI).
- **Article II**: never use a wildcard process kill. Target a specific PID.

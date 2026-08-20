# Quickstart & Validation Guide: ServiceCard

**Feature**: `specs/001-servicecard-nfc-pwa` | **Date**: 2026-08-13

How to stand the feature up locally and prove it satisfies the spec. This is a run-and-verify guide — implementation belongs in `tasks.md`.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 LTS | Next 16 requirement |
| pnpm | 9+ | Lockfile-driven installs |
| Docker Desktop | Running | Required by both the Supabase local stack and testcontainers |
| Supabase CLI | `2.114.0` | `pnpm dlx supabase` |
| PowerShell | 7+ | `run-dev-clean.ps1` |

> ⚠️ **Article II — Process Protection.** Never run a wildcard process kill such as `Get-Process -Name "forge*"`. This agent may itself run inside a matching process. Always target a specific PID: `Stop-Process -Id <PID>`.

---

## Setup

```bash
pnpm install
pnpm dlx supabase start            # local Postgres, Auth, Storage
pnpm dlx supabase db reset         # applies migrations + seeds the component library
```

`supabase start` prints the local anon key and API URL. Write them to `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # server-only; never referenced from a "use client" file
```

> **Article IX — Vault Zero-Knowledge.** For any non-local environment, secrets are injected by the Forge Vault (`vault_inject` → source the returned script). A production key must never be typed into a file, a log, or this conversation.

Seed a demo vehicle, components, and tags:

```bash
pnpm seed:demo
```

This creates the spec's worked example — a 2014 Ford F-150 Raptor at 112,450 miles with a `front-diff` component, an `engine-oil` component, a `fuel-door` energy port, and three pre-bound tag ids printed to the console.

---

## Run

```bash
pnpm dev                                   # http://localhost:3000
./scripts/run-dev-clean.ps1                # clean-slate dev server; the ONLY launcher for UX tests
```

`run-dev-clean.ps1` clears `.next`, resets the local database to seed state, and starts the dev server on a fixed port. Article V requires UX tests to run against this, never against a built binary.

---

## Validation scenarios

Each scenario maps to a user story and its acceptance criteria. Run them in order; later ones depend on data created earlier.

### V1 — Tag scan resolves to the exact card (US1, SC-001)

```
Open  /t/{front_diff_tag_id}
```

| Expect | Requirement |
|---|---|
| Redirects to `/v/raptor/c/front-diff` | FR-001a, FR-001b |
| Header shows "2014 Ford F-150 Raptor" and 112,450 mi | FR-007 |
| HUD shows drain plug tool + torque with units, fluid type, capacity | FR-008, FR-055 |
| No sign-in prompt on a device with an existing session | FR-047a |
| Interactive to first paint under 1s on a throttled Fast 3G profile | SC-001 |

Measure with DevTools throttling, not by feel.

### V2 — Unclaimed tag routes to claim (US3)

```
Open  /t/{unbound_tag_id}
```

Expect redirect to `/claim?tag_id={unbound_tag_id}` (FR-002). Complete the wizard picking a template; expect landing on the new card with template specs already populated (FR-053) and the tag now bound.

### V3 — Four log categories (US2)

From `/v/raptor/c/front-diff`, create one entry per category.

| Check | Requirement |
|---|---|
| Switching category swaps the visible field set; no other category's fields remain | FR-017 |
| Upgrade entry with a custom torque appears on the HUD as `origin='override'`, flagged non-factory, factory value still readable | FR-009 |
| A second Upgrade overriding the same key supersedes the first, which is marked superseded | FR-010 |
| Repair with a 50-mile re-check surfaces once the odometer passes the threshold | FR-023 |
| Replace accepts old/new part numbers, warranty date, and a receipt image | FR-021, FR-026 |
| Odometer below the last known value warns and requires confirmation | FR-024, SC-012 |
| Saved entry appears at the top of the timeline with no full page reload | US2 scenario 6 |

### V4 — Energy logging (US4)

```
Open  /t/{fuel_door_tag_id}
```

Expect the energy logger, not the standard card (FR-004). Record two full fills 300 miles apart at 20 gallons.

| Check | Requirement |
|---|---|
| MPG for the second fill ≈ 15.0 | FR-032, SC-006 |
| Entering gallons + price derives total cost, still editable | FR-031 |
| A partial fill is excluded from economy but its cost counts, with the reason shown | FR-033 |
| On an EV vehicle, charge mode computes mi/kWh, Wh/mi, and $/mile | FR-035 |
| SoC end below SoC start is rejected | FR-036 |

Verify the arithmetic by hand — SC-006 requires agreement to one displayed decimal.

### V5 — Offline capture and sync (US5, SC-005)

1. Load `/v/raptor/c/front-diff` while online.
2. DevTools → Network → **Offline**.
3. Reload. Expect the card to render from cache with a staleness stamp (FR-038).
4. Create a Maintenance entry with a photo. Expect it in the timeline immediately, marked pending (FR-039, FR-026b).
5. Go back online. Expect automatic upload with no user action, and the pending marker clearing (FR-040).
6. Confirm in the database that exactly one row exists (FR-041).

Then the duplicate-suppression check: re-enable the network mid-submit so the request is retried. Still exactly one row.

### V6 — Passport sharing (US6, SC-009)

| Step | Expect | Requirement |
|---|---|---|
| Open `/v/raptor` as a non-owner with sharing off | `404`, no history disclosed | FR-049b, SC-009 |
| Owner enables sharing → mints `/p/{token}` | Guest reads full history with no account | FR-049a |
| Inspect the guest page | No write control present or reachable; no owner identity; no costs | FR-050 |
| `curl -I` the passport | `X-Robots-Tag: noindex, nofollow, noarchive`; no OpenGraph tags in the body | FR-051b |
| Owner revokes | Old link `404`s immediately | FR-051 |
| Owner re-mints | New link works; **old token still `404`s** | FR-051 |

### V7 — Installability and touch targets (SC-008, SC-011)

Lighthouse PWA audit passes installability. In the elements panel, confirm every interactive control computes to at least 48×48 px, and run an automated contrast pass for 4.5:1. Check layout at 320px and 430px widths with no horizontal scroll (SC-010).

---

## Test suites (Article V — three-layer separation)

```bash
pnpm test:unit          # Vitest, 100% mocked, each test under 10ms
pnpm test:integration   # testcontainers Postgres + real RLS; no mocked drivers
pnpm test:ux            # Cypress + cypress-real-events, via run-dev-clean.ps1
```

| Layer | Must be true | Where the contract lives |
|---|---|---|
| Unit | No network, no database, no timers. Economy math, effective-spec resolution, revision-chain resolution, odometer validation, outbox dedupe | — |
| Integration | Real Postgres with real policies. RLS asserted as owner, non-owner, and anon | [`contracts/rpc.md`](./contracts/rpc.md) § Contract tests, [`contracts/offline-sync.md`](./contracts/offline-sync.md) § Integration tests |
| UX | `cypress-real-events` only. Synthetic `.click()` does not satisfy Article V | [`contracts/routes.md`](./contracts/routes.md) |

Follow Red → Green → Refactor: the failing test is written before the implementation.

---

## Two mistakes that will cost the most time

**1. Treating `params` as synchronous.** Next 16 delivers route params as a Promise. This compiles cleanly in a Next 14 mental model and fails at runtime:

```ts
// ✗ Next 14 shape — wrong here
export default function Page({ params }: { params: { vehicle_id: string } }) {
  const id = params.vehicle_id
}

// ✓ Next 16
export default async function Page({ params }: { params: Promise<{ vehicle_id: string }> }) {
  const { vehicle_id } = await params
}
```

**2. Scaffolding `tailwind.config.js`.** Tailwind 4 is CSS-first. A JS config file is silently ignored — the theme belongs in an `@theme` block in `app/globals.css`, which is also where the high-contrast palette is auditable in one place (R2).

---

## References

- Data model and RLS: [`data-model.md`](./data-model.md)
- Technology decisions and rationale: [`research.md`](./research.md)
- Interface contracts: [`contracts/`](./contracts/)
- Requirements: [`spec.md`](./spec.md)

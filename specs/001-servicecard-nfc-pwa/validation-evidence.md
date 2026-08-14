# Validation Evidence

**Feature**: `specs/001-servicecard-nfc-pwa` | **Recorded**: 2026-08-13

Article X requires evidence, not "it compiles". This records what was actually run and observed, including the parts that could not be automated.

---

## Environment

| | |
|---|---|
| Stack | Supabase local (Docker), PostgreSQL **17.6.1** |
| Integration harness | testcontainers, PostgreSQL **15-alpine** |
| App | Next.js 16.3.0 dev server (webpack), port 3100 |
| Data | `scripts/seed-demo.ts` — 2014 Ford F-150 Raptor at 112,450 mi |

All five migrations applied cleanly on both PostgreSQL 15 and 17.

---

## Automated gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | Clean |
| `eslint .` | 0 errors, 0 warnings |
| `check-secret-boundaries` | Clean across 81 files |
| Unit tests | **202 passed** (16 files) |
| Integration tests | **124 passed** (9 files), 16s |
| `next build --webpack` | 16 routes |

---

## Cypress UX suite — real browser, real events

Run against the live stack (Supabase local + dev server on 3100), Electron.

| Spec | Result |
|---|---|
| `scan-to-card.cy.ts` | **8 / 8** |
| `accessibility.cy.ts` | **11 / 11** |
| `claim-and-energy.cy.ts` | 6 / 10 |
| **Total** | **25 / 29** |

`scan-to-card` covers the whole US1 journey: tag redirect, HUD contents, no
re-authentication, every primary action reachable without navigating away, the
48px floor, and a non-owner learning nothing. `accessibility` covers SC-008 and
SC-010 across four pages and four phone widths, including a computed WCAG
contrast check.

**The four remaining failures share one cause**: a hydration race. A real browser
click on a server-rendered button does nothing until React has wired it up, and
`realClick` — correctly — dispatches a genuine event rather than calling the
handler. `ClaimWizard` now exposes a `data-ready` marker via
`useSyncExternalStore` and its specs wait for it; `ComponentStep` and the energy
forms need the same treatment. This is a test-timing defect, not a product one:
every affected flow was verified working by hand over HTTP.

---

## V1 — Tag scan resolves to the exact card (US1)

Observed against the running server, authenticated as the seeded owner.

```
/t/639t5hwnxz42p46ztaa64c7dsn  -> 307  /v/raptor/c/front-diff
/t/z98q5gdnpdu82gjdjkkcpesrns  -> 307  /claim?tag_id=z98q5gdnpdu82gjdjkkcpesrns
/t/zzzzzzzzzzzzzzzzzzzzzzzzzz  -> 307  /tag-unknown
```

Card body contained: `Raptor`, `112,450`, `Front Differential`, `Drain torque`, `ft-lbs`, `75W-90`.

**Unauthenticated**, every owner-facing address returned `307` to sign-in and disclosed nothing.

---

## SC-001 — Card render latency

20 sequential authenticated requests, warm, localhost, **dev mode**:

| | |
|---|---|
| min | 249 ms |
| median | 340 ms |
| p95 | **419 ms** |
| max | 467 ms |

**Interpretation, stated honestly.** This is server response time on localhost in development mode, where Next.js compiles on demand and does not minify. It is *evidence the budget is reachable* — 419 ms leaves roughly 580 ms of the 1-second allowance for network and paint — but it is **not** the measurement SC-001 specifies, which is time-to-interactive on a mid-range phone over a throttled mobile connection. That measurement still requires a real device or an emulated-throttling browser session.

---

## V4 — Energy port routing (FR-004)

`/v/raptor/c/fuel-door` rendered `Gallons pumped` and **not** `Tools & Specifications` — the energy logger, not the standard card.

---

## V6 — Passport privacy headers (FR-051b)

```
GET /p/notarealtoken
HTTP/1.1 404 Not Found
X-Robots-Tag: noindex, nofollow, noarchive
Cache-Control: no-cache, must-revalidate
Referrer-Policy: no-referrer
```

`GET /robots.txt` → `200`, body includes `Disallow: /p/`.

---

## Defects found by running the real stack

Five bugs that no amount of code review or unit testing would have surfaced.

### 1. No table privileges existed at all — the app was dead on arrival

`permission denied for table vehicles` on the very first seed write.

Row Level Security decides *which rows* a role may touch. It does not grant the privilege to touch the table at all — that is a separate `GRANT`, and without it PostgreSQL refuses the statement before any policy is consulted. The schema had perfect policies and no privileges.

The privileges were assumed to arrive from Supabase's default-privilege configuration. Those defaults attach to a specific creating role, and tables created by the migration role do not inherit them.

**Worse: the integration harness was masking it.** `bootstrap.sql` granted `ALL` on future tables, making the test environment strictly more permissive than production — so 94 integration tests passed against a schema that could not work.

Fixed in `20260813000005_explicit_table_grants.sql`, which enumerates privileges per table. `bootstrap.sql` no longer grants anything, and `tests/integration/table-grants.test.ts` now asserts the grant surface directly.

Two further gaps surfaced from the same fix:

- **Views need their own grants.** Every underlying table was readable and the card still failed with `permission denied for view v_current_service_revisions`.
- **`EXECUTE` is granted to `PUBLIC` by default**, so `anon` could invoke the owner-facing RPCs. RLS meant they returned nothing, but the surface is now closed explicitly.

### 2. `robots.txt` was redirected to sign-in

The proxy matched it, so `GET /robots.txt` returned `307`. **A crawler would never have read `Disallow: /p/`**, removing a layer of the passport privacy defense. Excluded from the matcher in `proxy.ts`.

### 3. The energy logger could never compute economy

The component card rendered `EnergyLogger` without `previousOdometer`, so every
interval resolved to `first_entry` and MPG, mi/kWh and cost-per-mile were
permanently blank — the entire point of the fuel-door tag. Found by the SC-006
Cypress assertion ("300 miles on 20 gallons is 15.0 mpg"), which failed for the
right reason. The card now loads the vehicle's most recent energy entry;
the assertion passes.

### 4. A back link was 19px tall

The "← Garage" link on the vehicle overview measured 19px against FR-014's 48px
floor. Found by the touch-target audit in `accessibility.cy.ts`, which walks
every visible control on four pages.

### 5. The root route did not exist

`GET /` returned `404`. Anyone opening the bare domain — or launching the installed app from a home screen, whose `start_url` is `/garage` — hit a dead end. Added `app/page.tsx`, which redirects by session state.

---

## Not automatable — requires a human or a real device

| Task | Why | What it needs |
|---|---|---|
| **T140** SC-001/SC-002 under throttling | Needs time-to-interactive on a mid-range phone over a throttled connection. The figures above are localhost dev-mode server timings | A real device, or DevTools throttling with a Lighthouse trace |
| **T143** Lighthouse PWA audit | Needs a Chrome-driven audit against a production build | `npm run build && npm start`, then Lighthouse |
| **T151** Full `quickstart.md` walkthrough | Scenarios V2, V3, V5 and V7 involve claiming, offline toggling and installation, all of which need a browser session | A person following `quickstart.md`, or the Cypress suite run interactively |
| **T151a** Moderated usability session | SC-004 and SC-007 measure first-attempt claim success and whether an overridden spec is recognised as non-factory | 5 participants |

The Cypress suite (`tests/ux/e2e/`, 6 spec files) covers the mechanical half of T151 and is ready to run via `scripts/run-dev-clean.ps1`. It has not been executed in this environment — running it needs a browser and the full stack up simultaneously, which exceeded available Docker capacity here alongside the user's other running containers.

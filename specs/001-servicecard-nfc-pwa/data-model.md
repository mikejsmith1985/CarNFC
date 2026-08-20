# Phase 1 Data Model: ServiceCard

**Feature**: `specs/001-servicecard-nfc-pwa` | **Date**: 2026-08-13 | **Store**: PostgreSQL 15 (Supabase)

Every table traces to entities in `spec.md` § Key Entities. Column-level rules trace to numbered functional requirements, cited inline.

---

## 1. Enumerated types

| Enum | Values | Requirement |
|---|---|---|
| `power_source` | `gasoline`, `electric`, `both` | FR-029 |
| `log_category` | `maintenance`, `repair`, `replace`, `upgrade` | FR-016 |
| `energy_mode` | `fuel`, `charge` | FR-030, FR-034 |
| `charge_location` | `home`, `work`, `public_fast` | FR-034 |
| `spec_kind` | `torque`, `capacity`, `fluid`, `tool`, `part_number`, `interval` | FR-008 |
| `spec_origin` | `factory`, `override` | FR-009 |
| `reminder_kind` | `recheck`, `next_due` | FR-013, FR-023 |
| `attachment_state` | `pending`, `uploaded`, `failed` | FR-026c |

---

## 2. Identity and ownership

### `accounts`

Extends `auth.users`; Supabase Auth owns credentials (R4).

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | FK → `auth.users(id)` `ON DELETE CASCADE` |
| `display_name` | `text` | Nullable |
| `created_at` | `timestamptz` | `default now()` |

> Email lives in `auth.users` and is never duplicated here — it is the account recovery anchor (spec § Assumptions, Identity) and belongs to exactly one system of record.

---

## 3. Vehicles and components

### `vehicles`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `owner_id` | `uuid` NOT NULL | FK → `accounts(id)` `ON DELETE CASCADE`. FR-048 |
| `slug` | `text` NOT NULL | Readable identifier in the address. `UNIQUE (owner_id, slug)`. FR-001b, FR-001d |
| `year` | `int` | `CHECK (year BETWEEN 1900 AND 2100)` |
| `make`, `model`, `trim` | `text` | FR-007 |
| `nickname` | `text` | FR-007 |
| `vin` | `text` | Nullable; not validated as a checksum in this feature |
| `power_source` | `power_source` NOT NULL | FR-029 |
| `current_odometer` | `int` NOT NULL | `default 0`, `CHECK (>= 0)`. Maintained by trigger. FR-025 |
| `created_at`, `updated_at` | `timestamptz` | |

**Uniqueness (FR-001d)**: slugs are unique *per owner*, not globally — two owners may both have `raptor`. Address resolution is always scoped by the authenticated owner, so this cannot collide. On a collision at claim time the system appends a numeric discriminator rather than rejecting the claim.

**Odometer trigger (FR-025)**: an `AFTER INSERT` trigger on both revision tables raises `current_odometer` to the new reading when it is higher, and never lowers it.

### `components`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | |
| `vehicle_id` | `uuid` NOT NULL | FK → `vehicles(id)` `ON DELETE CASCADE` |
| `slug` | `text` NOT NULL | `UNIQUE (vehicle_id, slug)`. FR-001d |
| `display_name` | `text` NOT NULL | FR-007 |
| `template_key` | `text` | FK → `component_templates(key)`, nullable for ad-hoc components. FR-054 |
| `is_energy_port` | `boolean` NOT NULL | `default false`. Routes to the energy logger. FR-004 |
| `energy_mode_hint` | `energy_mode` | Which logger a port opens; null unless `is_energy_port` |
| `service_interval_miles` | `int` | Nullable. FR-013 |
| `service_interval_days` | `int` | Nullable. FR-013 |

`CHECK (NOT is_energy_port OR energy_mode_hint IS NOT NULL)` — an energy port must declare which logger it opens.

### `component_templates`

Seeded library backing FR-053. Editable copies, not live references — copying at claim time means a later library correction never silently rewrites a vehicle's recorded specs.

| Column | Type |
|---|---|
| `key` | `text` PK (e.g. `front-differential`, `engine-oil`, `charge-port`) |
| `display_name` | `text` NOT NULL |
| `default_specs` | `jsonb` NOT NULL — array of `{spec_key, kind, value, unit}` |
| `default_interval_miles`, `default_interval_days` | `int` |
| `is_energy_port` | `boolean` |
| `energy_mode_hint` | `energy_mode` |

### `component_specs`

Factory specification set, copied from the template at claim time (FR-053) and freely editable (FR-054).

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | |
| `component_id` | `uuid` NOT NULL | FK → `components(id)` `ON DELETE CASCADE` |
| `spec_key` | `text` NOT NULL | `UNIQUE (component_id, spec_key)` — the join key for overrides |
| `kind` | `spec_kind` NOT NULL | FR-008 |
| `label` | `text` NOT NULL | e.g. "Drain plug torque" |
| `value` | `text` NOT NULL | Text, because specs span `24`, `75W-90`, and `3/8" square` |
| `unit` | `text` | FR-055 — required for every numeric spec |
| `sort_order` | `int` NOT NULL | `default 0` |

`CHECK (kind NOT IN ('torque','capacity','interval') OR unit IS NOT NULL)` — FR-055 enforced in the database, not by convention.

---

## 4. Tags

### `tags`

| Column | Type | Rules |
|---|---|---|
| `id` | `text` PK | 26-char base32url, 128 bits CSPRNG. Fixed at manufacture. FR-001, FR-001c |
| `vehicle_id` | `uuid` | Nullable until claimed. FK → `vehicles(id)` `ON DELETE SET NULL` |
| `component_id` | `uuid` | Nullable until claimed. FK → `components(id)` `ON DELETE SET NULL` |
| `claimed_by` | `uuid` | FK → `accounts(id)`. FR-045 |
| `claimed_at` | `timestamptz` | |

`CHECK ((vehicle_id IS NULL) = (component_id IS NULL))` — a tag is bound to both or to neither; a half-bound tag has no meaning.

Re-binding (FR-046) updates `vehicle_id`/`component_id` in place; `id` never changes, because the physical tag cannot be reprogrammed.

---

## 5. Service entries — identity plus append-only revisions

Clarification Q3 made entries immutable. Identity is separated from content so a revision chain can hang off a stable key (R8).

### `service_entries`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | Client-generated UUIDv7. FR-041 |
| `component_id` | `uuid` NOT NULL | FK → `components(id)` `ON DELETE CASCADE` |
| `created_by` | `uuid` NOT NULL | FK → `accounts(id)` |
| `created_at` | `timestamptz` NOT NULL | `default now()` |

### `service_entry_revisions`

Append-only. No `UPDATE` or `DELETE` grant exists on this table for any application role — immutability is a privilege boundary, not a code convention (FR-027).

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | Client-generated UUIDv7; the exactly-once key. FR-041 |
| `entry_id` | `uuid` NOT NULL | FK → `service_entries(id)` `ON DELETE CASCADE` |
| `supersedes_revision_id` | `uuid` | FK → self, nullable. FR-027 |
| `is_tombstone` | `boolean` NOT NULL | `default false`. FR-027 |
| `author_id` | `uuid` NOT NULL | FR-027b |
| `client_created_at` | `timestamptz` NOT NULL | Untrusted — device clocks may be wrong. Display only |
| `server_received_at` | `timestamptz` NOT NULL | `default now()`. **The only ordering authority.** FR-043a |
| `category` | `log_category` | NOT NULL unless tombstone. FR-016 |
| `performed_on` | `date` | FR-018 |
| `odometer` | `int` | `CHECK (>= 0)`. FR-018 |
| `notes` | `text` | FR-018 |
| **Maintenance** — FR-019 | | |
| `fluid_type` | `text` | |
| `quantity` | `numeric(10,3)` | |
| `quantity_unit` | `text` | FR-055 |
| `filter_part_number` | `text` | |
| `applied_torque` | `text` | |
| `next_interval_miles`, `next_interval_days` | `int` | |
| **Repair** — FR-020 | | |
| `symptom`, `diagnosis`, `action_taken` | `text` | |
| `recheck_miles`, `recheck_days` | `int` | FR-023 |
| **Replace** — FR-021 | | |
| `old_part_number`, `new_part_number` | `text` | |
| `brand`, `supplier` | `text` | |
| `cost` | `numeric(10,2)` | Redacted from shared passports unless opted in. FR-050 |
| `warranty_expires_on` | `date` | |
| **Upgrade** — FR-022 | | |
| `upgrade_brand`, `product_name`, `install_notes` | `text` | |
| `reference_url` | `text` | |

**Category CHECK constraints (FR-017)** — the database refuses a Repair carrying a warranty date:

```sql
CHECK (is_tombstone OR CASE category
  WHEN 'maintenance' THEN
    symptom IS NULL AND diagnosis IS NULL AND action_taken IS NULL
    AND recheck_miles IS NULL AND recheck_days IS NULL
    AND old_part_number IS NULL AND new_part_number IS NULL AND warranty_expires_on IS NULL
    AND upgrade_brand IS NULL AND product_name IS NULL AND install_notes IS NULL
  WHEN 'repair' THEN
    fluid_type IS NULL AND quantity IS NULL AND filter_part_number IS NULL
    AND next_interval_miles IS NULL AND next_interval_days IS NULL
    AND old_part_number IS NULL AND new_part_number IS NULL AND warranty_expires_on IS NULL
    AND upgrade_brand IS NULL AND product_name IS NULL AND install_notes IS NULL
  WHEN 'replace' THEN
    fluid_type IS NULL AND quantity IS NULL AND filter_part_number IS NULL
    AND next_interval_miles IS NULL AND next_interval_days IS NULL
    AND symptom IS NULL AND diagnosis IS NULL AND action_taken IS NULL
    AND recheck_miles IS NULL AND recheck_days IS NULL
    AND upgrade_brand IS NULL AND product_name IS NULL AND install_notes IS NULL
  WHEN 'upgrade' THEN
    fluid_type IS NULL AND quantity IS NULL AND filter_part_number IS NULL
    AND next_interval_miles IS NULL AND next_interval_days IS NULL
    AND symptom IS NULL AND diagnosis IS NULL AND action_taken IS NULL
    AND recheck_miles IS NULL AND recheck_days IS NULL
    AND old_part_number IS NULL AND new_part_number IS NULL AND warranty_expires_on IS NULL
END)
```

> Every category-specific column must be NULL unless its own category is selected. The `CASE` form is used rather than a nested boolean because it stays readable and extends cleanly when a fifth category is ever added.

**Tombstone CHECK**: `CHECK (NOT is_tombstone OR (category IS NULL AND odometer IS NULL))` — a tombstone carries no content, only the fact of deletion.

### `spec_overrides`

Zero or more per upgrade revision (FR-022).

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | |
| `revision_id` | `uuid` NOT NULL | FK → `service_entry_revisions(id)` `ON DELETE CASCADE` |
| `component_id` | `uuid` NOT NULL | Denormalized for the effective-spec view |
| `spec_key` | `text` NOT NULL | Joins to `component_specs.spec_key`. FR-009 |
| `kind` | `spec_kind` NOT NULL | |
| `label` | `text` NOT NULL | |
| `new_value` | `text` NOT NULL | |
| `unit` | `text` | FR-055 |
| `superseded_value` | `text` | Factory value at time of install, retained for display. FR-009 |

---

## 6. Energy entries

Vehicle-scoped, not component-scoped, so a plug-in hybrid's fuel and charge sessions interleave on one continuous odometer axis (FR-037).

### `energy_entries`

| Column | Type |
|---|---|
| `id` | `uuid` PK (client UUIDv7) |
| `vehicle_id` | `uuid` NOT NULL FK → `vehicles(id)` `ON DELETE CASCADE` |
| `created_by` | `uuid` NOT NULL |
| `created_at` | `timestamptz` NOT NULL |

### `energy_entry_revisions`

Append-only, same discipline as service revisions.

| Column | Type | Rules |
|---|---|---|
| `id`, `entry_id`, `supersedes_revision_id`, `is_tombstone`, `author_id`, `client_created_at`, `server_received_at` | — | As above |
| `mode` | `energy_mode` | NOT NULL unless tombstone |
| `occurred_at` | `timestamptz` | FR-030, FR-034 |
| `odometer` | `int` | `CHECK (>= 0)` |
| **Fuel** — FR-030 | | |
| `volume_gallons` | `numeric(8,3)` | `CHECK (> 0)`. FR-036 |
| `price_per_gallon` | `numeric(8,3)` | |
| `total_cost` | `numeric(10,2)` | One of the three may be derived. FR-031 |
| `fuel_grade` | `text` | `87`, `89`, `91`, `93`, `E85`, `diesel` |
| `is_full_fill` | `boolean` | FR-030, FR-033 |
| `missed_fill_before` | `boolean` | `default false`. FR-033 |
| **Charge** — FR-034 | | |
| `soc_start_pct`, `soc_end_pct` | `numeric(5,2)` | `CHECK (BETWEEN 0 AND 100)`. FR-036 |
| `energy_kwh` | `numeric(8,3)` | `CHECK (> 0)`. FR-036 |
| `charge_location` | `charge_location` | |
| `location_label` | `text` | Excluded from shared passports — it is location data |
| `session_cost` | `numeric(10,2)` | Redacted per FR-050 |

**Mode CHECK (FR-036)**: `CHECK (NOT is_tombstone AND mode = 'charge' IMPLIES soc_end_pct >= soc_start_pct)`, plus mutual exclusion of fuel and charge columns by mode.

> No derived metric — MPG, mi/kWh, Wh/mi, cost per mile — is stored. All are computed by pure functions in `lib/calc/` from raw inputs (R15), so a formula correction re-derives all history with no migration.

---

## 7. Attachments

### `attachments`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | Client-generated |
| `revision_id` | `uuid` NOT NULL | FK → `service_entry_revisions(id)` `ON DELETE CASCADE` |
| `storage_path` | `text` NOT NULL | `{owner_id}/{vehicle_id}/{attachment_id}` — owner prefix drives the Storage policy |
| `original_filename` | `text` NOT NULL | |
| `mime_type` | `text` NOT NULL | `CHECK (IN ('image/jpeg','image/png','image/webp','image/heic','application/pdf'))`. FR-026 |
| `byte_size` | `int` NOT NULL | `CHECK (> 0 AND <= 10485760)` — 10 MB, FR-026 |
| `state` | `attachment_state` NOT NULL | `default 'pending'`. FR-026c |

**Five-per-entry limit (FR-026)**: enforced by a `BEFORE INSERT` trigger counting siblings on the revision. A CHECK constraint cannot count rows.

---

## 8. Reminders

### `reminders`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | |
| `component_id` | `uuid` NOT NULL | FK `ON DELETE CASCADE` |
| `source_revision_id` | `uuid` | FK → `service_entry_revisions(id)`. Null for interval-derived |
| `kind` | `reminder_kind` NOT NULL | FR-013, FR-023 |
| `due_odometer` | `int` | |
| `due_on` | `date` | |
| `completed_at` | `timestamptz` | FR-023 |

`CHECK (due_odometer IS NOT NULL OR due_on IS NOT NULL)` — a reminder with neither trigger can never fire.

Recomputed whenever a source revision is superseded or tombstoned (FR-027c).

---

## 9. Passport shares

### `passport_shares`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid` PK | |
| `vehicle_id` | `uuid` NOT NULL | FK `ON DELETE CASCADE` |
| `token_hash` | `bytea` NOT NULL | `UNIQUE`. SHA-256 of a 256-bit token. **Raw token is never stored.** FR-049a |
| `include_costs` | `boolean` NOT NULL | `default false`. FR-050 |
| `minted_at` | `timestamptz` NOT NULL | |
| `revoked_at` | `timestamptz` | FR-051 |

Rows are **never deleted**. A revoked token still hashes to a row whose `revoked_at` is set and is therefore refused — which is what makes FR-051's "never reissued" a guarantee rather than a probability. Partial unique index `WHERE revoked_at IS NULL` enforces at most one live share per vehicle.

---

## 10. Views

| View | Purpose | Requirement |
|---|---|---|
| `v_current_service_revisions` | Per `entry_id`, the revision with greatest `server_received_at` (tie-break `id`), excluding tombstoned entries | FR-027a, FR-043a |
| `v_current_energy_revisions` | Same for energy | FR-027a |
| `v_component_effective_specs` | `component_specs` LEFT JOIN latest active `spec_overrides` per `spec_key`; emits `effective_value`, `origin`, `factory_value`, `override_revision_id`, `superseded_override_count` | FR-009, FR-010 |

`v_component_effective_specs` is the single source of truth for the HUD, the passport, and any export — computed once in the database so the three can never disagree (R10).

---

## 11. Row Level Security

RLS is enabled and forced on every table. There is no permissive fallback policy anywhere.

| Table | Policy |
|---|---|
| `accounts` | `id = auth.uid()` |
| `vehicles` | `owner_id = auth.uid()` for all four verbs. FR-048 |
| `components`, `component_specs` | Owner reached through `vehicles` |
| `service_entries`, `energy_entries` | Owner through `components` → `vehicles` |
| `service_entry_revisions`, `energy_entry_revisions` | **SELECT and INSERT only.** No UPDATE or DELETE policy exists, so append-only is enforced by absence of privilege. FR-027 |
| `spec_overrides`, `attachments`, `reminders` | Owner through parent |
| `tags` | Owner only; unauthenticated resolution goes through `resolve_tag()` |
| `component_templates` | `SELECT` to `authenticated`; no write policy |
| `passport_shares` | Owner only; guest access goes through `get_public_passport()` |

**Guest access carries no RLS exception.** Both guest paths are `SECURITY DEFINER` functions that validate their own input and return a fixed projection (R12, R13). The anon key never gains a policy that reads vehicle data directly, so a leaked anon key discloses nothing.

**Storage**: bucket `attachments`, private, policy keyed on the `{owner_id}/…` path prefix. Passport attachments are served through short-lived signed URLs minted by the passport RPC, never by making the bucket public.

---

## 12. Indexes

| Index | Rationale |
|---|---|
| `vehicles (owner_id, slug)` UNIQUE | Address resolution, FR-001d |
| `components (vehicle_id, slug)` UNIQUE | Address resolution |
| `service_entry_revisions (entry_id, server_received_at DESC)` | Current-revision resolution — the hottest read |
| `service_entries (component_id)` | Timeline scan, SC-001 |
| `energy_entry_revisions (entry_id, server_received_at DESC)` | Current-revision resolution |
| `energy_entries (vehicle_id)` | Economy interval scan, FR-032 |
| `spec_overrides (component_id, spec_key)` | Effective-spec join, FR-009 |
| `passport_shares (token_hash)` UNIQUE | Guest lookup, FR-049a |
| `reminders (component_id) WHERE completed_at IS NULL` | Partial index; only outstanding reminders are ever queried |

---

## 13. TypeScript projection — `types/servicecard.ts`

The requested discriminated union mirrors § 5 exactly:

```
ServiceLog = MaintenanceLog | RepairLog | ReplaceLog | UpgradeLog   // discriminant: category
EnergyLog  = FuelLog | EVChargeLog                                  // discriminant: mode
```

Every log type extends a `LogBase` carrying `id`, `entryId`, `supersedesRevisionId`, `isTombstone`, `authorId`, `clientCreatedAt`, `serverReceivedAt`, `performedOn`, `odometer`, `notes`. Zod schemas in `lib/validation/` are the single definition, with types inferred from them (R16) so the runtime check and the compile-time type cannot drift.

---

## 14. Entity coverage against the spec

| Spec entity | Implementation |
|---|---|
| Account | `accounts` + `auth.users` |
| Vehicle | `vehicles` |
| Component | `components` |
| Component Specification | `component_specs` |
| Tag | `tags` |
| Service Log | `service_entries` + `service_entry_revisions` |
| Revision | `service_entry_revisions`, `energy_entry_revisions` |
| Specification Override | `spec_overrides` |
| Reminder | `reminders` |
| Fuel Entry | `energy_entry_revisions` where `mode='fuel'` |
| Charge Entry | `energy_entry_revisions` where `mode='charge'` |
| Attachment | `attachments` + Storage bucket |
| Passport Share | `passport_shares` |
| Pending Change | IndexedDB `outbox` store (client-side only, R6) |

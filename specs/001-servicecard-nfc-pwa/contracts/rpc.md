# Contract: Database RPC

**Feature**: `specs/001-servicecard-nfc-pwa` | **Date**: 2026-08-13

Five callable Postgres functions. Two of them (`resolve_tag`, `get_public_passport`) are `SECURITY DEFINER` and are therefore the application's real authorization boundary — they must be reviewed as security surface, not as convenience helpers.

| Function | Security | Callable by | Requirement |
|---|---|---|---|
| `get_component_card` | INVOKER | `authenticated` | SC-001, FR-007–FR-013 |
| `resolve_tag` | **DEFINER** | `anon`, `authenticated` | FR-001a, FR-003 |
| `get_public_passport` | **DEFINER** | `anon` | FR-049a, FR-050 |
| `claim_tag` | INVOKER | `authenticated` | FR-002, FR-045, FR-053 |
| `recompute_component_derived` | INVOKER | `authenticated` | FR-027c |

---

## `get_component_card(p_vehicle_slug text, p_component_slug text, p_limit int default 20) → jsonb`

`SECURITY INVOKER` — RLS still applies. This function exists purely to collapse a card render into one round trip (R11); it is never an authorization bypass.

**Returns**

```jsonc
{
  "vehicle":   { "id", "slug", "year", "make", "model", "trim", "nickname",
                 "power_source", "current_odometer" },              // FR-007
  "component": { "id", "slug", "display_name", "is_energy_port",
                 "energy_mode_hint", "service_interval_miles",
                 "service_interval_days" },                          // FR-004
  "specs": [ { "spec_key", "kind", "label", "effective_value", "unit",
               "origin",                    // 'factory' | 'override'  — FR-009
               "factory_value",             // retained even when overridden
               "override_revision_id",
               "superseded_override_count" } ],                      // FR-010
  "reminders": [ { "id", "kind", "due_odometer", "due_on", "is_overdue" } ], // FR-013, FR-023
  "timeline": [ { "entry_id", "revision_id", "category", "performed_on",
                  "odometer", "notes", "is_edited",                  // FR-027a
                  "category_fields": { … }, "attachments": [ … ] } ],
  "timeline_has_more": boolean
}
```

**Behaviour**

- Reads `v_component_effective_specs` and `v_current_service_revisions`; tombstoned entries never appear (FR-027a).
- `is_edited` is true when the entry's revision chain has length > 1 (FR-027a).
- Returns `NULL` when the caller does not own the vehicle. The route renders `404`, never `403`.
- Empty `timeline` is a valid success — a component with no history still returns full specs (US1 scenario 5).

**Performance budget**: p95 under 200 ms server-side, which is what leaves room inside SC-001's 1-second end-to-end target.

---

## `resolve_tag(p_tag_id text) → jsonb`

`SECURITY DEFINER`, `search_path = ''`, `REVOKE ALL FROM public` then `GRANT EXECUTE TO anon, authenticated`.

Exists because an unauthenticated scan must be able to learn "this tag is unclaimed" (FR-002) while a scan of someone else's tag learns nothing (FR-003). Plain RLS cannot express that asymmetry — it returns an empty row for both.

**Returns exactly one of**

```jsonc
{ "status": "unclaimed" }
{ "status": "owned",     "vehicle_slug": "raptor", "component_slug": "front-diff" }
{ "status": "forbidden" }   // no vehicle data whatsoever
{ "status": "unknown" }
```

**Rules**

- `owned` is returned only when `auth.uid()` equals the tag's owner. Any other authenticated or anonymous caller gets `forbidden`.
- The `forbidden` and `unknown` branches must be indistinguishable in payload **and in execution time**. A timing difference makes the tag space enumerable.
- Never leaks vehicle id, slug, name, or existence in any non-`owned` branch.

---

## `get_public_passport(p_token text) → jsonb`

`SECURITY DEFINER`, `search_path = ''`, `GRANT EXECUTE TO anon`. The single highest-risk function in the system: it is the only path by which an unauthenticated caller obtains vehicle data.

**Algorithm**

1. `SELECT` the share row `WHERE token_hash = sha256(p_token) AND revoked_at IS NULL`.
2. No row → return `NULL`. The route renders `404` identically for revoked, unknown, and malformed tokens (FR-051).
3. Build the passport projection for that vehicle only.
4. **Redact in SQL, before returning**: `cost`, `total_cost`, `price_per_gallon`, `session_cost` are set to `NULL` unless `include_costs`; owner identity and `location_label` are always omitted (FR-050).

**Returns**

```jsonc
{
  "vehicle":    { "year", "make", "model", "trim", "power_source", "current_odometer" },
  "components": [ { "display_name", "specs": [ … ] } ],
  "history":    [ { "component_name", "category", "performed_on", "odometer",
                    "notes", "is_edited", "attachments": [ { "signed_url" } ] } ],
  "energy_summary": { "entry_count", "first_odometer", "last_odometer" },
  "include_costs": boolean
}
```

**Rules**

- Redaction happens in the database. A client-side bug must not be able to leak costs.
- Attachment URLs are signed and expire in 15 minutes; the bucket is never made public.
- Tombstoned entries are excluded; edited entries are flagged (FR-027a), so a buyer can see that a record was revised.
- Read-only by construction — the function returns data and has no write path.

---

## `claim_tag(p_tag_id text, p_vehicle_id uuid, p_component_slug text, p_template_key text, p_display_name text) → jsonb`

`SECURITY INVOKER`. Runs as one transaction (FR-002, FR-045, FR-053).

1. Verify the tag is unclaimed, or already claimed by the caller. Otherwise raise `tag_already_claimed`.
2. Verify `p_vehicle_id` is owned by `auth.uid()`.
3. Create the component, resolving a slug collision by appending a numeric discriminator rather than failing (FR-001d).
4. Copy `component_templates.default_specs` into `component_specs`, and default intervals onto the component (FR-053).
5. Bind the tag.
6. Return `{ "vehicle_slug", "component_slug" }` for the redirect.

**Errors**: `tag_already_claimed`, `vehicle_not_owned`, `tag_not_found`.

---

## `recompute_component_derived(p_component_id uuid) → void`

`SECURITY INVOKER`. Called after any revision is superseded or tombstoned (FR-027c).

Rebuilds outstanding `reminders` from the current non-tombstoned revisions and the component's intervals. Effective specs need no rebuild — `v_component_effective_specs` is a view and re-derives on read (R10).

**Idempotent**: running it twice yields the same state. It is safe to call from a retried sync.

---

## Contract tests (Article V — real Postgres, never a mocked driver)

| # | Assertion | Requirement |
|---|---|---|
| 1 | `get_component_card` returns `NULL` for a non-owner | FR-048 |
| 2 | An active override appears with `origin='override'` and a non-null `factory_value` | FR-009 |
| 3 | Two overrides on one `spec_key` → newest effective, `superseded_override_count = 1` | FR-010 |
| 4 | A tombstoned entry is absent from `timeline` and from reminder derivation | FR-027a |
| 5 | An entry with two revisions reports `is_edited = true` | FR-027a |
| 6 | `resolve_tag` returns `forbidden` for a non-owner and leaks no vehicle field | FR-003 |
| 7 | `resolve_tag` `forbidden` and `unknown` payloads are byte-identical apart from the status string | FR-003 |
| 8 | `get_public_passport` returns `NULL` for a revoked token | FR-051 |
| 9 | Costs are `NULL` when `include_costs = false` | FR-050 |
| 10 | A re-minted share does not revive the previously revoked token | FR-051 |
| 11 | Inserting the same revision `id` twice yields exactly one row | FR-041 |
| 12 | No role holds `UPDATE` or `DELETE` on either revision table | FR-027 |
| 13 | A Repair revision carrying `warranty_expires_on` is rejected by CHECK | FR-017 |
| 14 | A charge revision with `soc_end < soc_start` is rejected by CHECK | FR-036 |
| 15 | A sixth attachment on one revision is rejected by trigger | FR-026 |
| 16 | `claim_tag` on another owner's tag raises `tag_already_claimed` | FR-046 |

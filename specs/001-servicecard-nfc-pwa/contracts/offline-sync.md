# Contract: Offline Sync Protocol

**Feature**: `specs/001-servicecard-nfc-pwa` | **Date**: 2026-08-13

This is the one piece of custom infrastructure in the feature (R7). Neither Next.js nor Supabase provides an offline write queue with exactly-once delivery, so the rules below are the contract its integration tests assert against.

---

## Guarantees

| # | Guarantee | Requirement |
|---|---|---|
| G1 | A retried submission results in exactly one stored record | FR-041 |
| G2 | An unsynchronized record is never discarded by the client | FR-042 |
| G3 | Records created independently on multiple devices all survive | FR-043 |
| G4 | Ordering and precedence derive from server receipt, never from device clocks | FR-043a, FR-043b |
| G5 | A previously visited card is readable offline with a staleness stamp | FR-038 |
| G6 | A record is visible in its timeline the instant it is saved, before any upload | FR-039 |

---

## Outbox record

```jsonc
{
  "id": "uuidv7",                  // primary key on the server too — this is what makes G1 hold
  "kind": "service_revision" | "energy_revision" | "attachment",
  "payload": { … },                // Zod-validated at enqueue time
  "attachment_ids": ["uuid"],      // uploaded before the revision is acknowledged
  "client_created_at": "ISO8601",  // untrusted; display and audit only
  "attempts": 0,
  "last_error": null,
  "state": "pending" | "in_flight" | "stuck"
}
```

**`id` is generated on the client, before the record leaves the device.** This is the whole mechanism behind G1: the server inserts with `ON CONFLICT (id) DO NOTHING`, so a retry after an ambiguous network failure is a no-op rather than a duplicate. Server-assigned ids would require a separate idempotency-key table to achieve the same thing (R7).

UUIDv7 is chosen over UUIDv4 because it sorts by creation time, which keeps index locality good on the revision tables.

---

## Enqueue (FR-039, G6)

1. Validate against the shared Zod schema. Invalid input never enters the outbox — a malformed record would fail forever and become permanently `stuck`.
2. Compress attachments on-device (R14) and store the bytes in the `blobs` store.
3. Write the outbox record and optimistically merge it into the `cards` store.
4. Render immediately, marked pending. **No network call is attempted at this point** — the user has already walked away from the phone.

---

## Drain

Triggered by: the `online` event, app focus, a successful enqueue while online, and Background Sync where the browser supports it.

Per record, in FIFO order by `client_created_at`:

1. Upload any attachments not yet in `uploaded` state, to `{owner_id}/{vehicle_id}/{attachment_id}`. The path is content-addressed by attachment id, so a re-upload overwrites itself rather than duplicating.
2. Submit the revision via its Server Action.
3. On `2xx` → remove from the outbox and refresh the card's `fetched_at`.
4. On `4xx` (validation or authorization) → mark `stuck`, surface it, **retain it** (G2).
5. On `5xx`, timeout, or offline → increment `attempts`, back off, **retain it** (G2).

**Backoff**: 1s, 2s, 4s … capped at 5 minutes. After 10 consecutive failures the record is marked `stuck` and surfaced in the UI (FR-042). It is still never deleted.

**Removal from the outbox happens only on a confirmed acknowledgement.** Removing on send would trade G2 away for nothing.

---

## Conflict handling (G3, G4)

The append-only revision model means the sync engine performs no merge at all — this is the payoff of clarification Q3.

| Situation | Outcome |
|---|---|
| Two devices create separate entries | Both insert. Different `entry_id`s, no interaction (FR-043) |
| Two devices supersede the same entry | Both revisions persist in the chain; the one with the later `server_received_at` displays (FR-043a) |
| One device edits, another tombstones | Both persist; latest server receipt wins. A tombstone arriving later hides the entry |
| Same record retried | `ON CONFLICT (id) DO NOTHING` — one row (G1) |
| Settings change on two devices | Last write received by the server wins (FR-043b) |

**Device clocks are never consulted for resolution.** `client_created_at` exists for display and for FIFO drain ordering on a single device only. The spec explicitly lists a wrong device clock as an edge case, so trusting it for precedence would be a known-broken design.

---

## Card cache (G5)

| Field | Purpose |
|---|---|
| `key` | `${vehicle_slug}/${component_slug}` |
| `payload` | Last `get_component_card` result |
| `fetched_at` | Drives the staleness indicator (FR-038) |

Read path: serve the cached payload immediately, revalidate in the background, replace on success. Offline, serve the cache with the staleness stamp visible. A card never visited while online is not in the cache and shows the offline fallback — FR-038 scopes offline reads to previously visited cards.

Optimistic entries from the outbox are merged into the cached timeline on read, so a pending record and a synced one look identical apart from the pending marker.

---

## Sign-out interaction (FR-047c, FR-047d)

Signing out clears `cards`, `blobs`, and `meta`. If the outbox is non-empty, sign-out is blocked pending explicit confirmation that those records will be discarded — signing out on a phone that still holds the only copy of this morning's oil change would silently destroy it.

---

## Integration tests (Article V — real infrastructure)

| # | Scenario | Asserts |
|---|---|---|
| 1 | Submit, kill the connection mid-flight, reconnect, retry | Exactly one row (G1, SC-005) |
| 2 | Create 100 records offline, reconnect | 100 rows, zero duplicates, zero losses (SC-005) |
| 3 | Two clients supersede one entry offline, both sync | Both revisions retained; both clients converge on the same display (SC-013) |
| 4 | Server returns 500 five times, then 200 | One row; backoff observed; record retained throughout (G2) |
| 5 | Server returns 400 | Record marked `stuck`, retained, surfaced (FR-042) |
| 6 | Device clock set 3 days ahead, then a concurrent edit | Precedence follows server receipt, not the skewed clock (G4) |
| 7 | Entry with 5 attachments created offline, reconnect | All attachments uploaded, entry acknowledged within 60s (SC-015) |
| 8 | Attachment upload fails, revision succeeds | Entry visible, attachment marked pending, retried (FR-026c) |
| 9 | Sign-out attempted with a non-empty outbox | Blocked pending confirmation (FR-047d) |

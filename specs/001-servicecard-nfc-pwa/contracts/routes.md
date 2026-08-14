# Contract: URL Surface

**Feature**: `specs/001-servicecard-nfc-pwa` | **Date**: 2026-08-13

The addresses below are the application's most externally-committed interface. A tag adhered to a frame rail cannot be reprogrammed, so `/t/{tag_id}` is permanent.

---

## Route table

| Route | Rendering | Auth | Requirement |
|---|---|---|---|
| `/t/{tag_id}` | Server, redirect only | Optional | FR-001, FR-001a, FR-002, FR-003 |
| `/v/{vehicle_slug}/c/{component_slug}` | Server Component | Owner | FR-001b, FR-007–FR-015 |
| `/v/{vehicle_slug}/c/{component_slug}` where component is an energy port | Server Component → energy logger | Owner | FR-004 |
| `/v/{vehicle_slug}` | Server Component | Owner | FR-052 |
| `/claim?tag_id={tag_id}` | Client Component | Required | FR-002, US3 |
| `/p/{share_token}` | Server Component | None | FR-049a, FR-050, FR-051b |
| `/auth/verify` | Server Component | — | FR-047 |
| `/garage` | Server Component | Owner | FR-052 |

> `{vehicle_slug}` and `{component_slug}` are readable identifiers unique per owner (FR-001d). `{tag_id}` is 26 base32url characters, 128 bits of entropy (FR-001c). `{share_token}` is 43 base64url characters, 256 bits (FR-049a).

---

## `/t/{tag_id}` — the tag entry point

The only address printed onto physical hardware. Resolves server-side via `resolve_tag()` and always redirects; it never renders a page of its own.

| `resolve_tag` status | Response | Requirement |
|---|---|---|
| `owned` | `307` → `/v/{vehicle_slug}/c/{component_slug}` | FR-001a, FR-001b |
| `unclaimed` | `307` → `/claim?tag_id={tag_id}` | FR-002 |
| `forbidden` | `307` → `/tag-unavailable`, **disclosing no vehicle information whatsoever** | FR-003, FR-048 |
| `unknown` | `307` → `/tag-unknown` with the option to claim | FR-003 |

**Caller is unauthenticated and the tag is `owned`**: redirect to sign-in with `next` set to the component address, so the scan completes after the one-time email code (FR-047).

**Critical**: `forbidden` and `unknown` must be externally indistinguishable in timing and content. A measurable difference turns the tag space into an oracle for enumerating claimed tags.

---

## `/v/{vehicle_slug}/c/{component_slug}` — component service card

Next 16 delivers route params as a Promise. `params` **must** be awaited:

```ts
export default async function Page({ params }: { params: Promise<{ vehicle_id: string; component_id: string }> }) {
  const { vehicle_id, component_id } = await params
}
```

**Response contract**

| Condition | Response |
|---|---|
| Owner, component exists | `200`, card rendered |
| Owner, component is an energy port | `200`, energy logger rendered instead (FR-004) |
| Authenticated non-owner | `404` — never `403`, which would confirm existence |
| Unauthenticated | `307` → sign-in with `next` preserved |
| Slug not found | `404` |

**Render order (SC-001)**: header, mechanics HUD, and quick actions render outside any Suspense boundary and paint first. The timeline renders inside a Suspense boundary and may stream. Someone reaching for a drain plug needs the torque figure, not the 2019 history.

**Payload**: one `get_component_card()` call. Multiple sequential round trips cannot meet the 1-second budget.

---

## `/claim` — tag claim flow

| Parameter | Rules |
|---|---|
| `tag_id` | Required. Preserved across sign-in and across vehicle creation (FR-002, US3 scenario 3) |

| Condition | Response |
|---|---|
| Unauthenticated | `307` → sign-in, `tag_id` preserved through the round trip |
| Tag already claimed by caller | `307` → its component card |
| Tag claimed by another account | `307` → `/tag-unavailable` (FR-046) |
| Tag unclaimed | `200`, claim wizard |

On completion, `claim_tag()` binds the tag, copies template specs into `component_specs` (FR-053), and redirects to the new card.

---

## `/p/{share_token}` — public vehicle passport

The only route that serves vehicle data to an unauthenticated caller, and the only one where a mistake is a data breach.

| Condition | Response |
|---|---|
| Token matches a live share | `200`, read-only passport |
| Token revoked, unknown, or malformed | `404`, identical in all three cases (FR-051) |

**Mandatory response headers and metadata (FR-051b)**

| Control | Value |
|---|---|
| `X-Robots-Tag` | `noindex, nofollow, noarchive` |
| Route `metadata.robots` | `{ index: false, follow: false }` |
| OpenGraph / Twitter card tags | **None.** Present tags would expand a vehicle's history into a chat preview |
| `robots.txt` | `Disallow: /p/` |
| `Cache-Control` | `private, no-store` |

**Content rules**

| Rule | Requirement |
|---|---|
| No write control is rendered or reachable | FR-050 |
| Owner identity omitted | FR-050 |
| Cost columns omitted unless `include_costs` | FR-050 |
| Charging `location_label` omitted — it is location data | FR-050 |
| Entries with multiple revisions marked edited | FR-027a |
| Attachments served via signed URLs expiring in 15 minutes | § data-model 11 |

---

## Server Actions

Mutations are Next.js Server Actions, not REST endpoints. Each validates with the shared Zod schema (R16) before touching the database, because a device that has been offline for days cannot be trusted to have validated correctly.

| Action | Input | Requirement |
|---|---|---|
| `submitServiceRevision` | Revision incl. client-generated `id` | FR-016–FR-027, FR-041 |
| `submitEnergyRevision` | Revision incl. client-generated `id` | FR-030–FR-037, FR-041 |
| `claimTag` | `tag_id`, vehicle ref, component ref | FR-002, FR-045 |
| `mintPassportShare` | `vehicle_id`, `include_costs` | FR-049a |
| `revokePassportShare` | `vehicle_id` | FR-051 |
| `requestSignInCode` / `verifySignInCode` | Email / code | FR-047 |

Every action is idempotent on the client-supplied `id` (FR-041), so replaying one after an ambiguous failure is always safe.

---

## Progressive Web App surface

| Asset | Requirement |
|---|---|
| `/manifest.webmanifest` | standalone display, dark theme colour, maskable icons. FR-044 |
| `/sw.js` | Serwist-generated. FR-038, FR-040 |
| Offline fallback | Cached shell for uncached addresses; never a browser error page. FR-038 |

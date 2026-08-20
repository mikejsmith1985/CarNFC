# Interface Contracts: ServiceCard

**Feature**: `specs/001-servicecard-nfc-pwa` | **Date**: 2026-08-13

ServiceCard exposes three external interfaces. Each is specified in its own file, and each is the boundary an integration test asserts against.

| Contract | File | Consumers |
|---|---|---|
| **URL surface** — the addresses physical tags resolve to and the pages they open | [`routes.md`](./routes.md) | NFC tags, mobile browsers, shared links, search-engine crawlers |
| **Database RPC** — the callable server functions, including the two `SECURITY DEFINER` boundaries | [`rpc.md`](./rpc.md) | Server Components, Server Actions, the sync engine |
| **Offline sync protocol** — the outbox record shape and the exactly-once delivery rules | [`offline-sync.md`](./offline-sync.md) | The client sync engine and its integration tests |

## What is deliberately not a contract here

- **Supabase table access.** Direct table reads and writes are internal; RLS governs them and they may change shape freely. Anything a guest can reach is an RPC, never a table.
- **React component props.** Internal to the application; covered by unit and UX tests, not by a published contract.

## Stability rules

The URL surface in `routes.md` is the most rigid contract in the system: a physical tag stuck to a frame rail cannot be reprogrammed after it ships. `/t/{tag_id}` must resolve for the lifetime of the tag. Every other route may be restructured as long as `/t/` keeps redirecting correctly.

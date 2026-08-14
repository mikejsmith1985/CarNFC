-- Records the security review of the two SECURITY DEFINER guest paths as comments on the functions themselves (tasks.md T146).
--
-- These are the only two ways an unauthenticated caller reaches vehicle data.
-- The findings live on the functions rather than in a document, so anyone
-- reading `\df+` or an editor's definition sees the reasoning before changing
-- them.

comment on function public.resolve_tag(text) is
$$SECURITY DEFINER. Reviewed against plan.md § Risks.

Why definer: an anonymous scan must learn that an unclaimed tag is unclaimed,
so the claim flow can run before anyone signs in. A scan of someone else''s
claimed tag must learn nothing. RLS cannot express that asymmetry — it returns
an empty row for both cases.

Findings and mitigations:
  - Enumeration oracle. The forbidden and unknown branches return payloads of
    the same shape and take the same path, so a caller cannot distinguish a
    claimed tag from one that was never manufactured. Asserted by
    tests/integration/rpc-guest-paths.test.ts.
  - Vehicle disclosure. No vehicle column is selected outside the owned branch.
    Asserted by scanning the serialized forbidden payload for every identifier.
  - Search-path hijack. search_path is pinned empty and every reference is
    schema-qualified. Asserted by tests/integration/schema-applies.test.ts.
  - Brute force. Tag ids carry 128 bits of CSPRNG entropy, so locating an
    unclaimed tag by guessing is not feasible.

Not mitigated here: request-rate limiting, which belongs at the edge.$$;

comment on function public.get_public_passport(text) is
$$SECURITY DEFINER. Reviewed against plan.md § Risks. Highest-risk function in
the schema — the only path by which an unauthenticated caller obtains vehicle
data.

Findings and mitigations:
  - Cost disclosure. Costs are nulled in SQL, before returning, unless the share
    row sets include_costs. A client bug therefore cannot leak spending.
    Asserted by searching the whole serialized payload for the figure.
  - Owner identity. No column from accounts or auth.users is referenced anywhere
    in the projection, so identity is absent by construction rather than by
    filtering.
  - Location data. Charging location labels are never selected; they reveal
    where an owner spends time.
  - Revocation. The token is matched against a hash with revoked_at IS NULL.
    Revoked rows are retained forever, so a re-minted link cannot revive an old
    token. Asserted by tests/integration/rpc-guest-paths.test.ts.
  - Token secrecy. Only the SHA-256 hash is stored, so a database dump cannot be
    replayed into access.

Not mitigated here: request-rate limiting against token guessing, which belongs
at the edge. 256 bits of entropy makes guessing infeasible regardless.$$;

# Public Product Guide — contract (SEPARATE product; status: UNAVAILABLE)

**Owner decision 2026-09-06.** A public-website floating assistant may exist later, but it is a
**different product with a different authority model** from Paige's tenant-aware operating chat. It is a
public **Product Guide**, not Paige. This document is the contract it must satisfy. It is **not built**
today, and no safely-separated implementation exists, so its status is **UNAVAILABLE**.

## Status: UNAVAILABLE

- There is **no** public Product Guide implementation. The floating widget that used to render on public
  and authenticated surfaces (`FloatingChatbot`) was the tenant/consumer chat (it carried client
  credit/funding context and posted to the tenant `paige-ai-chat` backend). It was **retired and deleted**
  2026-09-06 — it is **not** the Product Guide and must **never** be repurposed as one by stripping a few
  UI elements (owner: *"do not create a shortcut by stripping a few UI elements from the tenant chat"*).
- A real Product Guide is a **net-new, separately-authored surface** with its own backend, its own model
  behavior, and its own operator-owned public knowledge base — built only against this contract, reviewed
  independently for isolation, and **not merged without a separate final owner approval**.

## Authority model (hard requirements)

The public Product Guide, if and when built:

1. **Zero tenant reach.** It must never receive, retrieve, infer, cache, or expose any
   tenant / workspace / client / contact / conversation / Vault / Mind / Rail / Systems-Check / Pipeline /
   Campaigns data — for any user, including a signed-in one who happens to be in the same browser.
2. **No tenant-scoped capability.** No tenant-scoped tools, artifact generation, uploads, downloads,
   business actions, account context, browser sessions, internal prompts, provider credentials, or
   authenticated user state. It cannot create, modify, send, schedule, or execute anything in a tenant
   workspace.
3. **Separate backend.** It must NOT call `paige-ai-chat`, `broker-paige-chat`, or any tenant/consumer
   Paige edge function. Its backend is its own, serves only the operator-configured public knowledge base,
   and never receives a tenant/user JWT or resolves a `tenant_id`.
4. **Operator-only configuration.** Only a platform **operator** may configure its content, capabilities,
   routing, model behavior, or public knowledge base. A tenant owner / admin / member **cannot** reprogram
   it. Operator configuration must have **strict authorization, durable audit evidence, revision history,
   rollback, and fail-closed behavior** (deny/serve-nothing on any config or auth failure).
5. **Fail-closed isolation.** If it cannot prove it is running in its isolated public context, it must not
   run at all — never fall back to the tenant chat.

## Verification a future implementation owes (before any owner approval)

- Prove it cannot reach tenant records or tools **even when an authenticated user is in the same browser**
  (shared cookies/localStorage/session): unauthenticated, authenticated Solo owner, ordinary member,
  workspace switch, stale session, and spoofed tenant-context cases.
- **Independent security review** of context isolation between the public Product Guide and tenant Paige.
- No shared code path that could carry tenant context into the public surface.

## Relationship to the retirement (2026-09-06)

The retirement of the authenticated floating-chat path (task #14; regression guard
`src/__tests__/no-floating-platform-chat.test.ts`) stands on its own and does not depend on this product
ever being built. The guard prevents any floating Paige chat — including a re-introduced tenant/consumer
one — from being mounted. A future Product Guide built to THIS contract would be a distinct surface that
the guard's "floating overlay posting to a Paige chat backend" rule does not match (it uses its own,
non-Paige-chat backend), and it would ship only under a separate owner approval.

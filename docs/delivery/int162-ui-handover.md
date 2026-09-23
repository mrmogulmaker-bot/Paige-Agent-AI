# INT-162 (UI lane) → INT-163 (backend lane) — handover

**Status:** the UI lane builds against the contract below. The backend lane owns and merges the
schema and endpoints first; this lane's code calls them and must not create them.

**Owner rulings this implements (2026-09-22):**
1. Signature state is SEPARATE from commercial state. `tenant_client_agreements.status` is untouched.
2. `Signed` collapses into `Completed` — with one signer nothing can distinguish them, and a state
   nothing can observe distinctly is a lie (§13).
3. A signing may exist with **no offer and no price**, so an NDA or a scope letter is representable.

**Vocabulary ban (owner ruling, hard).** No `DocuSign`, and none of its product nouns — `envelope`,
`recipient`, `tabs`, `anchor tag`, `certificate of completion`. The legacy `paige_signature_envelopes`
already owns "envelope"; the native path must not take the word. A name that passes a `grep -i
docusign` can still violate this ruling.

---

## 1. The contract this lane calls

### Tenant-side (authenticated)

| RPC | Arguments the UI passes | UI expects back |
|---|---|---|
| `create_agreement_signing` | `_expected_tenant_id`, `_contact_id`, `_agreement_id` (**nullable**, ruling 3), `_document_title`, `_document_source`, `_document_body`, `_document_path` | `{ signing_id, signature_state }` |
| `issue_agreement_signing_link` | `_expected_tenant_id`, `_signing_id`, `_ttl_days` | `{ signing_id, token, expires_at }` — raw token returned **once**, never re-retrievable |
| `void_agreement_signing` | `_expected_tenant_id`, `_signing_id` | `{ ok }`; must NULL the `token_hash` so the live link genuinely stops working, not merely relabels |

`_document_source` ∈ `tenant_upload` · `paige_draft` · `tenant_template`.

`_expected_tenant_id` is the refusal guard from `save_client_agreement`
(`supabase/migrations/20261200000000_...sql:398-402`): the UI sends the tenant **the form was opened
against**, never the current one, so a workspace switch mid-draft aborts instead of silently landing
the record in the wrong workspace.

### Public signing page (unauthenticated, token-keyed)

| Endpoint | Sent | Returned |
|---|---|---|
| `peek_agreement_signing(_token)` | the token **only** | one row, columns below |
| `decline_agreement_signing(_token, _reason)` | token + free text | `{ ok }` |
| `POST /functions/v1/sign-agreement` | `{ token, typed_name, signature_image_base64?, consent_read, consent_esign }` | `{ ok: true, signing_id, signed_pdf_path }` |

**`peek_agreement_signing` return columns the page reads, by name:**
`document_title` · `document_body` · `document_path` · `business_name` · `brand` (jsonb; the page
reads `brand.logo_url`) · `signer_display_name` · `amount_minor` (bigint, **minor units**) ·
`amount_currency` (3-letter, lowercase) · `term_summary` · `expires_at` · `signature_state` ·
`is_valid`.

Three constraints the page depends on, which the endpoint must hold up:

- **It must never return `tenant_id`, a staff email, or any other row.** The page needs the brand,
  not the id behind it. (`resolveHostNames` leaked host auth emails to anon in both guest booking
  functions until PR #1246 — `docs/doctrine/tier-matrix.md:389`. Same shape of surface.)
- **One indistinguishable refusal.** Unknown, expired, already completed, declined and voided must
  all return the same empty result. The page renders one sentence for all of them and does not try
  to tell the visitor which — telling them apart confirms to a stranger that a guessed token is real.
  The BUSINESS sees the true state in Commercial Terms, where it is entitled to.
- **`ok: true` is the only thing that means signed.** The page treats a resolved call without an
  explicit `ok` as a failure and says nothing was signed (§13). A fire is not a delivery.

---

## 2. The approved signing-page template — §28 FROZEN

The page is **built, rendered and verified** in this lane and is owner-approved:

- `src/pages/sign/AgreementSigning.tsx` — the surface
- `src/pages/sign/agreement-signing.css` — its design system
- route: `/sign/:token`, registered in `src/App.tsx` as a public, unauthenticated route

**The endpoint must serve this markup. It must not improvise its own page.** The design was approved
by the owner on 2026-09-22 and is APPROVED-FROZEN under §28: no restyle, no re-layout, no "while we
were in there" adjustment, unless the owner names the exact change.

What the template already does, so the backend does not rebuild it:

- **A read gate.** Signing is locked until the document has been scrolled to the end, with live
  progress. It measures only once the element genuinely has a layout — an early build measured it
  while `display:none`, read 0×0, concluded "it fits without scrolling" and unlocked signing before a
  word was on screen. It also cannot deadlock on a document too short to scroll.
- **Signature by typing or drawing.** The pad is pointer-event based, so one implementation serves
  mouse, pen and **touch** — the owner's requirement is that this works on a phone.
- **Two explicit consents** (read-in-full, and E-SIGN/UETA), both required before the act unlocks.
- **One deliberate commit** — the single gold control on the page (§11: gold marks the act that
  commits, nowhere else) — and a **visible decline** beside it that is a real outcome, not a dead end.
- **Honest states**: loading, refused, transport error (explicitly distinguished from an invalid
  link, because saying "your link is invalid" when the server fell over is a lie the visitor cannot
  correct), declined, completed.
- **§38**: no payment instrument, no card field, nothing charged, collected or authorised. The figure
  shown is what the document says was agreed.

**Verified (this lane, real Chromium against the built bundle, the RPC intercepted):** the gate locks
on arrival and the act is disabled; it unlocks only after a full scroll; the act stays disabled with
consents unchecked and enables with them checked; signing reaches the completed state; an invalid
token renders the refusal and **never** renders the gate. Desktop and 392 px, light and dark, no
console errors, no horizontal overflow.

**One deliberate constraint the backend lane should not "fix":** this stylesheet carries **no
`@import`**. It ships in a lazy-route CSS chunk, and Vite's preload helper waits on that chunk — an
`@import` to an unreachable font host makes the preload reject and takes the **whole signing page
down**. That was measured here, not theorised. The signature field therefore uses a system serif
stack that always resolves. On the one page whose only job is signing a legal document, a prettier
face is not worth a render that can fail.

**Two constraints verified on the architecture ruling that this page, not the endpoint, is the
signer's surface:**

- *No dependency on a signed-in tenant.* The component imports exactly five things — React,
  `useParams`, `Helmet`, the anon Supabase client, and its own stylesheet. It calls no auth or
  tenant hook (`useTenantContext`, `useAuth`, `hasFeature`, `auth.*`): grepped, zero hits.
- *The refusal never reveals whether a token exists.* Driven across five cases — unknown, expired,
  voided, completed, and `is_valid: false` — all five render **byte-identically**: same copy, same
  `<title>`, and the signing gate present in none of them.

**And one thing the audit found that this page must NOT ship over —**
[#1355](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/1355). `usePageView()` is mounted
app-wide and reports `location.pathname` verbatim to the `track-event` endpoint, twice per view. On
a token-in-path route that writes the **bearer credential into the analytics store**. Measured, not
inferred. It already does this on the shipped `/join/:token`, so it is a live defect rather than a
new one — but `/sign/:token`'s token authorises signing a legal document, so this page is not
shippable until it is fixed. `src/hooks/useAnalytics.ts` is not this lane's file; filed rather than
unilaterally edited.

---

## 3. A defect in the contract itself — corrected here

**This was my error, and INT-163 must not inherit it.** The contract as first written specified:

```
tas_sent_has_link_ck:
  signature_state = 'draft' OR signature_state = 'voided'
  OR (token_hash IS NOT NULL AND expires_at IS NOT NULL)
```

That exempts only `draft` and `voided` — while the SAME contract requires both
`decline_agreement_signing` and the `sign-agreement` endpoint to set `token_hash := NULL`. So
`declined` and `completed` each violate the CHECK, and **both terminal states are unreachable**: an
agreement could be sent and then never legally finish. The constraint contradicts two writes the
contract mandates elsewhere.

**Corrected form**, which states the same intent — a row claiming to await signature must have a
live link — without forbidding the writes:

```
tas_sent_has_link_ck:
  signature_state NOT IN ('sent','viewed')
  OR (token_hash IS NOT NULL AND expires_at IS NOT NULL)
```

Honest note (§13): this was found by reading, not by running. The reproduction was written but never
executed, so it is reasoning from the text rather than a reproduced failure. It should be proven
before it is trusted — it is cheap to prove and the consequence of being wrong about it is a
capability that cannot complete.

## 4. Files this lane wrote under `supabase/` before the scope correction

Written by a crew dispatched under the earlier consolidated scope, **left in place, unmerged, and
not to be treated as authoritative.** Reconcile deliberately against the backend lane's own work:

| Path | What it contains |
|---|---|
| `supabase/migrations/20270401000000_tenant_agreement_signings.sql` | table `public.tenant_agreement_signings`; trigger fn `enforce_signing_tenant_links`; RPCs `create_agreement_signing`, `issue_agreement_signing_link`, `void_agreement_signing`, `peek_agreement_signing`, `decline_agreement_signing`; policies `tas_tenant_isolation`, `tas_visible_with_its_client` |
| `supabase/functions/sign-agreement/index.ts` | the token-gated signing endpoint |
| `supabase/functions/_shared/agreement-pdf.ts` | `buildAgreementPdf`, `decodeSignatureImage`, `sanitizeWinAnsi`, `wrapLine` |
| `scripts/smoke/int162-agreement-pdf-smoke.mjs` | §32 smoke test for the PDF pipeline |

`supabase/config.toml` was **not** modified — confirmed by `git diff`. The `sign-agreement` function
therefore has no `verify_jwt = false` declaration yet; without one it defaults to `verify_jwt = true`
and the platform gateway will 401 an unauthenticated signer **before the function runs**. Whoever
owns that file must add it.

Two §9 defects found while grounding this work are filed and are **not** in either lane's scope:
[#1353](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/1353) and
[#1354](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/1354).

---

## 5. RECONCILIATION — the two halves do not currently meet

Added 2026-09-23 by the UI lane, read from **both branches' real code**, not from either PR body.
Backend lane = PR #1352, branch `claude/optimistic-meitner-95a0gl`, head `2a0011d8`. Neither PR has
merged; `origin/main` is `7abd5f66` and carries neither half.

This is recorded rather than unilaterally fixed, because the coordinator's standing instruction on
cross-lane overlap is that it be *"reconciled against the backend lane's work deliberately rather
than by whoever merges first."* Rewriting this lane's adapter against an unmerged draft whose head
moved this morning is the speculative half of that, and the naming decision is not one lane's to
take alone.

### What already meets

The backend read this document: `20270401000000_agreements_engine_records.sql` cites it by path and
preserves this lane's `body_source` vocabulary (`paige_draft` · `tenant_template` · `tenant_upload`)
verbatim. All three owner rulings of 2026-09-22 survive in its schema:

| Ruling | Honoured how |
|---|---|
| Signature state is separate from commercial state | `paige_agreements.status` is the document machine; the commercial state stays on `tenant_client_agreements` behind `commercial_terms_id` |
| `Signed` collapses into `Completed` | the status set contains no `signed` |
| An agreement may exist with no offer and no price | `offer_id` is nullable |

The **five RPC names match exactly** — `create_agreement_signing`, `issue_agreement_signing_link`,
`peek_agreement_signing`, `decline_agreement_signing`, `void_agreement_signing` — as does the
`sign-agreement` edge function this page POSTs to. `add_agreement_signer` exists backend-side and
this page never calls it, which is correct: `trg_agreement_seed_counterparty` seeds the counterparty
on every create path, including the one this lane uses.

### Divergence 1 — the record this surface reads does not exist

`src/solo/useSoloAgreementSignings.ts:476` selects from `public.tenant_agreement_signings`. The
backend branch creates `paige_agreements`, `paige_agreement_signers` and `paige_agreement_events`,
and has **zero occurrences** of `tenant_agreement_signings` anywhere under `supabase/`. On merge
this band reads a relation that is not there — every row disappears and the surface renders its
failed-read state permanently. Column mapping, mine → theirs:

| This lane selects | Backend ships | Note |
|---|---|---|
| `id`, `contact_id`, `document_path`, `expires_at`, `sent_at`, `completed_at`, `declined_at`, `voided_at`, `created_at`, `updated_at` | same names | no change |
| `agreement_id` | `commercial_terms_id` | renamed |
| `document_title` | `title` | renamed |
| `document_source` | `body_source` | renamed; the three values are identical |
| `signature_state` | `status` | renamed |
| `signed_pdf_path` | `sealed_storage_key` | renamed |
| `signer_name`, `decline_reason` | on `paige_agreement_signers` | now a join, not a column |
| `viewed_at` | added by `20270407000000_agreement_view_tracking.sql` | confirm before relying on it |

### Divergence 2 — the storage bucket

This lane uploads the source document to, and mints its sealed-copy URL from, `tenant-agreements`
(`useSoloAgreementSignings.ts:312,359`). That bucket is real and already on `main` from
`20260630190349`. The backend creates a **different** bucket, `paige-agreements` — private, 25 MB,
`application/pdf` only — and seals into it.

### Divergence 3 — the sealed copy is retrieved by a mechanism the backend deliberately rejected

This lane mints a 120-second Supabase signed URL. The backend's PR states it refuses that pattern on
purpose: the object path is literally `${tenant_id}/${agreement_id}/`, which leaks tenant internals
to an external party and keeps working after a void. It streams the sealed record through the
`agreement-document` edge function instead, whose two doors are the signer's 365-day retrieval token
and **the workspace's own admin session** — which is exactly this surface's caller.

**On the merits the backend is right here, and this lane should move.** The §70 retrieval closed in
`d82b2a67` is the correct *capability* and the wrong *mechanism*.

### Divergence 4 — multi-party, which is a gap rather than a conflict

The backend supports several signers (`partially_signed`, per-signer signing order). This surface
represents a single counterparty. That is a superset on their side, not a contradiction, but this
lane has no representation for a partially-signed document and would show it as merely `sent`.

### Recommendation

The backend's schema is authoritative by the coordinator's own ruling that this lane builds on the
backend's deployed schema and that the backend merges first. So the UI lane moves on all four:
re-point the read to `paige_agreements` joined to `paige_agreement_signers`, drop the direct bucket
access in favour of `agreement-document`, and add a `partially_signed` state.

That is a real slice of work, not a rename, and it cannot be verified until the contract is
deployed. **Until it is done, this surface must not be described as meeting the backend contract,
and PR #1356 must not be marked ready.** Both are now stated in its body and in its evidence record.

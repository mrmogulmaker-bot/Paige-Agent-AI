# Platform Agreements & Signup Consent

Right now users can sign up with zero acknowledgment of any terms. Given the compliance posture (FCRA/CROA/GLBA, credit data, AI advisory output, multi-tenant operators, Stripe billing), that's a real exposure. Here's what to ship.

## 1. Legal Documents (drafted by legal sub-agent, reviewed by you)

Six documents, all versioned, all stored in-app at stable routes:

| Doc | Route | Who signs |
|---|---|---|
| **Terms of Service** | `/legal/terms` | Every user |
| **Privacy Policy** (GLBA-aligned) | `/legal/privacy` | Every user |
| **E-Sign Consent (ESIGN/UETA)** | `/legal/esign` | Every user |
| **AI Advisory Disclaimer** (not legal/financial/credit-repair advice; CROA §1679b safe harbor) | `/legal/ai-disclaimer` | Every user |
| **Credit Data Authorization** (FCRA §604 permissible purpose, soft-pull consent) | `/legal/credit-authorization` | Triggered when user first connects credit/uploads report |
| **Tenant/Operator MSA + DPA** | `/legal/tenant-msa`, `/legal/dpa` | Tenant owners only, on first tenant creation |

Drafts will use archetype phrasing (§116), Antonio Cook / Mogul Maker Academy as the legal entity, GA jurisdiction, plus the standard FCRA/CROA/GLBA carve-outs ("we are not a credit repair organization", "no guarantees of credit outcomes", etc.). **These are AI-drafted starting points — you should have an attorney review before going live, especially the CROA and DPA sections.**

## 2. Database

```
legal_documents (slug, version, title, body_md, effective_date, is_current)
legal_acceptances (user_id, document_slug, document_version, accepted_at, ip, user_agent, context)
```

- `legal_acceptances` is append-only — every accept writes a new row (audit trail).
- RLS: users see their own acceptances; admins see all.
- `legal_documents` readable by anon (public pages); writable by platform owner only.

## 3. Signup flow changes

- Add a single **required** checkbox to the signup form: *"I agree to the Terms of Service, Privacy Policy, E-Sign Consent, and AI Advisory Disclaimer"* with each phrase as a link opening the doc in a side drawer.
- Submit blocked until checked.
- On successful signup, write 4 rows to `legal_acceptances` (terms, privacy, esign, ai-disclaimer) with current versions, captured IP + UA.

## 4. Re-consent on version bumps

- `AppShell` checks on mount: if `current_version > latest accepted version` for any required doc, show a blocking **"Updated terms"** modal with diff summary + Accept button. No accept = can't use the app.
- Pulled into a `useRequiredConsents()` hook so it's testable.

## 5. Contextual consents

- **Credit Data Authorization** modal fires the first time a user uploads a credit report, connects a credit monitor, or runs a fundability scan. Blocks the action until accepted.
- **Tenant MSA + DPA** modal fires the first time a user creates a tenant (becomes Tenant Owner). Blocks tenant creation until accepted.

## 6. Admin surfaces

- `/admin/legal` — list documents, see current version, publish a new version (creates new row, marks old `is_current=false`, triggers re-consent sweep).
- Member profile drawer gains a **Consents** tab showing every acceptance with timestamp + IP for audit/dispute defense.

## 7. Footer + account

- Site footer: links to Terms, Privacy, AI Disclaimer.
- Account settings: "Your agreements" section showing accepted docs + dates, with download-as-PDF.

## Out of scope for this pass
- Cookie banner / GDPR cookie consent (separate concern; flag for later if you want EU traffic).
- Click-through SOC 2 / HIPAA BAA (not applicable yet).
- Per-jurisdiction variants (US-only for now).

## What I'll do after you approve
1. Spawn the legal sub-agent to draft all 6 documents in parallel.
2. Migration: `legal_documents` + `legal_acceptances` with RLS + GRANTs, seed v1 of each doc.
3. Build `/legal/*` public pages + `LegalDocViewer`.
4. Patch signup form (`Auth.tsx` or equivalent) with the required checkbox + acceptance writes.
5. Build `useRequiredConsents()` + `UpdatedTermsModal`, mount in `AppShell`.
6. Wire contextual modals for credit auth + tenant MSA.
7. Build `/admin/legal` page + Consents tab in member drawer.
8. Add footer links + account settings section.

Approve and I'll ship it end-to-end.
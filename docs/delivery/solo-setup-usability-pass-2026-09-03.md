# Solo Setup usability pass — 2026-09-03

Status: PARTIAL, local branch; not released. Authenticated Runtime Proof Owed.
Branch: `codex/solo-setup-usability-pass`.
Initial main: `5ceef64354ff500a1cfa4af501c13e69f5422484`.
Refreshed main: `44d1249f794cceeffbdcedb1dde0739d9d3407b9`.

## Owner outcome and scope

The owner can keep browser-filled facts, choose a country/state, use a ZIP suggestion,
select a NAICS result, and add/edit knowledge links and notes within the approved
five-tab Settings → Setup flow. The template applies to every standalone Solo;
there are no account-number or business-name conditions.

Classification: Solo department UI and behavior, tenant-owned business context.
No new PAIGE adapter, shared primitive, shared shell, Team access, or provider setup.
Flow-by-Flow and the approved Flow Prototype define the transitions; this pass
preserves the existing approved layout instead of introducing a new taxonomy.

## Diagnosis

- NAICS search was visible in read mode, but its results required global Edit mode;
  the parent also refused changes outside Edit. Search lacked typeahead.
- Knowledge Add/Edit controls were hidden unless the owner first entered global Edit.
  Existing links were plain text; document references had no URL control.
- A native browser-populated value without a React input event was not in the submitted
  draft. Save-only capture was insufficient: tab changes and NAICS search could rerender
  or unmount the controls first. An independent synthetic-browser reproduction caught this.
- Country and address region were free-text controls. Address copy was implementation language.
- Existing protected document-upload contracts cannot safely be reused for Setup (below).

## Delivered on this branch

- Capture mounted, enabled, authorized brief fields before input/click transitions,
  mouse/keyboard tab changes and Save. Explicit email override is captured separately.
  Cancel checks unreported autofill before discarding. Existing durable combined Setup
  save/reload adapter, revision conflict handling and server permissions are unchanged.
- Connected facts remain locked until explicit Override; Adopt keeps the stored source value.
  Browser-populated DOM values cannot bypass that source decision or the Owner-only field floor.
- Country names dropdown (249 ISO codes), U.S. state/territory dropdown, preserved legacy
  values, an empty choice, and manual region entry for non-U.S. countries.
- Debounced, cancellable U.S. ZIP lookup offers city/state choices. The owner applies a
  suggestion to the draft and then saves. It is not address validation or automatic truth.
  Only the ZIP goes to Zippopotam.us; credentials and referrer are omitted. No business
  identity, exact address or tenant ID is sent. Failed/no-match lookup keeps manual entry.
- NAICS typeahead, explicit connected-code replacement confirmation, stale-result guards,
  and read-mode selection that enters a saveable owner draft.
- Owner can open Add/Edit Knowledge directly. HTTPS website/document/catalog links can be
  stored and opened; references/notes remain editable. Drawer commit is explicitly a draft,
  not durable success. Failed save retains the draft for retry. No URL is fetched/ingested.
- Heading: “Business address.” Description: “Where your business is based.”

Reference behavior: [ZIP API documentation](https://docs.zippopotam.us/docs/v1/),
[ZIP data/availability](https://docs.zippopotam.us/docs/getting-started/),
[USPS postal abbreviations](https://pe.usps.com/text/pub28/28apb.htm).

## Flow coverage and evidence

| Flow | Evidence | Remaining proof |
| --- | --- | --- |
| First-use / populated / partial | Existing adapter and component tests; real component with synthetic data | Authenticated owner |
| Edit → autofill → search/tab → Save | Regression tests for DOM-only values, multiple fields, protected email, mouse/keyboard tabs | Real browser autofill/provider behavior |
| Country/state/ZIP | Dropdown, clear/legacy preservation, lookup sanitization, apply/save, country-change stale result tests | Production network availability and real owner save |
| NAICS query → choose → Save | Typeahead, stale response, source-confirmation and permission tests; isolated browser interaction | Production owner save/reload |
| Knowledge Add → draft → Save/failure/retry | Component tests, single-record retry, safe clickable URL | Production owner save/reload; direct upload not implemented |
| Cancel / conflict / pending / account cleanup | Existing combined adapter tests plus autofill discard and stale tests | Authenticated role/account-switch matrix |
| Layout | 88 structural samples, 4 supported viewports × both themes; extra ZIP/NAICS interactions and screenshots | Authenticated theme/runtime proof |

Automated: 67 focused tests passing at the latest code edit. Scoped lint/type ratchet and
production build passed before the final autofill event-capture repair; rerun on final head.
Type baseline: 13 existing errors, no additional errors at that check.
Rendered structural: no horizontal overflow, clipped inputs or browser runtime errors;
synthetic transport only. Native browser connector bootstrap failed due to a local sandbox
ACL helper failure. No authenticated profile/session was read or bypassed.
Independent review identified and drove repairs for tab loss, email capture, blank selection,
and search-triggered rerender. Final rereview is required before release.
Hosted CI, preview, production verification: NOT RUN for this new branch.

## Collision and preservation inventory

Read-only open-PR inventory found no current product overlap in the changed Setup component,
contract or new address helper. Fresh main changed other Solo/Team/Catalog/Rail surfaces,
not these Setup files. Deliberately untouched:

- `src/solo/settings.tsx`: active #674/#724 work.
- `docs/doctrine/surface-cards/setup.md`: active #731 work; use handoff below.
- #591 Knowledge/Chat isolation, head `2636d433799f731bfca8996df9a967251087a220`:
  no Chat, ingestion, package or shared knowledge edits.
- All Agency/sub-account/Operator/legacy Admin components, shared auth/resolvers,
  Team roles/membership, billing, existing buckets, PAIGE, Spine, Rail and Mind.

The Solo test harness is synthetic, non-production and now uses the correct
`registeredIsoCountry` fixture key. It intercepts ZIP requests rather than leaking fixture
data to a provider. It is not authenticated persistence evidence.

## Scoped exception requested — direct private attachments

NOT IMPLEMENTED; approval requested, pending. Links are not represented as file uploads.

Proposed shared database file: `supabase/migrations/20261105000000_solo_setup_private_attachments.sql`
(unused name at inspection; final timestamp must be generated under repository migration rules
and rechecked against current main/active branches before creation).
Proposed Solo adapter: `src/solo/data/useSoloSetupAttachments.ts`, plus Solo tests/Setup UI.
Shared surface: additive bucket-specific policies on `storage.objects`, a new private bucket
and Setup-owned attachment metadata/RPCs. No shared frontend module needs editing.

Why Solo cannot complete direct uploads without it:

| Existing path | Known consumers/surfaces | Boundary problem |
| --- | --- | --- |
| `tenant-knowledge` → `kb-ingest-file` | `TenantKnowledgeAdmin.tsx`, `/admin/tenant-knowledge`, `KnowledgePanel`/`PlaybookEditorInline`, `useSoloKnowledge`, Studio and PAIGE Chat | Existing member-write policy is broader than Setup Owner; upload sends content to extraction/embedding and shared KB consumers |
| `business-documents` | `DocumentUpload.tsx`, `DocumentsManager`, `BusinessDocuments`, `PersonalDocuments`, `BusinessDocumentsManager`, `FinancialDocsSection`/`BusinessInfrastructureAssessment`; `/admin/contacts/:id` reads records | User-ID paths are not active Solo-tenant ownership; current Workspace Owner/access revocation boundaries differ |

These existing shared consumers are not Solo-tier-restricted. Changing them could affect Agency,
sub-account, Operator, Admin and customer/portal users. Some legacy mounted routes are unverified;
no claim of exhaustive runtime route coverage is made.

Requested exception is only an additive, private Setup contract: server-enforced active Solo
tenant; Owner upload/replace/delete; authorized tenant-scoped reads; cross-tenant/anonymous denial;
immutable object keys; verified durable finalization; safe replacement without deleting the old
file first; cancellation/orphan cleanup. No public file URLs, automatic extraction/embedding,
provider configuration, Team access changes or model ingestion. Existing bucket policies and
all non-Solo behavior stay unchanged. Must check effective policy combinations, direct storage
API denial, and role/account switches—not just hidden buttons.

## Collision-safe four-part documentation handoff

1. **Destination:** Setup surface-card owner (#731), `docs/brain` state ledger and master reference.
2. **What changed:** the Solo UI/draft transitions listed above, not new durable schemas or model consumers.
3. **Truth/evidence:** branch-local PARTIAL; 67 focused automated tests at last code edit;
   rendered structural only; authenticated runtime/hosted release proof owed. Private upload awaits exception.
4. **Required follow-up:** reconcile the surface card/brain/master reference once the owning changes land;
   record actual release head and CI/deployment outcome; route the additive attachment decision to Setup;
   retain the deferred governed PAIGE/Spine/Rail/Mind handoff. Do not treat knowledge content as model input.

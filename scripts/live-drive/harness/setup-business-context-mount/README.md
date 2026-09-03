# Solo Setup structural render harness

Run from the repository root:

`node scripts/live-drive/setup-business-context-render.mjs`

This uses the actual Solo Settings route, shell, Setup component, and production
styles through the existing isolated Settings mount. Only the business-context
hook is replaced with explicitly synthetic in-memory data. The private Vite
configuration and entry are outside the production build graph. A fresh Chromium
context is created per viewport/theme; no user browser, cookies, authentication
stores, or credentials are accessed. The script owns and closes its local server.

## Evidence classification

- **Rendered structural:** five approved tabs in read and edit modes, plus the
  Paige brief drawer, at 1536x770, 1366x768, 1024x768, and 900x1000 in light/dark.
  The run requires 88 samples and exits nonzero for horizontal overflow, clipped
  form controls, or browser runtime errors. Screenshots and geometry are written
  to `scripts/live-drive/artifacts/setup-business-context-render/`.
- **Not covered:** durable database save, real email registration, source lookup,
  authentication, permission enforcement, provider integration, tenant isolation,
  production account switching, and PAIGE/Spine/Rail/Mind consumption. Those need
  their dedicated automated/database checks or authenticated owner acceptance.
- **Authenticated Runtime Proof Owed:** this harness never establishes LIVE owner
  capability. Its local save callback is synthetic and is not persistence proof.

## Approved field coverage review

The real component retains Business profile, People & email, Knowledge bucket,
Direction, and Paige brief. Identity/formation/protected-registration fields and
the structured address are consolidated in the profile; public name and DBA stay
distinct. Existing industry, SIC, regions, operating context, A2P representative
selection/contact/position, ownership records, and legacy voice/preferences/
boundaries remain available. Representation uses existing Team people; business
ownership does not mutate workspace membership or roles.

The richer Paige brief has all seven proposed profile dimensions and editable
voice examples. Knowledge retains the six proposed subject categories and four
source types. Documents/catalog entries are references, not upload/import proof.
Live voice extraction and downstream model ingestion remain proposed; the current
guided drawer edits an owner-reviewed draft. This is a declared MVP limitation,
not a claim that a model integration has been delivered.

# HTML→PDF Rendering: Microservice Decision (Lane C)

**Status:** Recommendation — for the integrator + owner to ratify.
**Date:** 2026-07-18
**Scope:** The **high-fidelity** HTML→PDF path only (a designed landing page / rich
template rendered *pixel-exact* by a real browser). This is a **separate concern** from
the in-band `pdf-lib` path (Lane A), which renders **structured** documents (reports,
proposals, invoices) inside the Deno edge function with no browser. Both ship; they serve
different jobs and neither replaces the other.

> **§13 honesty note:** Every cost or latency figure below that isn't a published list
> price is **labelled `[estimate]`**. Vendor list prices are cited with a source. Do not
> quote the estimates as vendor commitments.

---

## 1. Why this is a microservice at all (not in the edge function)

The Supabase edge runtime is **Deno**, and it cannot run a headless Chromium/Chrome
process — there is no way to launch a full browser binary inside the edge sandbox. So the
router's `doc-render` cell, for the *high-fidelity* case, must make an **outbound signed
HTTP call** to a browser-running service that:

1. accepts an HTML string (or a signed URL to fetch), plus render options (page size,
   margins, `printBackground`, timeout, byte cap);
2. renders it in a real Chromium via Playwright/Puppeteer's `page.pdf()`;
3. returns **PDF bytes** in the response body.

The **router remains the only writer**: it takes those bytes and persists them to the
private `studio-deliverables` bucket + `studio_deliverable` row, tenant-foldered, exactly
like every other modality (§9/§12). The microservice is a **pure, stateless renderer** —
it holds no tenant data, writes nothing, and has no Supabase credentials. That keeps the
blast radius small and the seam clean.

### The call contract (identical regardless of which option is chosen)

```
POST https://<render-host>/render/pdf
Headers:
  Authorization: Bearer <short-lived HMAC token minted by the edge fn>
  X-Paige-Tenant: <tenantId>              # for the service's own rate-limit/log only
  X-Paige-Request-Id: <uuid>
Body (application/json):
  { "html": "<!doctype html>…",           # tenant HTML, treated as UNTRUSTED
    "options": { "format": "Letter",
                 "margin": {...},
                 "printBackground": true,
                 "timeoutMs": 8000,
                 "maxBytes": 10485760 } }
Response: 200 application/pdf  (raw bytes)  |  4xx/5xx structured JSON error
```

The edge side is a thin `renderPdfViaService()` in `_shared/` that the `doc-render` route
cell calls; on **any** non-200, missing env, or network failure it returns the
`NeedsConfigError`/`needs_config` result (fail-closed, §13) — a rendering outage must
never fake a file or crash the router. This wrapper is **the same** whichever host we pick,
so the host decision is reversible: swap the base URL + auth, keep the contract.

---

## 2. The options

### Option 1 — Fly.io running a small Playwright service (self-hosted)

A tiny container (Node + Playwright, or `browserless/chromium` image) we own, deployed to
Fly, scaled to a handful of Machines with **scale-to-zero** or a warm floor of 1.

- **Setup effort:** Medium. Write a ~150-line Fastify/Express service, a Dockerfile
  (Playwright ships a maintained base image with Chromium + fonts), a `fly.toml`, wire the
  HMAC check + hardening (§4). One-time, but it's *our* code to maintain.
- **Cold-start latency:** With a **warm floor of 1 Machine**, effectively zero cold start;
  render itself ~**300–900 ms** for a typical page `[estimate]`. With scale-to-zero, a cold
  Machine boot + Chromium warm is ~**1.5–4 s** `[estimate]` on the first request after idle.
  Tunable: keep 1 warm for predictable latency, or accept scale-to-zero to save cents.
- **Ongoing cost:**
  - Chromium needs real RAM — plan a **shared-cpu-1x / 1–2 GB** Machine, not the 256 MB
    minimum. A single always-on 256 MB Machine is **~$1.94/mo** (Fly list price); a
    1 GB/1 CPU realistic production Machine lands around **$10–$20/mo** all-in (compute +
    small volume + IP) per Fly's own real-world guidance.
  - Low volume (hundreds of renders/mo): **~$5–$15/mo** `[estimate]` with scale-to-zero or a
    single small warm Machine.
  - Moderate volume (thousands–tens of thousands/mo): **~$20–$60/mo** `[estimate]` with 1–2
    warm Machines + autoscale bursts. **No per-render markup** — you pay for compute-seconds,
    not per-PDF, so unit cost keeps falling as volume rises.
- **Maintenance burden:** Highest of the three — it's our service. We patch Chromium/
  Playwright, watch the Machines, own the security config. But it's ~150 lines and the
  Playwright image does the heavy lifting; realistic burden is low-moderate.
- **Tenant-isolation / security:** **Best controllable posture.** Because we own the box we
  can enforce *every* §4 hardening control directly: run Chromium `--no-sandbox` **only**
  inside an already-locked-down container (better: keep the sandbox on with the right seccomp),
  block `file://` and private-IP navigation at the request handler *and* at the network layer
  (Fly private networking / egress rules), set hard CPU/mem/time limits per render, and kill
  the browser context after each job. Untrusted tenant HTML is the core risk (§4) and this is
  the option where we can fully mitigate it. Ephemeral per-request browser **contexts** (not
  full process reuse) give clean isolation between tenants.
- **Scalability:** Good. Fly autoscales Machines by region/load; horizontal scale is native.
  Not infinite-elastic like a hyperscaler, but far beyond our foreseeable volume.
- **How the router calls it:** Signed `POST /render/pdf` to the Fly app's internal/anycast
  URL as in §1.

### Option 2 — Browserless.io (hosted browser-as-a-service)

A managed endpoint (`/pdf` REST API or a Playwright/Puppeteer WebSocket) — no infra to own.

- **Setup effort:** **Lowest.** Sign up, get a token, point `renderPdfViaService()` at their
  `/pdf` endpoint. Could be live in an afternoon.
- **Cold-start latency:** No cold start we manage — their fleet is warm; render ~**0.4–1.2 s**
  `[estimate]`, plus network round-trip to their region. Concurrency is **capped by plan**
  (e.g. 3 concurrent browsers on the entry tier), which becomes the real latency ceiling
  under bursts, not cold starts.
- **Ongoing cost (unit-based, published):** A "Unit" = up to 30 s of browser time per
  connection.
  - **Free:** 1,000 units.
  - **Prototyping:** $25/mo billed annually (~$35 monthly) → 20,000 units, 3 concurrent.
  - **Starter:** $140/mo annually (~$200 monthly) → 180,000 units, 20 concurrent.
  - **Scale:** $350/mo annually (~$500 monthly) → 500,000 units, 50 concurrent.
  - A single quick PDF render is ~1 unit, so low volume fits Free/Prototyping; **moderate
    volume pushes you onto Starter/Scale fast**, and cost is **per-unit forever** — it does
    not amortize the way owned compute does. This is the option that gets *most* expensive at
    volume.
- **Maintenance burden:** **Lowest** — they patch Chromium, run the fleet, handle scaling.
  Near-zero ops for us.
- **Tenant-isolation / security:** **Weakest control, but not zero.** We are sending
  **untrusted tenant HTML to a third party** and trusting *their* sandbox to contain it. We
  cannot directly enforce our §4 network-layer controls (private-IP block, file:// block) —
  we depend on their configuration and their `blockAds`/request-interception features. Two
  real concerns: (a) a **data-egress/third-party-processing** consideration — tenant content
  leaves our perimeter (a §9 data-sovereignty question worth flagging to the owner); (b) SSRF
  via tenant HTML now runs on *their* network, which is their problem to contain but our
  reputational risk. Mitigable by pre-sanitizing HTML on our side before sending (strip
  `file://`, external `<link>`/`<script>` to private hosts, `<iframe>`), but we can't verify
  their internal isolation.
- **Scalability:** Excellent and elastic — bounded only by the concurrency your plan buys.
- **How the router calls it:** Signed call from the edge fn → their `/pdf` REST endpoint with
  our API token; bytes come back. (Their token, plus our own HMAC layer if we proxy.)

### Option 3 — Vercel serverless function + `@sparticuz/chromium`

A Vercel function bundling a Lambda-optimized Chromium (`@sparticuz/chromium` +
`puppeteer-core`) that renders on invocation.

- **Setup effort:** Medium-high, and **fiddly.** The `@sparticuz/chromium` + `puppeteer-core`
  pairing is notoriously version-sensitive; historically the Chromium binary blew past
  Vercel's **250 MB unzipped function limit**, forcing `@sparticuz/chromium-min` +
  externally-hosted binary downloaded at cold start. *Note:* Vercel raised the function size
  limit to **5 GB on 2026-06-30** (opt-in via `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`, auto for new
  projects), which relaxes the bundling pain — but the version-matching fragility remains a
  real maintenance tax.
- **Cold-start latency:** **Worst.** Cold start pays function boot **+** Chromium
  decompress/launch; commonly **2–6 s** `[estimate]` cold, dropping to ~1 s warm. Bursty,
  low-frequency rendering (exactly our pattern) keeps hitting cold starts.
- **Ongoing cost:** Cheapest at trivial volume (Vercel free/hobby covers a little; Pro
  included compute covers moderate use), but **execution-time billed** — a multi-second
  Chromium render is a comparatively expensive invocation, and you also inherit Vercel's
  function **timeout limits** which a heavy page can exceed. Low volume ~**$0–$20/mo**
  `[estimate]`; moderate volume competitive with Fly but with worse latency.
- **Maintenance burden:** **High and brittle.** The community track record is a stream of
  "PDF suddenly stopped printing" breakages on Chromium/puppeteer/Vercel-runtime version
  bumps. This is the option most likely to silently regress — which is exactly the §5
  post-deploy runtime failure mode we're trying to *stop* owning.
- **Tenant-isolation / security:** **Middle-to-weak, and hard to harden.** It's our code
  (good), but it runs in Vercel's serverless sandbox where we have **less control over the
  network egress layer** than a Fly box — enforcing a private-IP navigation block and
  `file://` block is on us in-process, with no network-level backstop. Function reuse across
  invocations also risks state bleed if not carefully torn down.
- **Scalability:** Elastic (Lambda-style), good on paper — undercut in practice by cold
  starts and timeouts on heavy renders.
- **How the router calls it:** Signed `POST` to the Vercel function URL; bytes returned.

---

## 3. Side-by-side

| Criterion | **Fly.io Playwright (own)** | **Browserless.io (hosted)** | **Vercel + @sparticuz/chromium** |
|---|---|---|---|
| Setup effort | Medium | **Lowest** | Medium-high, fiddly |
| Cold start | ~0 warm / 1.5–4 s cold `[est]` | None we manage | **2–6 s cold** `[est]` |
| Cost — low volume | ~$5–15/mo `[est]` | $0 (Free) → $25/mo | ~$0–20/mo `[est]` |
| Cost — moderate volume | **~$20–60/mo, amortizes** `[est]` | $140–350/mo, **per-unit** | ~$20–?/mo, time-billed `[est]` |
| Maintenance | Highest (it's ours, but small) | **Lowest** | **High + brittle** |
| Tenant isolation control (§4) | **Best — full control** | Weakest (3rd-party trust + egress) | Middle, hard to harden |
| Untrusted-HTML SSRF mitigation | **Enforceable at app+network** | Depends on their config | App-level only, no net backstop |
| Data leaves our perimeter | **No** | **Yes** (§9 flag) | No |
| Scalability | Good | Excellent | Elastic but cold-start-bound |
| Regression risk (§5 post-deploy) | Low | Low | **High** |

---

## 4. Security hardening — REQUIRED regardless of which option wins

Tenant HTML is **untrusted input executed by a real browser** — the single most dangerous
part of this whole feature. A headless Chromium pointed at attacker-controlled HTML is an
**SSRF and local-file-read primitive** unless locked down. These controls are **mandatory**;
some are only *fully* enforceable on Fly (Option 1), which is a core reason for the
recommendation.

1. **Block `file://` and non-http(s) schemes.** Intercept every request the page makes;
   abort anything not `http:`/`https:`. Prevents `file:///etc/passwd`, `file:///proc/...`
   exfiltration into the rendered PDF.
2. **Block private / link-local / metadata IP navigation (SSRF).** Resolve and reject any
   navigation or subresource to RFC-1918 (`10/8`, `172.16/12`, `192.168/16`), loopback
   (`127/8`, `::1`), link-local (`169.254/16` — including the **cloud metadata endpoint
   `169.254.169.254`**), and `.internal`/private DNS. Reuse the repo's existing
   `_shared/ssrfGuard.ts` posture — do **not** fork a second SSRF check (§12/§18). On Fly,
   back this with **egress network rules** so a bypass in app code still can't reach the
   private net.
3. **Sandbox on.** Never run Chromium `--no-sandbox` on a shared/serverless host. On Fly,
   run inside a hardened container with the Chromium sandbox enabled (or a strict
   seccomp/user-namespace profile). Treat `--no-sandbox` as a red flag in review.
4. **Disable JS where the template doesn't need it.** Direct-response PDF templates are
   mostly static; render with JavaScript **disabled by default**, opt-in only for templates
   that provably require it. Removes the entire script-driven SSRF/exfil surface for the
   common case.
5. **Hard timeouts + resource caps.** Per-render wall-clock timeout (e.g. **8 s**), max page
   count / navigation count, and a **CPU + memory cap** on the browser process so a
   malicious `while(true)`/billion-laughs page can't wedge the service.
6. **Output size cap.** Reject/return `needs_config` if the produced PDF exceeds a cap
   (e.g. **10 MB**) before it's ever streamed back to the router for persistence.
7. **Ephemeral, per-request browser context.** New incognito `BrowserContext` per render,
   destroyed after — never reuse a context across tenants (state/cookie/cache bleed).
8. **Strip dangerous HTML before render (defense in depth).** On the edge side, before
   sending, remove/neutralize `<iframe>`, external `<link rel>`/`<script src>` to
   non-allowlisted hosts, and any `file:`/`data:` resource refs. Belt *and* braces with #1–#2.
9. **Signed, short-lived internal auth.** The render endpoint accepts only requests bearing
   a short-TTL HMAC token minted by the edge function (not a static shared secret in the
   clear). Rate-limit per tenant. The service is **not** publicly renderable.
10. **No credentials on the renderer.** The microservice holds **zero** Supabase keys and
    writes nothing — the router is the only writer to `studio-deliverables` (§9). Compromise
    of the renderer yields no tenant data at rest.

---

## 5. Recommendation

**Primary: Option 1 — a self-hosted Fly.io Playwright microservice, with a warm floor of 1
Machine and scale-to-zero above it.**

Reasoning, weighted to our doctrine:

- **Security is the deciding axis, and §13/§9 make it non-negotiable.** Untrusted tenant
  HTML in a real browser is the highest-risk surface in this feature. Option 1 is the only
  choice where we can enforce **every** §4 control — including a **network-layer** SSRF/
  private-IP backstop and keeping tenant content **inside our perimeter** — instead of
  trusting a third party's sandbox (Option 2) or fighting a serverless egress model with no
  network backstop (Option 3). "Best-in-class engineering" (§13) here means owning the
  containment, not outsourcing it.
- **Cost amortizes the right way.** Fly is per-compute-second, so unit cost *falls* as the
  platform grows (§17 margin discipline). Browserless is per-unit **forever** and gets most
  expensive exactly when we succeed. At our pre-launch/low volume Fly is ~$5–15/mo `[est]`;
  at scale it stays double-digit while Browserless heads to $140–500/mo.
- **Lowest regression risk (§5).** The Playwright base image + our ~150 lines is stable;
  Option 3's `@sparticuz/chromium` version-matching fragility is the exact silent-runtime-
  breakage pattern the mandatory post-deploy scan exists to stop us from shipping.
- **Reversible.** The `renderPdfViaService()` contract (§1) is host-agnostic — if Fly ops
  ever outweigh the benefit, we swap the base URL to Browserless in one change. So choosing
  Fly does not lock us in; choosing Browserless *first* would leave the harder security work
  undone.

**Fast-path caveat (pragmatic, honest):** If shipping *today* matters more than the ops
setup, **Browserless (Option 2) is a legitimate bridge** — lowest setup, live in an
afternoon — **provided** we (a) pre-sanitize HTML on our side (§4 #8, #1–#2 at the edge
before sending) and (b) explicitly flag to the owner that **tenant HTML leaves our
perimeter to a third party** (a §9 data-sovereignty decision that is the owner's call, not
ours to make silently). Treat it as a **temporary** renderer behind the same
`renderPdfViaService()` seam and migrate to Fly when there's a moment to stand it up.

**Reject Option 3 (Vercel + @sparticuz/chromium)** for this use case: worst cold starts on
our bursty pattern, the most brittle maintenance story, and the hardest security posture to
harden (no network-layer egress backstop) — it combines Option 1's "it's our code" burden
with Option 2's weaker isolation, and adds a documented history of silent breakage.

**Sequencing note for the integrator:** none of this blocks Lane A. The `pdf-lib` structured path
is **already LIVE** in the `doc-render` cell (it serves pdf/docx/pptx/epub from structured content
today). This microservice is a SEPARATE, ADDED branch for *high-fidelity HTML→PDF*, not a stub to
swap in: the router already routes an explicit `html`/`mode:"html"` request to a clean `needs_config`
degrade (never a literal-tag PDF), and standing up the Fly service + the `renderPdfViaService()`
wrapper + §4 hardening simply replaces that one degrade with a real render. Fail-closed until proven
(§13) — the HTML-fidelity path returns `needs_config`, never a faked PDF, while this is unbuilt.

---

## Sources

- [Browserless pricing](https://www.browserless.io/pricing) · [Unit-based pricing](https://www.browserless.io/blog/unit-based-pricing)
- [Fly.io resource pricing](https://fly.io/docs/about/pricing/) · [Fly.io real app costs (Deploy Handbook)](https://deployhandbook.com/pricing/fly-io)
- [Vercel function 250MB→5GB limit](https://vercel.com/kb/guide/troubleshooting-function-250mb-limit) · [Vercel function limits](https://vercel.com/docs/functions/limitations) · [Rendering PDFs on Vercel with @sparticuz/chromium](https://www.ventura-digital.de/blog/rendering-pdfs-on-vercel-with-nextjs)

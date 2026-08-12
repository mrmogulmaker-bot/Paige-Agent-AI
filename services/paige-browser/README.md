# Paige Browser

A self-hosted, warm-browser Playwright service that gives Paige **eyes to self-verify her own
deployed platform**. (Warm within an active window: the machine scales to zero on idle
[`auto_stop_machines = "suspend"`], so the first call after an idle period pays a resume; the warm
browser then serves subsequent calls in that window without a per-call cold start.) Instead of asking the owner to eyeball a shipped surface (the §32.c
owner-owed live-walk), Paige drives the surface here and reads back an **honest structured
observation** — final URL, HTTP status, page title, a tag-stripped text excerpt, per-step results,
and a screenshot. This is the browser **host**; the tenant-scope resolution + ledger write + Paige's
interpreter dispatch live in the calling edge function (later slices).

## Why a NEW service (not the two browser seams we already have) — §18

This is a deliberately distinct home from **both** existing browser seams:

- **`services/visual-renderer`** is a *stateless screenshot-one-thing* service (`url`/`html` → PNG).
  paige-browser is the **opposite shape**: it **drives and observes**, returning a structured JSON
  observation, not a bare image.
- **`supabase/functions/browser-use`** is a *Browserbase* (3rd-party) stateful stub — an edge
  function can't drive Playwright itself. paige-browser is **self-hosted real Playwright** (§34
  moat: tenant session tokens will eventually flow through this host in a later slice, so it must
  **not** be a third party).

It also shares no state and holds **no Supabase credentials** — the host is **DB-free by
construction** (§9/§34). The eyes never hold tenant data; the caller resolves scope and records the
run.

## Slice 1a scope (what this is, and what it is NOT — honest, §13)

- **Self-verify only.** READ-ONLY navigation + observation.
- **NO tenant authentication.** That is Slice 4.
- **NO interpreter dispatch.** That is Slice 1b (the calling edge function).
- **Read-only steps only.** `assertSelector` / `assertText` / `readText`. Any click / submit / type /
  download step is **rejected with an honest error**, never run silently — write/interact steps are
  gated behind the §16 autonomy clamp in a later slice.

## Endpoints

`/self-verify` requires the `X-Browser-Secret` header to equal `PAIGE_BROWSER_SHARED_SECRET`
(timing-safe compare). No secret set → the service returns **500** (fails closed, never runs
unauthenticated).

| Method + path       | Body                                                    | Returns          |
| ------------------- | ------------------------------------------------------- | ---------------- |
| `GET  /healthz`     | —                                                       | `200 ok`         |
| `POST /self-verify` | `{ url, viewport?, waitForSelector?, waitMs?, steps? }` | `200` JSON below |

`steps` (all **read-only** in Slice 1a): each `{ kind, selector?, text? }` where `kind` is one of:

- `assertSelector` — `{ selector }` → is the element present?
- `assertText` — `{ text, selector? }` → does the element's text (or the page body) contain `text`?
- `readText` — `{ selector? }` → return the element's text (or the page body text), capped.

**Success (`200`):**

```json
{ "ok": true, "url": "…", "final_url": "…", "http_status": 200, "title": "…",
  "text_excerpt": "… (<=2000 chars, tag-stripped)", "screenshot_b64": "…png…",
  "steps": [{ "kind": "assertSelector", "ok": true, "detail": "…" }], "duration_ms": 1234 }
```

**Failure (still `200`, `ok:false` — the caller always needs the structured result, §13/§32):**

```json
{ "ok": false, "url": "…", "error": "navigation failed: …",
  "http_status": null, "screenshot_b64": "…whatever rendered (visible fallback)…", "duration_ms": 1234 }
```

A nav error, timeout, or blocked host returns `ok:false` (never a 5xx), with a screenshot of whatever
did render as a **visible fallback** and a **loud `console.error`** naming the real cause — never a
silent blank.

## Security posture

- **Shared-secret gated**, timing-safe. No secret → 500 (fails closed).
- **SSRF egress guard (Fork 7, non-negotiable).** Every request the browser makes — the top-level
  URL **and** every sub-resource — is filtered against private / link-local / cloud-metadata ranges
  via a DNS-resolving, **fail-closed** `page.route("**/*")` interceptor. The `final_url` is
  **re-checked public after redirects**, so a public start URL can't 30x into internal
  infrastructure. This is the same guard verbatim as `services/visual-renderer`.
- **Concurrency + timing caps.** A soft in-process concurrency cap
  (`PAIGE_BROWSER_MAX_CONCURRENT`, default 3) returns `429 { ok:false, error:"busy, retry" }` over
  the cap; a per-run nav timeout (`PAIGE_BROWSER_NAV_TIMEOUT_MS`, default 30000) and an overall hard
  run cap (`PAIGE_BROWSER_RUN_CAP_MS`, default 45000) bound each call.
- **DB-free.** Holds no Supabase creds and writes no rows.

## Secrets

- **On this service (Fly):** `PAIGE_BROWSER_SHARED_SECRET` — the shared secret the caller presents in
  `X-Browser-Secret`.
- **On the caller side (Slice 1b edge function, owed when that lands):** `PAIGE_BROWSER_URL` (this
  service's public URL, e.g. `https://paige-browser.fly.dev`) and `PAIGE_BROWSER_SECRET` (the same
  value set above).

## Local smoke test (proves the observe engine runs — §32)

```bash
cd services/paige-browser
npm install
node smoke.mjs          # launches Chromium, drives inline HTML, asserts an honest observation
```

In the sandbox the pre-installed Chromium is at `/opt/pw-browsers/`; `smoke.mjs` auto-detects it and
falls back to Playwright's own resolution elsewhere. Chromium outbound network is blocked in the
sandbox, so the smoke test drives inline HTML via `setContent` — the same code path `observe()` runs
after navigation. It also proves the **honest failure path** (a missing selector → `ok:false` with no
throw). Driving a live `https://` URL (the `page.goto` path) is exercised once deployed to Fly, where
outbound network is open.

## Deploy (Fly.io) — run once, then it's a `fly deploy`

Prereqs: a Fly account + `flyctl` authenticated (`fly auth login`).

```bash
cd services/paige-browser

# First time only — create the app (name matches fly.toml).
fly apps create paige-browser              # skip if it already exists

# Set the shared secret the caller will send (generate a strong random value).
fly secrets set PAIGE_BROWSER_SHARED_SECRET="$(openssl rand -hex 32)" --app paige-browser

# Deploy.
fly deploy --app paige-browser

# Grab the public URL (e.g. https://paige-browser.fly.dev) and the secret you set, then register them
# as Supabase edge-function secrets so the Slice 1b caller can reach this host:
#   PAIGE_BROWSER_URL     = https://paige-browser.fly.dev
#   PAIGE_BROWSER_SECRET  = <the same value you set above>
```

## Dormant until deployed + secrets set (honest, §13)

Like `services/visual-renderer`, this service does nothing until it's deployed to Fly and its secret
is set. With `PAIGE_BROWSER_SHARED_SECRET` unset it returns 500 on `/self-verify` (fails closed,
never runs unauthenticated). The Slice 1b caller degrades honestly when `PAIGE_BROWSER_URL` /
`PAIGE_BROWSER_SECRET` are unset — it never fabricates an observation. The Dockerfile pins the
Playwright base image (`mcr.microsoft.com/playwright:v1.56.1-jammy`, the **same** version as
`services/visual-renderer` and the root live-drive devDep — §18) so browser and library versions
always match. The `playwright` npm pin is EXACT (`1.56.1`, not a caret) so npm can never drift
ahead of the image (Task #126 §32.c finding #2).

## Redeploy

Just `fly deploy --app paige-browser` after any change here.

# Paige Visual Renderer

A tiny Playwright screenshot service that gives Paige's Studio design agent **eyes**. The design
agent renders its own generated artifact here, screenshots it, and feeds the PNG to Claude vision so
it **sees** what it built before marking it done (CLAUDE.md §25 "see it before you ship it", §33 the
visual-critique loop). This is the renderer half; the critique half is the
`studio-visual-critique` edge function.

## Why a standalone Fly service (not Vercel serverless Chromium)

A visual-critique loop screenshots the same artifact several times as it iterates. Serverless
Chromium pays a cold-start (and a fresh browser launch) on every call, which makes an iteration loop
slow and expensive. This service keeps **one warm browser** alive across calls (`getBrowser()`), so
the 2nd–Nth screenshot in a loop is cheap. Fly `auto_stop_machines = "suspend"` with
`min_machines_running = 0` means it costs nothing when idle and warms on the first request.

## Endpoints

Both render endpoints require the `X-Renderer-Secret` header to equal `FLY_RENDERER_SHARED_SECRET`.

| Method + path      | Body                                              | Returns     |
| ------------------ | ------------------------------------------------- | ----------- |
| `POST /render`      | `{ url, viewport?, waitForSelector?, waitMs? }`   | `image/png` |
| `POST /render-html` | `{ html, viewport?, waitMs? }`                    | `image/png` |
| `GET  /healthz`     | —                                                 | `200 ok`    |

`/render-html` lets the agent preview **not-yet-deployed** generated code (set the HTML directly)
without needing a live URL first.

## Security posture (foundation)

- **Shared-secret gated.** Every render call must present `X-Renderer-Secret`. No secret set →
  the service returns 500 (fails closed, never renders open).
- **SSRF note.** `/render` will fetch any `http(s)` URL it's given. The control today is the shared
  secret — only the `studio-visual-critique` edge function holds it, and it only ever passes Studio
  artifact URLs. If this service is ever exposed more widely, add an allowlist of renderable hosts
  before that happens. Tracked as a hardening follow-up, not shipped open.
- **Viewport clamped** to 320–2000px each axis; JSON body capped at 8mb; per-call timeouts bounded.

## Local smoke test (proves the render engine runs — §32)

```bash
cd services/visual-renderer
npm install
node smoke.mjs          # launches Chromium, renders inline HTML, asserts a non-empty PNG
```

In the sandbox the pre-installed Chromium is at `/opt/pw-browsers/`; `smoke.mjs` auto-detects it and
falls back to Playwright's own resolution elsewhere. Chromium outbound network is blocked in the
sandbox, so the smoke test renders inline HTML via `setContent` — the same code path `/render-html`
uses. Rendering a live `https://` URL (the `/render` path) is exercised once the service is deployed
to Fly, where outbound network is open.

## Deploy (Fly.io) — run once, then it's a `fly deploy`

Prereqs: a Fly account + `flyctl` authenticated (`fly auth login`).

```bash
cd services/visual-renderer

# First time only — create the app (name matches fly.toml).
fly apps create paige-visual-renderer     # skip if it already exists

# Set the shared secret the edge function will send (generate a strong random value).
fly secrets set FLY_RENDERER_SHARED_SECRET="$(openssl rand -hex 32)" --app paige-visual-renderer

# Deploy.
fly deploy --app paige-visual-renderer

# Grab the public URL (e.g. https://paige-visual-renderer.fly.dev) and the secret you set, then
# register them as Supabase edge-function secrets so studio-visual-critique can reach the renderer:
#   VISUAL_RENDERER_URL     = https://paige-visual-renderer.fly.dev
#   VISUAL_RENDERER_SECRET  = <the same value you set above>
```

Set the two Supabase secrets in the dashboard (Project Settings → Edge Functions → Secrets) or via
the Supabase CLI. The `studio-visual-critique` function reads `VISUAL_RENDERER_URL` /
`VISUAL_RENDERER_SECRET`; with them unset it degrades honestly (returns a `needs_config` result, never
a fabricated critique — §13).

## Redeploy

Just `fly deploy --app paige-visual-renderer` after any change here. The Dockerfile pins the
Playwright base image (`mcr.microsoft.com/playwright:v1.48.0-jammy`) so the browser and library
versions always match.

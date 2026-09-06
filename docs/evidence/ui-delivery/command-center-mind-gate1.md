# UI delivery evidence — Command Center → Mind (Gate 1 prototype)

**Surface:** Solo Command Center → Mind subtab (redesign).
**Deliverable:** clickable interactive prototype for owner visual approval (Gate 1). **No production UI changed.**
**Artifact:** `docs/prototypes/command-center-mind-gate1.html` (self-contained single file; no network beyond fonts).
**Direction (owner, this session):** the Mind hero is a **living 3D knowledge orb** (per the owner's reference
image), rendered with **real WebGL three.js** — an *instrument* embedded in the Mind workspace, not a
full-screen novelty. The record list, provenance, evidence inspector, states and memory-governance honesty
layer are all preserved around it. Fit-to-viewport, **no page scroll** (laptop / tablet / mobile).
**Jurisdiction (§00):** CC ports the owner's brief + reference image onto the installed `--pg-*` pack
(Mineral = light, Obsidian = dark) and the installed three.js skill pack. Zero CC design taste. The
measurements below are WORKS facts (does it render / run / degrade / stay in scope), never taste verdicts.

## The 3D engine (real three.js, bundled self-contained)

- **Source:** `docs/prototypes/_build/orb-entry.mjs` → esbuild IIFE bundle
  `docs/prototypes/_build/orb.bundle.js` → inlined into the delivered HTML by
  `docs/prototypes/_build/build.mjs`. Rebuild: `node_modules/.bin/esbuild docs/prototypes/_build/orb-entry.mjs
  --bundle --format=iife --minify --outfile=docs/prototypes/_build/orb.bundle.js && node docs/prototypes/_build/build.mjs`.
- **Stack:** `three@0.169.0` + addons (`OrbitControls`, `EffectComposer`/`RenderPass`/`UnrealBloomPass`/
  `OutputPass`, `RoomEnvironment`/`PMREMGenerator`), built with the installed **`alton47/threejs-skills`**
  pack (pinned `@7b8e256`, MIT — the `threejs-core`, `-materials`, `-lighting`, `-camera`,
  `-postprocessing`, `-performance`, `-shaders` skills). No new runtime dependency ships in the artifact —
  the bundle is inlined, §22 ("bundle three, don't CDN it").
- **What renders:** a fresnel-glass globe with a lat/long lattice, tilted glowing orbital rings (per-signal
  tint), a faceted luminous **gold** core (the act moment), **source-coloured instanced record nodes**,
  same-domain **constellation links**, drifting decorative dust, PBR lighting + `RoomEnvironment`, and real
  `UnrealBloom`. Calm continuous idle auto-rotation that **never resets on a data/theme change**;
  `OrbitControls` drag + scroll + keyboard; a **Reset view** control re-centres and clears focus.
- **Honesty (§13):** node colour + position carry a record's **canonical source STATE**; the engine renders
  *presentation* and never fabricates activity. The page owns every honesty label, the drawer, the states,
  and the fallback.

## Evidence classes (paige-ui-design) — SEPARATED (§70/§32)

| Class | Result |
|---|---|
| Automated | Headless Playwright render + behavioural asserts, **WebGL via SwiftShader**, across the full matrix (below). All asserts pass. Driver: `docs/prototypes/_build/render-orb3d.mjs`. |
| Static | Self-contained HTML; token values lifted verbatim from `design-system-port.md`; engine bundled from pinned three@0.169. |
| Rendered | 21 frames at all Solo viewports × Mineral/Obsidian + states + focus/search/drawer/reduced-motion + the WebGL-off fallback. |
| Behavioural | Orb paints in every mode; focus/reset/pause/search/keyboard-orbit; drawer open→focus→Esc→return; WebGL-off → governed-records fallback with a working drawer. All exercised headless. |
| Authenticated runtime | **UNVERIFIED — N/A at prototype stage.** This is a standalone prototype consuming NO live contract. Production wiring + authenticated proof (§32.c/§70.1) are owed at the production-port slice. |

## §32 proof — a green build is not a working render (real numbers, SwiftShader)

Engine run (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`):
- `engineAvailable: true` · `fallbackHidden: true` · `mindNoScroll: true`.
- **Pixel-lit proof** (element screenshot decoded → lit-pixel fraction; the compositor path, not a
  `preserveDrawingBuffer` readback): dark **0.587**, light **1.0**, focused **0.528**, paused **0.587**,
  reduced-motion **0.584** — the orb genuinely paints in every mode (not a blank canvas).
- Behavioural: `calloutPressed: true` (focus a domain), `resetClearedFocus: true`, `paused: true`,
  `drawerOpened: true`, `focusOnClose: true`, `drawerClosedEsc: true`, `keyboardOk: true`.
- Console errors: **only** the two sandbox font `ERR_CONNECTION_RESET` (progressive-enhancement fonts
  behind the proxy; the pack's real fallback stacks render correctly). No page errors.

WebGL-disabled run (`--disable-webgl --disable-webgl2`):
- `engineAvailable: false` · `fallbackShown: true` · `fallbackDomains: 6` · `drawerFromFallback: true` ·
  zero errors — the surface degrades to the governed-records list and stays fully usable. **Never blank.**

## Render matrix (headless Chromium + SwiftShader, deviceScaleFactor 1)

Viewports PAIGE-closed in BOTH themes: **1536×770, 1366×768, 1024×768, 900×1000, 390×844 (mobile)**.
PAIGE-open at 1536×770 (Obsidian). Frames: `scratchpad/orb3dshots/` (vp_*, paige_open_dark, state_*,
focus_domain, search, drawer_evidence, reduced_motion, fallback_webgl_off).

## States exercised

Populated · first-use empty · partial coverage (banner + trimmed data) · source unavailable (banner +
systems domain flips to Unavailable) · loading (overlay) · workspace switching (reset overlay) · evidence
drawer · reduced-motion (orb static, still fully rendered) · WebGL-off fallback (both a governed-records
list AND a working drawer).

## Defects found and fixed this session (§32/§39 — caught by measurement, not by a glance)

1. **Build-time bundle corruption.** The inliner used `String.replace(marker, bundle)`; the minified bundle
   contains `$&`/`` $` `` sequences, which `String.replace` interprets as special replacement patterns — it
   injected the marker text into the JS in 3 places, silently breaking the engine. Fixed: `build.mjs` uses
   `split(marker).join(bundle)` (no `$` substitution) + a guard that rejects a stray `</script>`.
2. **WebGL re-init crash.** Re-`init` on the *same* canvas after `forceContextLoss()` returns a null context
   → `Cannot read properties of null (reading 'precision')`; the surface fell back to the list even where
   WebGL worked. Fixed: each re-init swaps in a **fresh canvas** node (observers follow it); at most one live
   context, disposed cleanly. Verified across all scenarios × 2 rounds, zero errors.
3. **OrbitControls API mismatch.** `OrbitControls` r0.169 exposes `getAzimuthalAngle`/`getPolarAngle` but
   **no** `setAzimuthalAngle`/`setPolarAngle`; focus-a-domain and keyboard-arrow orbit threw. Fixed: orbit
   the camera via `THREE.Spherical` around `controls.target` (`orbitTo`/`orbitBy`, clamped polar range).

## Fidelity tuning to match the brief (WORKS, not taste — owner asked to "reveal internal structure")

The first dark-mode render's bloom washed out the internal lattice/nodes (lit fraction 0.76 — most of the
field blown to white). Tuned so the structure the owner asked to see actually reads: dark bloom
strength 0.9→0.6 / threshold 0.16→0.28; core emissiveIntensity 2.4→1.5; core halo opacity 0.9→0.55 &
scale 0.9→0.66; core PointLight 1.6→1.05. Re-render: lit fraction 0.587, with rings, distinctly
source-coloured nodes, and constellation links now visible; the gold core stays the single act accent.

## Performance / cleanup (§13/§22)

DPR capped at 2 · offscreen pause via `IntersectionObserver` + `document.hidden` · single live WebGL
context (fresh-canvas swap, never accumulating) · full `dispose()` frees every geometry/material/texture,
the instanced mesh, the ring materials, PMREM, env texture, composer, renderer + `forceContextLoss()` ·
reduced-motion (toggle **and** OS `prefers-reduced-motion`) holds the orb static but fully rendered.

## Accessibility

Canvas carries `role="img"` + a descriptive `aria-label` (states drag/scroll/Enter and that presentation
motion is not activity). Keyboard: arrows orbit, `+`/`-` zoom, `Enter` focuses the front record; a visible
**Reset view** button. Drawer moves focus to its close control and returns focus on Esc. A persistent
`aria-live` region announces focus/pause/reduced-motion/search/state changes. The WebGL-off fallback is
plain semantic buttons. (Owed: a real screen-reader pass; this was code + automated a11y checks.)

## Honest region → source map (annotation layer in the artifact)

Nothing is authenticated-runtime LIVE (Mind evidence via Rail/Spine does not flow for a real owner today).
Per-region verdicts + real sources are embedded in the prototype's annotation overlay. Key truths:
Knowledge & resources = LIVE(read) via `tenant_knowledge_docs`; Business identity = PARTIAL via
`business_context.readiness` (state + provenance, never the raw value); Client relationships & Operating
decisions = a governed memory seam exists (Release C: `record_paige_memory`/`get_paige_memory`/
`forget_paige_memory`, stored `proposed` until confirmed) but nothing writes to it from Mind/chat yet
("empty governed store"); durable change log = UNAVAILABLE (Rail unreadable from a browser). Fixture tenant
"Acme Advisory" is never a real owner account (§63). No pop-culture marks (§50). No finance/credit default
(§2). Gold spent only on the core/act (§11).

## §58 flag (unchanged, for owner sign-off)

This direction continues to **drop Systems Check findings from Mind** (Systems Check owns readiness/blockers;
four-surfaces boundary §00) and Mind links to Systems Check rather than duplicating it. The canvas-2D orb
engine from the prior commit is **replaced** by the real three.js engine — same public surface (search,
focus, pause, zoom, reduced-motion, drawer, states, fallback), higher fidelity; no capability removed.

## Owed / next

- Owner **visual approval (Gate 1)** before ANY production implementation (owner's explicit instruction for
  this surface).
- Production port: build the orb on the proven three.js/R3F landing-hero stack (§22/§30 — reference the
  technique, design surface-native), wire it to the real read contracts, coordinate the Command Center tab
  reorder with the other three subtab redesigns, preserve the `/command-center/mind` deep link.
- Authenticated runtime proof at production-port time (§32.c/§70.1) and a real screen-reader pass.

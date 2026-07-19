# Paige Vibe Studio — Pause State (2026-07-19)

A snapshot of where the Vibe Studio stands as of 2026-07-19, so the next session (or the owner)
can pick it up without re-deriving the state. Three buckets: **Shipped & live**, **In-flight
(this session)**, **Deferred / roadmap**. Honest per §13 — where something is owner-gated or
unverified, it says so.

---

## 1. Shipped & live (on `main`)

### The hero (the "video-game" moment, §22/§29)
- **The Composition Field → Paige particle hero.** The Studio hero is a real three.js/R3F
  surface (`StudioCompositionField.tsx`), NOT the old hand-rolled CSS cosmic field (stripped per
  §30). It loads the **real `paige-central.glb`** smooth-glass model, samples it with
  `MeshSurfaceSampler`, and runs a **50,000-particle deterministic cycle**: a starfield gathers →
  forms Paige's silhouette → solidifies into the glass character (real `MeshPhysicalMaterial`
  transmission glass + RoomEnvironment + 5 hairline rings + chin light + Bloom) → dissolves →
  scatters, on a ~14s loop. Reduced-motion renders a static-but-present frame.
- **APPROVED-FROZEN (§28):** the hero *alignment* (task #330) is owner-approved and change-blocked.
  The particle cycle itself was the last active hero work.
- **Crash-proof + smoke-tested (§32):** `scripts/studio-hero-smoke.mjs` runs the GLB-load +
  mergeGeometries + sampler + RoomEnvironment logic headless so a runtime throw is caught before
  ship. `StudioHeroScene`'s `SceneBoundary` now `console.error`s on a 3D throw instead of swallowing
  it silently (the root cause of the earlier "nothing renders" mystery).

### Facelift + motion (§27/§11/§23) — all shipped
- Slices A/B/C: `ArtifactPreview` primitive + real page/form/funnel previews; cinematic split
  build-cutscene; controls, elevation & ambient motion; light-mode parity; per-theme
  nebula/grain split (dark actually dark, light actually light, §23); real particle-rendered comet
  (§29); brand icon + "Studio BETA" chip.
- Composer is glassmorphic on the bare/HOME path (§28 geometry locked).

### Intelligence substrate (§26 Compound AI)
- **Prompt-forge + semantic memory** (task #320, shipped): `_shared/prompt-forge.ts` assembles
  generation prompts from versioned DNA templates + tenant brand tokens + the cheesy-tells guard,
  calls the ONE model seam, and remembers genuine successes as voyage-3/1024 vectors
  (`paige_prompt_memory`). 8 platform-default templates (coaching-generic, §2-clean).
- **Studio brain LEARN direction** (`studio-learn-from-artifact`): a published artifact feeds the
  tenant's own KB (§7/§15), confirm-gated (§15 autonomy).

### Session model
- One session per project; artifacts stream into the one session + the project rail (§21, no
  artifact-type tabs). Version-stacking + paged-document viewer shipped (#322). Re-hydrate saved
  artifacts on reopen (#290).

---

## 2. In-flight (THIS session, 2026-07-19)

### Visual-Critique Loop — the design agent's EYES (§25/§33) — **foundation shipping now**
The infrastructure that lets Paige's design agent *see* its own output and self-critique before
shipping (SHIP/ITERATE/BLOCK), so the owner stops catching flat/generic output by eye.

- **DONE + proven headless:**
  - `services/visual-renderer/` — Fly Playwright screenshot service. **Render engine proven**
    (`smoke.mjs` produces a real PNG from the pre-installed Chromium).
  - `supabase/functions/studio-visual-critique/index.ts` — the critique edge fn (fetch/render →
    Claude vision → verdict + findings → log). Pure logic (base64 chunking, critique JSON parse)
    smoke-tested in Node.
  - `_shared/visual-critique-gate.ts` — the generate→critique→iterate loop helper.
  - `model-router` — `vision-critique` Modality + a **frontier-only** route cell (Claude-vision
    only by construction) + a cost-estimate branch for the $2 cap.
  - `studio_visual_critique_log` migration (tenant-scoped RLS, mirrors `paige_prompt_memory`).
  - `paige-ai-chat` wiring at the `generate_image` seam — **GATED OFF** by
    `STUDIO_VISUAL_CRITIQUE_ENABLED` (default off = byte-for-byte no production change).
  - CLAUDE.md **§33** doctrine.
- **OWNER-GATED to activate (cannot be done from this headless env):**
  1. `fly deploy` the renderer (`services/visual-renderer/README.md` has the runbook).
  2. Set Supabase secrets `VISUAL_RENDERER_URL` + `VISUAL_RENDERER_SECRET` (+ `FLY_RENDERER_SHARED_SECRET` on Fly).
  3. Flip `STUDIO_VISUAL_CRITIQUE_ENABLED=true`.
  4. Then the live E2E (one real image generation runs the critique loop) can be verified.
- **Scope note:** image path works with no renderer (image already a raster). Page/funnel critique
  needs the renderer (they're blocks, not pixels) — that's the near-term extension, not shipped
  as a driven loop yet.

---

## 3. Deferred / roadmap (tracked, not this wave)

- **Page/funnel critique loop** — wire the render-then-critique path for `growth_page_generate` /
  `growth_funnel_generate` (needs the live Fly renderer first). (§33 phase 2.)
- **Studio §25 watch-items (#341):** dark-mode black-hole void may read too subtle; light control
  hover-tint follow-up.
- **Studio §22 fast-follow (#328):** server "kind-hint" for the build-cutscene forming skeleton.
- **Studio cleanup (#329):** remove dead `.studio-chip-glow` keyframe/class.
- **Studio autosave (#305):** debounced, dirty-tracked, truthful save-state in every session.
- **Studio project preview thumbnail (#295):** see prior work at a glance in the gallery.
- **Multi-page Studio redesign (#288)** + **concurrent build sessions (#235)**.
- **Vibe Studio → Lovable/Replit/Emergent-level app development (#293 north star, #274 roadmap).**
- **Model Router → capability/visual models (#231):** Paige picks best image model per subtask
  (Gemini/nano-banana, GPT-image), not Claude-only — the visual-critique router work (§33) is a
  step toward this multi-modal routing.
- **Studio's own brain (#310):** internal KB that learns from tenants and feeds generation.

---

*Owner reviews on the LIVE site (pre-launch, §4). This doc is the handoff, not the source of
truth — the code + task list are.*

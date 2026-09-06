# Mind orb — 3D engine build pipeline

Build tooling for the **Command Center → Mind** Gate-1 prototype's real three.js knowledge orb.
The delivered artifact is the single self-contained file `../command-center-mind-gate1.html`; these
files produce and verify the engine inlined into it.

## Files

| File | Role |
|---|---|
| `orb-entry.mjs` | The engine source. `window.MindOrb` — a fresnel-glass globe, tilted glowing rings, faceted gold core, source-coloured instanced record nodes, constellation links, PBR + `UnrealBloom`. Public API: `init · applyTheme · setData · focus · search · setZoom · setRunning · setReduced · reset · resize · dispose · setVisible · available · pickFront`. |
| `orb.bundle.js` | esbuild IIFE bundle of `orb-entry.mjs` + `three@0.169` (+ addons). Self-contained; committed so the HTML can be rebuilt without re-running esbuild. |
| `build.mjs` | Inlines `orb.bundle.js` into `../command-center-mind-gate1.src.html` at the `<!--ORB_BUNDLE-->` marker → writes `../command-center-mind-gate1.html`. Uses `split/join` (NOT `String.replace`, whose `$&` handling corrupts the minified bundle). |
| `render-orb3d.mjs` | Headless §32 proof: WebGL via SwiftShader, screenshots every viewport × theme × state, a pixel-lit assertion, behavioural asserts, and a forced-WebGL-off fallback run. |

## Rebuild (two steps)

```sh
# 1. bundle the engine (needs `three@0.169` in the repo node_modules)
node_modules/.bin/esbuild docs/prototypes/_build/orb-entry.mjs \
  --bundle --format=iife --minify --outfile=docs/prototypes/_build/orb.bundle.js

# 2. inline the bundle into the delivered self-contained HTML
node docs/prototypes/_build/build.mjs
```

## Verify (headless, no GPU required)

```sh
node docs/prototypes/_build/render-orb3d.mjs   # SwiftShader; prints the assertion report
```

## Provenance

Built with the installed **`alton47/threejs-skills`** pack (pinned `@7b8e256`, MIT). `three@0.169.0`.
No runtime dependency ships in the artifact — the engine is inlined (§22: bundle three, don't CDN it).
The engine renders **presentation**; node colour/position carry a record's canonical source state and it
never fabricates activity (§13). This is prototype tooling — a production port rebuilds the orb on the
proven three.js/R3F landing-hero stack (§22/§30).

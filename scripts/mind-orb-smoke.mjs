// PAIGE Mind orb — headless runtime smoke test.
//
// WHY THIS EXISTS (§32, mirroring studio-hero-smoke.mjs): the Mind orb's 3D scene is wrapped in a
// SceneBoundary (src/solo/mind-orb/MindOrbCanvas.tsx) that renders NOTHING on a runtime throw and
// routes to the parent's list fallback. `vite build`/`tsc` pass on code that then CRASHES at runtime,
// and the boundary hides it — so the orb just "falls back to the list" with no signal about why. This
// script RUNS the orb's crash-prone three.js env-construction path headless (no GL context needed) so
// a runtime crash there is caught BEFORE shipping, not discovered live.
//
// Scope note (§13 honesty): the orb loads NO GLB and runs NO surface sampler, so unlike the studio
// hero there is no model/sampler logic to smoke. Its GL-BOUND parts (WebGLRenderer, PMREM.fromScene,
// EffectComposer) genuinely require a browser GL context and are covered instead by the SceneBoundary
// + the jsdom "degrades to the record list when WebGL is unavailable" unit test. What CAN run without
// GL — and what a green tsc will NOT prove — is RoomEnvironment construction + dispose (the env baked
// into the reflection cube map, disposed right after PMREM consumes it in engine.ts). That dispose()
// call is exactly the kind of line that type-checks but can throw at runtime if the method is absent.
//
// Run:  node scripts/mind-orb-smoke.mjs
// Exit: 0 = the runtime env logic runs clean; non-zero = it would crash the orb (fix before shipping).
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

// engine.ts: `const roomEnv = new RoomEnvironment()` must construct without a renderer, with children
// (an empty env would bake a black reflection and the orb glass would read dead).
let roomEnv;
try {
  roomEnv = new RoomEnvironment();
  if (!roomEnv.children.length) fail("RoomEnvironment built with no children → reflection map would be empty");
  console.log(`✓ RoomEnvironment constructs (${roomEnv.children.length} children)`);
} catch (e) {
  fail("RoomEnvironment threw: " + e.message);
}

// engine.ts m1 fix: `roomEnv.dispose()` right after `pmrem.fromScene(roomEnv, ...)`. A missing/throwing
// dispose() type-checks green (three's Scene type carries dispose) but would crash the mount at runtime.
if (typeof roomEnv.dispose !== "function") fail("RoomEnvironment has no dispose() → engine.ts m1 cleanup would TypeError");
try {
  roomEnv.dispose();
  console.log("✓ RoomEnvironment.dispose() runs clean (engine.ts env cleanup)");
} catch (e) {
  fail("RoomEnvironment.dispose() threw: " + e.message);
}

console.log("\n✓✓ Mind orb env-construction logic runs clean — safe to ship.");
process.exit(0);

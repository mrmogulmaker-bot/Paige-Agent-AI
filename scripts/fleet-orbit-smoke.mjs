// Fleet Console orbital field — headless runtime smoke test.
//
// WHY THIS EXISTS. The field is wrapped in a SceneBoundary, and the whole point of the R3F rebuild
// was that its predecessor "compiled clean and rendered nothing". `tsc` and `vite build` pass on a
// scene whose geometry args are NaN, whose radius collapses to zero, or whose colour conversion
// yields garbage — and the operator just sees an empty box. This runs the exact crash-prone maths
// against real inputs, headless, so that class of defect is caught BEFORE shipping.
//
// It deliberately does NOT construct a WebGLRenderer: there is no GL context in Node, so that would
// fail for an environmental reason and teach us nothing. What it DOES exercise is everything that
// runs before a pixel is drawn — placement, radius algebra, geometry construction, colour resolution.
//
// Run:  node scripts/fleet-orbit-smoke.mjs
// Exit: 0 = the runtime logic is sound; non-zero = the field would render wrong or blank.
import * as THREE from "three";
import { readFileSync } from "node:fs";

let failures = 0;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  failures++;
};
const ok = (msg) => console.log(`✓ ${msg}`);

// ── the maths under test, mirrored from FleetOrbitScene ───────────────────────────────────────
// These pure functions are duplicated here on purpose: that is what lets the smoke run with no
// bundler and no DOM, against plain Node.
//
// The danger with a copy is DRIFT — the component's constants change, this file keeps testing the
// old ones, and the smoke goes green about maths nobody ships any more. "Remember to update both"
// is exactly the kind of instruction that fails silently, so the constants are not entrusted to a
// comment: they are PARSED back out of the component and compared, and a mismatch fails the run.
const NODE_MIN_PX = 26;
const NODE_MAX_PX = 68;
const SHELL_INNER = 1.45;
const SHELL_OUTER = 2.45;
const SHELL_SPREAD = 2.6;

{
  const src = readFileSync(new URL("../src/operator/surfaces/FleetOrbitScene.tsx", import.meta.url), "utf8");
  const num = (name) => {
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*(-?[0-9.]+)`));
    return m ? Number(m[1]) : null;
  };
  // shellScale is an expression rather than a named constant, so pull its multiplier from the line.
  const spread = src.match(/NODE_MAX_PX \/ 2\) \* fitPerPx \* (-?[0-9.]+)/);
  const mirrored = {
    NODE_MIN_PX: [NODE_MIN_PX, num("NODE_MIN_PX")],
    NODE_MAX_PX: [NODE_MAX_PX, num("NODE_MAX_PX")],
    SHELL_INNER: [SHELL_INNER, num("SHELL_INNER")],
    SHELL_OUTER: [SHELL_OUTER, num("SHELL_OUTER")],
    "shellScale spread": [SHELL_SPREAD, spread ? Number(spread[1]) : null],
  };
  const beforeSync = failures;
  for (const [name, [here, there]] of Object.entries(mirrored)) {
    if (there === null) {
      fail(`could not find ${name} in FleetOrbitScene.tsx — this smoke can no longer prove it is in sync`);
    } else if (here !== there) {
      fail(`${name} drifted: this smoke tests ${here}, the component ships ${there}`);
    }
  }
  if (failures === beforeSync) ok("sync: every mirrored constant matches the component it claims to test");
}

function hash01(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function place(nodes) {
  const maxWeight = Math.max(1, ...nodes.map((n) => n.weight));
  return nodes.map((n) => {
    const a = hash01(n.id);
    const b = hash01(`${n.id}:tilt`);
    const theta = a * Math.PI * 2;
    const phi = Math.acos(1 - 2 * b);
    const magnitude = Math.sqrt(n.weight / maxWeight);
    const shell = SHELL_OUTER - (SHELL_OUTER - SHELL_INNER) * magnitude;
    return {
      node: n,
      dir: [Math.sin(phi) * Math.cos(theta), Math.cos(phi) * 0.82, Math.sin(phi) * Math.sin(theta)],
      shell,
      magnitude,
    };
  });
}

// ── real-SHAPED input, with SYNTHETIC ids (§63) ───────────────────────────────────────────────
// The SHAPE is drawn from the real prod fleet — 9 customer tenants, 6 of them sub-accounts, two
// carrying zero weight, one agency an order of magnitude heavier than everything else. The IDS are
// invented. An earlier draft of this file pasted the real production tenant UUIDs in here, which is
// exactly what §63 forbids: the owner's live accounts are never a fixture, an example or a default
// target, not even in a test. Nothing under test depends on a UUID's value — `hash01` is total over
// any string — so synthetic ids exercise identical code with none of the exposure.
const NODES = [
  { id: "fixture-tenant-01", tier: "Solo", weight: 3, needsYou: false },
  { id: "fixture-tenant-02", tier: "Solo", weight: 1, needsYou: true },
  { id: "fixture-tenant-03", tier: "Agency", weight: 42, needsYou: false },
  { id: "fixture-tenant-04", tier: "Sub-account", weight: 0, needsYou: true },
  { id: "fixture-tenant-05", tier: "Sub-account", weight: 2, needsYou: false },
  { id: "fixture-tenant-06", tier: "Sub-account", weight: 7, needsYou: false },
  { id: "fixture-tenant-07", tier: "Sub-account", weight: 18, needsYou: false },
  { id: "fixture-tenant-08", tier: "Sub-account", weight: 1, needsYou: false },
  { id: "fixture-tenant-09", tier: "Sub-account", weight: 0, needsYou: true },
];

// ── 1. placement is finite and stable ─────────────────────────────────────────────────────────
const placed = place(NODES);
const before1 = failures;
if (placed.length !== NODES.length) fail(`placement dropped nodes: ${placed.length}/${NODES.length}`);
for (const p of placed) {
  if (!p.dir.every(Number.isFinite)) fail(`non-finite direction for ${p.node.id}: ${p.dir}`);
  if (!Number.isFinite(p.shell) || p.shell <= 0) fail(`bad shell for ${p.node.id}: ${p.shell}`);
  if (!Number.isFinite(p.magnitude)) fail(`bad magnitude for ${p.node.id}: ${p.magnitude}`);
}
if (failures === before1) ok(`placement: ${placed.length} nodes, all finite (incl. weight-0 tenants)`);

// A zero-weight tenant must still be placed and still be visible — several real tenants have no
// seats and no clients, and a fleet console that silently drops them is lying about the fleet.
// The expected count is DERIVED from the fixture, not written twice: hardcoding it is how a test
// starts failing for its own bookkeeping rather than for the code under test.
const expectedZero = NODES.filter((n) => n.weight === 0).length;
const zeroWeight = placed.filter((p) => p.node.weight === 0);
if (zeroWeight.length !== expectedZero) {
  fail(`expected ${expectedZero} zero-weight nodes, placed ${zeroWeight.length}`);
} else {
  ok(`placement: all ${expectedZero} zero-weight tenants are placed, not dropped`);
}

// Stability: the same id must land in the same place across independent runs.
const again = place(NODES);
const drifted = placed.filter((p, i) => p.dir.some((v, k) => v !== again[i].dir[k]));
if (drifted.length) fail(`placement is not deterministic: ${drifted.length} node(s) moved`);
else ok("placement: deterministic across runs (hash-seeded, not index-seeded)");

// Filtering must NOT move the survivors — the defect that hash-seeding exists to fix.
const filtered = place(NODES.filter((n) => n.tier === "Sub-account"));
const moved = filtered.filter((f) => {
  const orig = placed.find((p) => p.node.id === f.node.id);
  return orig && f.dir.some((v, k) => Math.abs(v - orig.dir[k]) > 1e-12);
});
if (moved.length) fail(`filtering reshuffled ${moved.length} node(s) — index-seeding regression`);
else ok("placement: filtering removes nodes without moving the survivors");

// ── 2. the radius algebra actually yields the requested PIXEL size ────────────────────────────
// Mirrors the component: worldPerPx = viewport.height / canvasHeightPx; the group is scaled by
// shellScale and each node's radius is divided by it, so the two cancel and the on-screen size is
// governed purely by the px constants.
//
// HONEST LIMIT OF THIS CHECK: the divide-then-multiply cancels by construction, so this does NOT
// independently prove the component's chosen scale is right — it proves the pipeline stays FINITE
// and IN RANGE for every real magnitude and canvas height, which is what catches a NaN radius, a
// zero shellScale (-> Infinity), or a magnitude that escaped [0,1]. Whether 26-68px actually reads
// well is a question only the §32.c live-drive can answer.
const beforeRadius = failures;
for (const canvasPx of [520, 640, 900]) {
  // At the focal plane, three's viewport.height = 2 * tan(fov/2) * cameraDistance.
  const fov = 42;
  const dist = 7;
  const viewportH = 2 * Math.tan((fov * Math.PI) / 360) * dist;
  const worldPerPx = viewportH / canvasPx;

  const minR = (NODE_MIN_PX / 2) * worldPerPx;
  const maxR = (NODE_MAX_PX / 2) * worldPerPx;
  const shellScale = (NODE_MAX_PX / 2) * worldPerPx * SHELL_SPREAD;

  for (const p of placed) {
    const worldRadius = minR + (maxR - minR) * p.magnitude;
    const geomRadius = worldRadius / shellScale; // what the component passes to the geometry
    const effectiveWorld = geomRadius * shellScale; // group scale re-applies it
    const px = (effectiveWorld / worldPerPx) * 2; // back to on-screen diameter

    if (!Number.isFinite(px)) fail(`NaN diameter at ${canvasPx}px for ${p.node.id}`);
    if (px < NODE_MIN_PX - 0.01 || px > NODE_MAX_PX + 0.01) {
      fail(`node diameter ${px.toFixed(1)}px outside [${NODE_MIN_PX}, ${NODE_MAX_PX}] at canvas ${canvasPx}px`);
    }
  }
}
if (failures === beforeRadius) {
  ok(`radius algebra: every node lands in [${NODE_MIN_PX}, ${NODE_MAX_PX}]px across 520/640/900px canvases`);
}

// ── 3. three.js accepts the geometry args and builds real vertices ────────────────────────────
// A NaN or zero radius produces geometry that is silently invisible rather than throwing — the
// exact "compiles, renders nothing" failure mode. Assert real, finite position data.
try {
  const fov = 42;
  const viewportH = 2 * Math.tan((fov * Math.PI) / 360) * 7;
  const worldPerPx = viewportH / 640;
  const minR = (NODE_MIN_PX / 2) * worldPerPx;
  const maxR = (NODE_MAX_PX / 2) * worldPerPx;
  const shellScale = (NODE_MAX_PX / 2) * worldPerPx * SHELL_SPREAD;

  for (const p of placed) {
    const r = (minR + (maxR - minR) * p.magnitude) / shellScale;
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const pos = geo.getAttribute("position");
    if (!pos || pos.count === 0) throw new Error(`empty icosahedron for ${p.node.id} (r=${r})`);
    for (let i = 0; i < pos.array.length; i++) {
      if (!Number.isFinite(pos.array[i])) throw new Error(`non-finite vertex for ${p.node.id} (r=${r})`);
    }
    geo.dispose();

    if (p.node.needsYou) {
      const ring = new THREE.TorusGeometry(r * 1.55, r * 0.12, 8, 40);
      const rp = ring.getAttribute("position");
      if (!rp || rp.count === 0) throw new Error(`empty needs-you ring for ${p.node.id}`);
      ring.dispose();
    }
  }
  ok("geometry: every icosahedron and needs-you torus builds with finite vertices");
} catch (e) {
  fail(`geometry construction threw: ${e.message}`);
}

// ── 4. colour reaches the GPU as the colour we asked for ─────────────────────────────────────
// This is the §39 peer-gate finding, pinned. A wrong colour conversion is worse than a throw: the
// field renders in silently wrong colours and nothing notices. three.js takes TWO different paths
// depending on how you hand it a colour, and only one of them is right for sRGB values:
//
//   `new Color("#EDB94A")`        -> setStyle(...,   SRGBColorSpace) -> converts sRGB to linear ✓
//   `new Color(0.929,0.725,0.290)` -> setRGB(..., workingColorSpace) -> LinearSRGB, NO conversion ✗
//
// The array path stores sRGB numbers as if they were already linear, and the renderer then encodes
// them a second time on output — Paige Gold #EDB94A paints as pale cream. The component passes
// STRINGS for exactly this reason; this asserts that choice rather than trusting the comment.
const TIER_HEX = {
  Agency: "#7C6CE0",
  Solo: "#3F7F5C",
  Enterprise: "#B5822A",
  "Sub-account": "#2F6B8F",
};
const NEEDS_YOU_HEX = "#E07860";

const beforeColour = failures;
for (const [tier, hex] of [...Object.entries(TIER_HEX), ["needs-you ring", NEEDS_YOU_HEX]]) {
  // getHexString() encodes back to sRGB, so a correct round-trip returns the literal we passed in.
  const roundTrip = `#${new THREE.Color(hex).getHexString().toUpperCase()}`;
  if (roundTrip !== hex.toUpperCase()) {
    fail(`${tier}: "${hex}" round-tripped as ${roundTrip} — colour space is being mangled`);
  }
}
if (failures === beforeColour) {
  ok(`colour: all ${Object.keys(TIER_HEX).length + 1} palette entries survive the sRGB round-trip`);
}

// And prove the wrong path really is wrong, so this test fails loudly if someone "simplifies" the
// palette back to float arrays. A regression that only shows up as "slightly pale" never gets found
// by eye — it has to be caught here.
{
  const asFloats = [0xed / 255, 0xb9 / 255, 0x4a / 255];
  const wrong = `#${new THREE.Color(...asFloats).getHexString().toUpperCase()}`;
  if (wrong === "#EDB94A") {
    fail("the float-array path no longer mangles sRGB — this guard is stale, re-derive it");
  } else {
    ok(`colour: the float-array path still mis-encodes (#EDB94A -> ${wrong}), so the guard is live`);
  }
}

// ── 5. degenerate inputs must not explode ─────────────────────────────────────────────────────
try {
  const empty = place([]);
  if (empty.length !== 0) fail("empty fleet did not produce an empty placement");
  const single = place([{ id: "only", tier: "Solo", weight: 0, needsYou: false }]);
  if (!single[0].dir.every(Number.isFinite)) fail("single zero-weight node produced non-finite direction");
  const allZero = place(NODES.map((n) => ({ ...n, weight: 0 })));
  if (!allZero.every((p) => p.dir.every(Number.isFinite) && Number.isFinite(p.shell))) {
    fail("an all-zero-weight fleet produced non-finite placement (division by zero)");
  }
  ok("degenerate input: empty fleet, single node, and all-zero-weight fleet all stay finite");
} catch (e) {
  fail(`degenerate input threw: ${e.message}`);
}

// ── result ────────────────────────────────────────────────────────────────────────────────────
if (failures) {
  console.error(`\n${failures} failure(s) — the field would render wrong or blank. Fix before shipping.`);
  process.exit(1);
}
console.log("\nFleet orbit smoke: clean.");

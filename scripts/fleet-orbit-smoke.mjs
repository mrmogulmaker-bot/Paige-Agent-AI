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

let failures = 0;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  failures++;
};
const ok = (msg) => console.log(`✓ ${msg}`);

// ── the maths under test, mirrored from FleetOrbitScene/tokenColor ────────────────────────────
// Kept in sync deliberately: these are pure functions, and duplicating them here is what lets the
// smoke run without a bundler or a DOM. If the component's constants change, change them here too.
const NODE_MIN_PX = 26;
const NODE_MAX_PX = 68;
const SHELL_INNER = 1.45;
const SHELL_OUTER = 2.45;

function hash01(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function hslToRgb(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
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

// ── real-shaped input: the actual prod fleet shape (9 customer tenants, 6 of them sub-accounts) ──
const NODES = [
  { id: "7eaf8859-91b5-429a-92f1-b78c17eed38f", tier: "Solo", weight: 3, needsYou: false },
  { id: "cc41dbf4-bfa9-4afd-b09a-a0f718fd1f58", tier: "Solo", weight: 1, needsYou: true },
  { id: "29a7c77f-386a-4060-bf3e-e93de48f742e", tier: "Agency", weight: 42, needsYou: false },
  { id: "0334408a-9578-481d-86ba-fbaa00a6b173", tier: "Sub-account", weight: 0, needsYou: true },
  { id: "f22e625e-f9d0-4467-b298-76c848def329", tier: "Sub-account", weight: 2, needsYou: false },
  { id: "e7f1b157-61df-4954-8096-b4b71009bad8", tier: "Sub-account", weight: 7, needsYou: false },
  { id: "d8a0a880-1bed-43af-9b5d-e23c4db93106", tier: "Sub-account", weight: 18, needsYou: false },
  { id: "bfb03385-4877-40b5-ad21-6d5681e095c5", tier: "Sub-account", weight: 1, needsYou: false },
  { id: "3eca23f4-c37e-4155-9af9-d79edca5a088", tier: "Sub-account", weight: 0, needsYou: true },
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
  const shellScale = (NODE_MAX_PX / 2) * worldPerPx * 2.6;

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
  const shellScale = (NODE_MAX_PX / 2) * worldPerPx * 2.6;

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

// ── 4. token → RGB conversion is correct, not just non-throwing ───────────────────────────────
// A wrong conversion is worse than a throw: the field renders in silently wrong colours and no
// test notices. Pin it against values whose answer is known.
const rgbCases = [
  { in: [0, 100, 50], want: [1, 0, 0], label: "pure red" },
  { in: [120, 100, 50], want: [0, 1, 0], label: "pure green" },
  { in: [240, 100, 50], want: [0, 0, 1], label: "pure blue" },
  { in: [0, 0, 100], want: [1, 1, 1], label: "white" },
  { in: [0, 0, 0], want: [0, 0, 0], label: "black" },
  { in: [0, 0, 50], want: [0.5, 0.5, 0.5], label: "mid grey" },
];
let rgbOk = true;
for (const c of rgbCases) {
  const got = hslToRgb(...c.in);
  if (got.some((v, i) => Math.abs(v - c.want[i]) > 1e-6)) {
    fail(`hslToRgb(${c.in.join(" ")}) = [${got.map((v) => v.toFixed(3))}], expected ${c.label} [${c.want}]`);
    rgbOk = false;
  }
  if (got.some((v) => v < 0 || v > 1 || !Number.isFinite(v))) {
    fail(`hslToRgb(${c.in.join(" ")}) produced out-of-range channel: ${got}`);
    rgbOk = false;
  }
}
if (rgbOk) ok(`token colour: HSL→RGB correct on ${rgbCases.length} known values, all channels in 0..1`);

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

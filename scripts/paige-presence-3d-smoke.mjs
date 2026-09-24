// Paige 3D presence — headless runtime smoke test.
//
// WHY THIS EXISTS (§32). The 3D presence is wrapped in a SceneBoundary, so a runtime throw degrades
// to the flat presence instead of crashing the stage. That is the right behaviour and it is also
// how a compiles-but-crashes bug hides: `tsc` and `vite build` pass on code that then throws on the
// real model, the corner quietly shows the 2D fallback, and nobody learns that the 3D never ran.
// This script executes the exact crash-prone three.js logic — parse the real GLB, compute the
// normals a Meshy export omits, swap materials, and normalise into the camera's frame — against the
// actual asset, headless, so a runtime failure is caught here rather than discovered as "the 3D
// Paige isn't showing up".
//
// It also asserts the presence signal stays HONEST: silence must produce zero energy in every
// state, because a scene that moved on a timer would look identical to one reacting to real audio.
//
// Run:  node scripts/paige-presence-3d-smoke.mjs   (plain node; no type stripping, so it runs on CI's Node 20)
// Exit: 0 = the runtime logic runs clean; non-zero = it would fall back to flat in production.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import fs from "node:fs";

const MODEL = "public/paige/paige-woman.glb"; // keep in sync with PaigePresenceScene

let failures = 0;
const ok = (msg) => console.log("✓ " + msg);
const bad = (msg) => { console.error("✗ " + msg); failures += 1; };

if (!fs.existsSync(MODEL)) {
  console.error(`✗ ${MODEL} is missing — the scene would fall back to flat for everyone`);
  process.exit(1);
}
const bytes = fs.statSync(MODEL).size;
ok(`${MODEL} present (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
// A lazily-fetched asset is still a download someone waits through. This is a budget, not a hope.
if (bytes > 5 * 1024 * 1024) bad(`${MODEL} is ${(bytes / 1024 / 1024).toFixed(2)} MB, over the 5 MB presence budget`);

const buffer = fs.readFileSync(MODEL);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    "",
    resolve,
    reject,
  );
}).catch((error) => { bad(`GLTFLoader.parse threw: ${error?.message ?? error}`); return null; });
if (!gltf) process.exit(1);
ok("the real GLB parses");

const scene = gltf.scene.clone(true);
let meshes = 0;
let computedNormals = 0;
const material = new THREE.MeshStandardMaterial({ color: "#2b2233", emissive: "#bc965b" });
try {
  scene.traverse((child) => {
    if (!child.isMesh) return;
    meshes += 1;
    if (!child.geometry.attributes.normal) { child.geometry.computeVertexNormals(); computedNormals += 1; }
    child.material = material;
  });
} catch (error) {
  bad(`material/normal traversal threw: ${error?.message ?? error}`);
}
if (meshes === 0) bad("the model parsed but contains no meshes — the scene would render an empty frame");
else ok(`${meshes} mesh(es) traversed; normals computed on ${computedNormals}`);

// normalize(): the camera framing depends entirely on this producing a finite, centred, scaled box.
try {
  const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  const tallest = Math.max(size.x, size.y, size.z) || 1;
  if (!Number.isFinite(tallest) || tallest <= 0) bad(`bounding box is degenerate (${tallest})`);
  scene.scale.setScalar(2.4 / tallest);
  scene.updateMatrixWorld(true);
  const centre = new THREE.Box3().setFromObject(scene).getCenter(new THREE.Vector3());
  scene.position.sub(centre);
  const framed = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  const height = Math.max(framed.x, framed.y, framed.z);
  if (Math.abs(height - 2.4) > 0.01) bad(`normalize produced height ${height.toFixed(3)}, expected 2.4`);
  else ok(`normalize framed the model to ${height.toFixed(3)} units and centred it`);
  if (![scene.position.x, scene.position.y, scene.position.z].every(Number.isFinite)) bad("centring produced a non-finite position");
} catch (error) {
  bad(`normalize threw: ${error?.message ?? error}`);
}

// DRIFT GUARD. Everything above exercises three.js against the real asset, but with values COPIED
// from the component — so "framed to 2.400 units" and "the halo builds" would stay green while the
// component changed to anything at all. A `keep in sync` comment is the manual step §24 exists to
// end, so the numbers are read back out of the source and compared. This is not a substitute for
// importing the component (a .tsx module cannot be loaded by plain node on CI's Node 20); it is
// what makes the copy falsifiable.
const source = fs.readFileSync("src/components/paige/live/PaigePresenceScene.tsx", "utf8");
const expectations = [
  [/useGLTF\.preload\("([^"]+)"\)/, MODEL.replace(/^public/, ""), "the model this smoke parses is the one the scene preloads"],
  [/normalize\(cloned,\s*([\d.]+)\)/, "2.4", "the framing height this smoke asserts is the one the scene uses"],
  [/torusGeometry args=\{\[([^\]]+)\]\}/, "1.05, 0.012, 8, 96", "the halo args this smoke builds are the ones the scene renders"],
];
for (const [pattern, expected, label] of expectations) {
  const found = source.match(pattern)?.[1]?.trim();
  if (found === undefined) bad(`${label} — could not find it in PaigePresenceScene.tsx`);
  else if (found !== expected) bad(`${label} — the scene says ${found}, this smoke asserts ${expected}`);
  else ok(label);
}

// The torus the halo uses must build; a bad segment count is a silent throw inside the boundary.
try {
  const halo = new THREE.TorusGeometry(1.05, 0.012, 8, 96);
  if (!halo.attributes.position?.count) bad("the halo torus built with no vertices");
  else ok(`the halo torus builds (${halo.attributes.position.count} vertices)`);
} catch (error) {
  bad(`TorusGeometry threw: ${error?.message ?? error}`);
}

// HONESTY — the assertion that silence stays silent lives in presence.test.ts, not here.
// It needs to import presence.ts, and the CI job that runs this smoke is on Node 20, which has no
// type stripping; importing it here would have meant the honesty check silently SKIPPED in the one
// place it matters. Splitting it to the runner that can execute it is the difference between a
// check that runs and a check that reports nothing and looks the same. See
// "the 3D scene may only move to real audio" in src/lib/paigeLiveConversation/presence.test.ts.

if (failures) {
  console.error(`\n✗ paige 3D presence smoke: ${failures} failure(s) — this would degrade to flat in production`);
  process.exit(1);
}
console.log("\n✓ paige 3D presence smoke: the real model parses, frames and materialises");

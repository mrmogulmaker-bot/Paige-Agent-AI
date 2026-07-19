// Studio hero — headless runtime smoke test.
//
// WHY THIS EXISTS (owner 2026-07-19): the Studio hero's 3D scene is wrapped in a SceneBoundary that
// renders NOTHING on any runtime throw. `vite build`/`tsc` pass on code that then CRASHES at runtime
// (a bad GLB, a null mergeGeometries, a sampler on empty geometry), and the boundary hides it — so the
// hero just "doesn't populate" with zero signal, and we burn hours guessing. This script RUNS the exact
// crash-prone three.js logic (GLB load + mergeGeometries + MeshSurfaceSampler + RoomEnvironment) against
// the real model, headless, so a runtime crash is caught BEFORE shipping, not discovered live.
//
// Run:  node scripts/studio-hero-smoke.mjs
// Exit: 0 = the runtime logic runs clean; non-zero = it would crash the hero (fix before shipping).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import fs from "fs";

const MODEL = "public/paige/paige-central.glb"; // keep in sync with StudioCompositionField MODEL_PATH

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

// RoomEnvironment must construct without a renderer.
try {
  const r = new RoomEnvironment();
  if (!r.children.length) fail("RoomEnvironment built with no children");
  console.log("✓ RoomEnvironment constructs");
} catch (e) {
  fail("RoomEnvironment threw: " + e.message);
}

const buf = fs.readFileSync(MODEL);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

let gltf;
try {
  gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, "", res, rej));
} catch (e) {
  fail("GLTF parse threw: " + e.message);
}

const model = gltf.scene;
let meshes = 0;
model.traverse((o) => { if (o.isMesh && o.geometry) meshes++; });
if (meshes === 0) fail("model has 0 sampleable meshes → the particle silhouette would be EMPTY");
console.log(`✓ GLB parsed (${meshes} mesh(es))`);

const box = new THREE.Box3().setFromObject(model);
model.scale.setScalar(2.3 / (box.getSize(new THREE.Vector3()).y || 1));
model.updateMatrixWorld(true);

const geoms = [];
model.traverse((o) => {
  if (o.isMesh && o.geometry) {
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    src.applyMatrix4(o.matrixWorld);
    const ng = new THREE.BufferGeometry();
    ng.setAttribute("position", src.getAttribute("position").clone());
    geoms.push(ng);
  }
});
const merged = mergeGeometries(geoms, false);
if (!merged) fail("mergeGeometries returned null → MeshSurfaceSampler would throw and blank the hero");
console.log(`✓ mergeGeometries OK (${merged.attributes.position.count} verts)`);

try {
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(merged)).build();
  const p = new THREE.Vector3();
  for (let i = 0; i < 10; i++) sampler.sample(p);
  console.log("✓ MeshSurfaceSampler builds + samples");
} catch (e) {
  fail("MeshSurfaceSampler threw: " + e.message);
}

console.log("\n✓✓ Studio hero runtime logic runs clean — safe to ship.");
process.exit(0);

// Paige live presence — headless runtime smoke test.
//
// WHY THIS EXISTS (§32). The presence is wrapped in a SceneBoundary, so a runtime throw degrades to
// the flat presence instead of crashing the stage. That is the right behaviour and it is also how a
// compiles-but-crashes bug hides: `tsc` and `vite build` pass, the corner quietly shows the 2D
// fallback, and nobody learns the 3D never ran. Worse for a shader: a GLSL uniform that the
// JavaScript never supplies does not throw at all — it silently reads as zero, and the strand
// renders as an invisible flat line that looks exactly like "Paige isn't talking". No type checker
// on earth catches that, because the shader is a string.
//
// So this script executes the real geometry the scene builds, and cross-checks the shader's
// declared uniforms against the ones the component actually provides, in both directions.
//
// Run:  node scripts/paige-presence-3d-smoke.mjs   (plain node; no type stripping, so it runs on CI's Node 20)
// Exit: 0 = the runtime logic runs clean; non-zero = it would render wrong or fall back to flat.
import * as THREE from "three";
import fs from "node:fs";

const SCENE = "src/components/paige/live/PaigePresenceScene.tsx";

let failures = 0;
const ok = (msg) => console.log("✓ " + msg);
const bad = (msg) => { console.error("✗ " + msg); failures += 1; };

if (!fs.existsSync(SCENE)) {
  console.error(`✗ ${SCENE} is missing`);
  process.exit(1);
}
const source = fs.readFileSync(SCENE, "utf8");

// ---------------------------------------------------------------------------------------------
// §30 — THE STRIP ACTUALLY HAPPENED.
// Two designs were removed from this file: the sculpted humanoid GLB, and the sphere that briefly
// replaced it. "Did I actually strip the old out, or just cover it?" is the question §30 exists to
// force, and the honest answer has to be checkable rather than remembered. Comments are allowed to
// discuss what was removed; code is not allowed to still do it.
// ---------------------------------------------------------------------------------------------
const code = source.replace(/\/\*[\s\S]*?\*\//g, (m) => (m.startsWith("/* glsl */") ? m : "")).replace(/^\s*\/\/.*$/gm, "");
for (const [pattern, what] of [
  [/useGLTF/, "the GLTF loader"],
  [/paige-woman\.glb|\.glb["'`]/, "a GLB model reference"],
  [/SphereGeometry|IcosahedronGeometry/, "a sphere/icosahedron geometry"],
  [/TorusGeometry/, "the old halo torus"],
]) {
  if (pattern.test(code)) bad(`§30: ${what} is still live in the scene — the previous design was covered, not stripped`);
  else ok(`§30: ${what} is gone from the scene`);
}

// ---------------------------------------------------------------------------------------------
// THE SHADER/UNIFORM CONTRACT. This is the check that earns the file.
// ---------------------------------------------------------------------------------------------
const glsl = {};
for (const name of ["VERTEX", "FRAGMENT"]) {
  const match = source.match(new RegExp(`const ${name} = /\\* glsl \\*/ \`([\\s\\S]*?)\``));
  if (!match) { bad(`could not extract the ${name} shader source`); continue; }
  glsl[name] = match[1];
}
if (!glsl.VERTEX || !glsl.FRAGMENT) process.exit(1);
ok("both shader sources extracted");

// three injects its own declarations for these, so a shader using them declares nothing.
const BUILTIN = new Set([
  "modelMatrix", "modelViewMatrix", "projectionMatrix", "viewMatrix", "normalMatrix",
  "cameraPosition", "position", "normal", "uv",
]);

const declared = new Set();
for (const body of [glsl.VERTEX, glsl.FRAGMENT]) {
  for (const line of body.matchAll(/^\s*uniform\s+\w+\s+([^;]+);/gm)) {
    for (const name of line[1].split(",")) {
      const clean = name.trim().replace(/\[.*$/, "");
      if (clean && !BUILTIN.has(clean)) declared.add(clean);
    }
  }
}
if (declared.size === 0) bad("no uniforms were parsed out of the shaders — the parser is broken, not the shader");
else ok(`${declared.size} uniform(s) declared in GLSL: ${[...declared].sort().join(", ")}`);

// The uniforms the component actually hands to ShaderMaterial.
const block = source.match(/uniforms:\s*\{([\s\S]*?)\n\s{6}\},/);
const supplied = new Set();
if (!block) bad("could not find the `uniforms:` object in the component");
else for (const key of block[1].matchAll(/^\s*(u[A-Za-z0-9_]*)\s*:/gm)) supplied.add(key[1]);
ok(`${supplied.size} uniform(s) supplied by the component: ${[...supplied].sort().join(", ")}`);

for (const name of declared) {
  // THE SILENT ONE. A uniform the shader reads and the component never sets is zero forever: no
  // throw, no warning, just a wave that never moves.
  if (!supplied.has(name)) bad(`${name} is read by the shader but never supplied — it would be silently zero at runtime`);
}
for (const name of supplied) {
  if (!declared.has(name)) bad(`${name} is supplied by the component but declared in neither shader — dead, or a typo of one that is missing`);
}
if (declared.size && supplied.size && [...declared].every((n) => supplied.has(n)) && [...supplied].every((n) => declared.has(n))) {
  ok("every shader uniform is supplied, and every supplied uniform is used — no silently-zero terms");
}

// Structural GLSL sanity. Not a compiler, but it catches the truncation and paste errors that make
// a shader fail to compile — which three reports only to the console, leaving a blank canvas.
for (const [name, body] of Object.entries(glsl)) {
  const braces = (body.match(/\{/g) || []).length - (body.match(/\}/g) || []).length;
  const parens = (body.match(/\(/g) || []).length - (body.match(/\)/g) || []).length;
  if (braces !== 0) bad(`${name}: unbalanced braces (${braces > 0 ? braces + " unclosed" : -braces + " extra"})`);
  else if (parens !== 0) bad(`${name}: unbalanced parentheses (${parens > 0 ? parens + " unclosed" : -parens + " extra"})`);
  else ok(`${name}: braces and parentheses balance`);
  if (!/void\s+main\s*\(\s*\)/.test(body)) bad(`${name}: no main()`);
}
if (!/gl_Position\s*=/.test(glsl.VERTEX)) bad("VERTEX never assigns gl_Position — nothing would be drawn");
else ok("VERTEX assigns gl_Position");
if (!/gl_FragColor\s*=/.test(glsl.FRAGMENT)) bad("FRAGMENT never assigns gl_FragColor — nothing would be shaded");
else ok("FRAGMENT assigns gl_FragColor");

// Every varying written by the vertex shader must be declared by the fragment shader that reads it,
// or the program fails to link — again, console-only.
const vVarying = new Set([...glsl.VERTEX.matchAll(/^\s*varying\s+\w+\s+([^;]+);/gm)].flatMap((m) => m[1].split(",").map((s) => s.trim())));
const fVarying = new Set([...glsl.FRAGMENT.matchAll(/^\s*varying\s+\w+\s+([^;]+);/gm)].flatMap((m) => m[1].split(",").map((s) => s.trim())));
for (const name of fVarying) {
  if (!vVarying.has(name)) bad(`FRAGMENT reads varying ${name} that VERTEX never declares — the program would not link`);
}
if ([...fVarying].every((n) => vVarying.has(n))) ok(`varyings agree across stages (${[...fVarying].sort().join(", ") || "none"})`);

// ---------------------------------------------------------------------------------------------
// ONLY HER OWN VOICE MOVES THE STRAND.
// The owner asked for the wave to go CALM while he is speaking to her, because she is being
// interrupted and is receiving rather than performing. `presenceFrame` reports energy for listening
// too, so that behaviour lives entirely in this one gate — and a refactor that "simplified" it back
// to frame.energy would restore a wave that dances while someone talks over her, with every test
// still green. It is asserted here because there is nowhere else it can be.
// ---------------------------------------------------------------------------------------------
if (!/state === "speaking" \? frame\.energy : 0/.test(code)) {
  bad("the scene no longer gates amplitude on her OWN speech — it would animate while being spoken to");
} else ok("amplitude is gated on speaking: being spoken to leaves the wave calm");
if (!/state === "listening" \? IDLE_LIFT \* 0\.\d+/.test(code)) {
  bad("listening is no longer the calmest state — the resting breath is not damped while she listens");
} else ok("listening damps below idle: the calmest state in the scene");

// ---------------------------------------------------------------------------------------------
// THE GEOMETRY THE SCENE ACTUALLY BUILDS.
// ---------------------------------------------------------------------------------------------
const segments = Number(source.match(/const SEGMENTS = (\d+);/)?.[1]);
const width = Number(source.match(/new THREE\.PlaneGeometry\(([\d.]+),/)?.[1]);
if (!Number.isFinite(segments)) bad("could not read SEGMENTS out of the scene");
if (!Number.isFinite(width)) bad("could not read the strand width out of the scene");

const thicknesses = [...source.matchAll(/thickness:\s*([\d.]+)/g)].map((m) => Number(m[1]));
if (thicknesses.length === 0) bad("no strand thicknesses found — the STRANDS table did not parse");
else ok(`${thicknesses.length} strand(s) declared: thickness ${thicknesses.join(", ")}`);

for (const thickness of thicknesses) {
  try {
    const geometry = new THREE.PlaneGeometry(width, thickness, segments, 1);
    const position = geometry.attributes.position;
    if (!position?.count) { bad(`PlaneGeometry(${width}, ${thickness}, ${segments}, 1) built with no vertices`); continue; }
    const array = position.array;
    let finite = true;
    for (let i = 0; i < array.length; i++) if (!Number.isFinite(array[i])) { finite = false; break; }
    if (!finite) bad(`PlaneGeometry(${width}, ${thickness}, ${segments}, 1) produced non-finite positions`);
    else ok(`PlaneGeometry(${width}, ${thickness}, ${segments}, 1) builds (${position.count} vertices, all finite)`);
    if (!geometry.attributes.uv) bad("the strand geometry has no uv attribute — both shaders index uv");
    geometry.dispose();
  } catch (error) {
    bad(`PlaneGeometry threw: ${error?.message ?? error}`);
  }
}

// A budget, not a hope: three strands at this resolution is the whole cost of the presence.
const vertices = thicknesses.length * (segments + 1) * 2;
if (vertices > 4000) bad(`the presence would build ${vertices} vertices, over the 4000 budget for a corner surface`);
else ok(`total presence cost: ${vertices} vertices`);

// ---------------------------------------------------------------------------------------------
// HONESTY — that silence stays silent, and that being spoken TO does not animate her, are asserted
// in src/lib/paigeLiveConversation/presence.test.ts. They need to import presence.ts, and the CI job
// that runs this smoke is on Node 20, which has no type stripping; importing it here would have
// meant the honesty checks silently SKIPPED in the one place they matter. Splitting them to the
// runner that can execute them is the difference between a check that runs and a check that reports
// nothing and looks identical.
// ---------------------------------------------------------------------------------------------

if (failures) {
  console.error(`\n✗ paige live presence smoke: ${failures} failure(s) — this would render wrong or degrade to flat in production`);
  process.exit(1);
}
console.log("\n✓ paige live presence smoke: shaders link, every uniform is supplied, the strand geometry builds");

// Spline runtime — headless dependency + lazy-import smoke test.
//
// WHY THIS EXISTS (2026-08-29): `@splinetool/react-spline@2.2.6` declares its runtime peer as
// `"@splinetool/runtime": "*"`. npm 7+ auto-installs peers, so `"*"` resolved to `runtime@2.0.14`,
// which depends on `@splinetool/animation-core: "*"` — a package that is UNPUBLISHED from the npm
// registry (HTTP 404). Every clean `npm install` on this repo therefore failed at RESOLUTION, before
// a single line of code ran, and CI could not go green on any branch. The fix is an exact
// `@splinetool/runtime: 1.9.28` override in package.json.
//
// A pin is only as good as the proof it still resolves AND still loads. `tsc`/`vite build` prove
// neither: the runtime is behind `React.lazy`, so a broken or absent runtime compiles fine and only
// fails when a viewer opens the surface (§32 — a green build is not a working render). This script
// exercises the real thing headlessly: it resolves the pin, proves the unpublished transitive is
// gone, and performs the SAME dynamic import that `SplineScene`'s lazy boundary performs at runtime.
//
// Run:  node scripts/spline-runtime-smoke.mjs
// Exit: 0 = the pin resolves and both modules load; non-zero = the install or the lazy chunk is broken.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

// Keep in sync with the `overrides`/`resolutions` entry in package.json.
const PINNED_RUNTIME = "1.9.28";
// Unpublished from npm (404). Its presence anywhere in the tree means the pin stopped holding.
const UNPUBLISHED = "@splinetool/animation-core";

let failed = 0;
function fail(msg) {
  console.error("✗ " + msg);
  failed += 1;
}
function ok(msg) {
  console.log("✓ " + msg);
}

// 1. The override is declared in BOTH blocks the repo mirrors (npm `overrides`, yarn/bun `resolutions`).
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
for (const block of ["overrides", "resolutions"]) {
  const declared = pkg[block]?.["@splinetool/runtime"];
  if (declared !== PINNED_RUNTIME) {
    fail(`package.json ${block}["@splinetool/runtime"] is ${JSON.stringify(declared)}, expected "${PINNED_RUNTIME}"`);
  } else {
    ok(`package.json ${block} pins @splinetool/runtime to ${PINNED_RUNTIME}`);
  }
}

// 2. The INSTALLED runtime is exactly the pin — not merely "some version resolved".
// Read the manifest off disk: @splinetool/runtime restricts `exports`, so `require()` of its
// own package.json throws ERR_PACKAGE_PATH_NOT_EXPORTED rather than reporting a version.
const runtimeManifest = path.join("node_modules", "@splinetool", "runtime", "package.json");
let runtimePkg = null;
if (!fs.existsSync(runtimeManifest)) {
  fail(`@splinetool/runtime is not installed (no ${runtimeManifest})`);
} else {
  runtimePkg = JSON.parse(fs.readFileSync(runtimeManifest, "utf8"));
  if (runtimePkg.version !== PINNED_RUNTIME) {
    fail(`installed @splinetool/runtime is ${runtimePkg.version}, expected ${PINNED_RUNTIME} — the override did not hold`);
  } else {
    ok(`installed @splinetool/runtime is exactly ${runtimePkg.version}`);
  }
}

// 3. The unpublished transitive is absent from the whole tree. Resolution — not a directory guess —
//    because a hoisted or nested copy would still break the next clean install.
// (a) The pinned runtime must not DECLARE it — that dependency edge is what broke resolution.
if (runtimePkg) {
  const declares = { ...runtimePkg.dependencies, ...runtimePkg.peerDependencies };
  if (UNPUBLISHED in declares) {
    fail(`@splinetool/runtime@${runtimePkg.version} declares ${UNPUBLISHED} — the pin does not avoid the unpublished package`);
  } else {
    ok(`@splinetool/runtime@${runtimePkg.version} does not depend on ${UNPUBLISHED}`);
  }
}
// (b) No copy is on disk anywhere. A filesystem walk, not require.resolve: a package that restricts
//     `exports` is unresolvable while still installed, so resolution would false-pass.
const unpublishedDir = UNPUBLISHED.split("/").pop();
function findInstalled(dir, depth = 0) {
  if (depth > 6) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const hits = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === "@splinetool") {
      if (fs.existsSync(path.join(full, unpublishedDir))) hits.push(path.join(full, unpublishedDir));
      continue;
    }
    if (entry.name === "node_modules" || !entry.name.startsWith(".")) {
      hits.push(...findInstalled(full, depth + 1));
    }
  }
  return hits;
}
const copies = findInstalled("node_modules");
if (copies.length) {
  fail(`${UNPUBLISHED} is installed at ${copies.join(", ")} — it is unpublished from npm and will fail the next clean install`);
} else {
  ok(`${UNPUBLISHED} is absent from the installed tree`);
}

// 4. The lazy chunk actually LOADS. This is the same dynamic import SplineScene's Suspense boundary
//    performs; if it throws, the boundary would swallow it and the surface would render blank (§32).
try {
  const runtime = await import("@splinetool/runtime");
  if (typeof runtime.Application !== "function") {
    fail("@splinetool/runtime loaded but exports no Application class");
  } else {
    ok("@splinetool/runtime imports and exports the Application class");
  }
} catch (e) {
  fail("@splinetool/runtime failed to import: " + e.message);
}

try {
  const mod = await import("@splinetool/react-spline");
  const Spline = mod.default;
  // react-spline's default export is a forwardRef object, not a plain function component.
  const isComponent =
    typeof Spline === "function" || (Spline && typeof Spline === "object" && "$$typeof" in Spline);
  if (!isComponent) {
    fail(`@splinetool/react-spline default export is not a React component (got ${typeof Spline})`);
  } else {
    ok("@splinetool/react-spline imports and its default export is a React component");
  }
} catch (e) {
  fail("@splinetool/react-spline failed to import: " + e.message);
}

// HONEST LIMIT (§13): this proves the dependency resolves and both modules load in Node. It does NOT
// prove a Spline scene paints — that needs WebGL, which neither Node nor jsdom provides. A real
// visual render is owed to a browser-capable session (§32.c).
if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll Spline runtime checks passed.");

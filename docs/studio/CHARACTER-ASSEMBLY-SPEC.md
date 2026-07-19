# Studio Composition Field → Paige-Character Assembly — One-Pass Spec

Owner: Antonio Cook · Reference: Antonio's uploaded Paige character close-up (astronaut-helmet
character with etched "P", orbital rings, translucent amber glass, gold visor-mouth glow, closed
serene eyes) — the target composed-state form. Doctrine: §7, §11, §15, §22, §25, §28, §29, §30.

## Goal
Particles start dispersed → assemble into a recognizable Paige character silhouette matching the
reference → solidify into the actual translucent-glass 3D Paige character → hold as solid Paige with
orbiting rings + subtle breath → dissolve back to particles → disperse. Continuous loop. Positioned
symmetrically ABOVE the composer (the composer is the "desk"; Paige presides above it).

This REPLACES the page-layout-ghost target in `StudioCompositionField.tsx`. The loop code + spring
physics + composer coupling STAY; only the composed-state target changes, plus a solidify-into-
character phase.

## Reference character composition
- Head: rounded helmet, slight vertical elongation (egg/pear-leaning), translucent amber glass.
- P mark: large serif "P" upper-front of helmet, translucent gold, reads engraved.
- Ear pods: two small rounded protrusions L/R (astronaut ear covers), same material.
- Eyes: two closed serene arcs (⌒ ⌒), gently emissive gold, mid-face.
- Mouth: small curved smile, more emissive.
- Mouth-glow / chin light: bright warm-gold light concentration at mouth/chin — the inner light source.
- Orbital rings: multiple thin gold rings at different tilts, delicate wireframe, elliptical.
- Lighting: warm amber inner glow, subtle rim light, no harsh highlights, dark navy bg.

## Scene (unchanged): FOV 42, camera Z = 7, viewport vertical bounds ≈ ±2.6.

## Character group parent origin
`characterGroup.position = new THREE.Vector3(0, 1.5, 0)` — X 0 (dead center, §28 symmetry), Y 1.5
(above composer at Y -0.1..-1.5), Z 0.

## Head/helmet
```
const headGeom = new THREE.SphereGeometry(1.2, 64, 64);
const head = new THREE.Mesh(headGeom, glassMaterial);
head.scale.set(1.0, 1.15, 1.0);  // slight vertical elongation
head.position.set(0, 0, 0);
```

## Ear pods (L/R)
```
const earGeom = new THREE.SphereGeometry(0.38, 32, 32);
const earL = new THREE.Mesh(earGeom, glassMaterial);
earL.position.set(-1.28, -0.15, 0); earL.scale.set(0.85, 1.0, 1.0);
const earR = earL.clone(); earR.position.set(1.28, -0.15, 0);
```

## P mark (top-front)
```
const pGeom = new THREE.ExtrudeGeometry(buildSerifP(), { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 3 });
const pMesh = new THREE.Mesh(pGeom, glassMaterial);
pMesh.scale.set(0.35, 0.35, 0.35);
pMesh.position.set(-0.15, 0.55, 1.05);  // upper-front, slightly left-of-center
pMesh.rotation.x = -0.18;                // forward tilt to sit on curved helmet
```
### buildSerifP()
```
function buildSerifP(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0, 3); s.lineTo(1.6, 3);
  s.quadraticCurveTo(2.6, 3, 2.6, 2.2);
  s.quadraticCurveTo(2.6, 1.4, 1.6, 1.4);
  s.lineTo(0.6, 1.4); s.lineTo(0.6, 0); s.lineTo(0, 0);
  const hole = new THREE.Path();
  hole.moveTo(0.6, 2.4); hole.lineTo(1.5, 2.4);
  hole.quadraticCurveTo(2.0, 2.4, 2.0, 2.2);
  hole.quadraticCurveTo(2.0, 2.0, 1.5, 2.0);
  hole.lineTo(0.6, 2.0); hole.lineTo(0.6, 2.4);
  s.holes.push(hole); return s;
}
```
(Tune serif proportions to read elegant, not blocky.)

## Eyes (two closed arcs)
```
const eyeShape = new THREE.Shape();
eyeShape.moveTo(-0.22, 0); eyeShape.quadraticCurveTo(0, 0.15, 0.22, 0);
eyeShape.quadraticCurveTo(0, 0.05, -0.22, 0);
const eyeGeom = new THREE.ExtrudeGeometry(eyeShape, { depth: 0.02, bevelEnabled: false });
const eyeMat = new THREE.MeshStandardMaterial({ color:'#F0C86A', emissive:'#F0C86A', emissiveIntensity:1.4, metalness:0.2, roughness:0.3 });
const eyeL = new THREE.Mesh(eyeGeom, eyeMat); eyeL.position.set(-0.38, 0.05, 1.12); eyeL.rotation.x = -0.1;
const eyeR = eyeL.clone(); eyeR.position.set(0.38, 0.05, 1.12);
```

## Mouth (small smile)
```
const mouthShape = new THREE.Shape();
mouthShape.moveTo(-0.25, 0); mouthShape.quadraticCurveTo(0, -0.16, 0.25, 0);
mouthShape.quadraticCurveTo(0, -0.09, -0.25, 0);
const mouthGeom = new THREE.ExtrudeGeometry(mouthShape, { depth: 0.02, bevelEnabled: false });
const mouthMat = eyeMat.clone(); mouthMat.emissiveIntensity = 2.0;
const mouth = new THREE.Mesh(mouthGeom, mouthMat); mouth.position.set(0, -0.42, 1.14);
```

## Mouth-glow inner light (Paige's light, §29)
```
const innerLight = new THREE.PointLight('#FFE7A6', 4.5, 3.5, 1.8);
innerLight.position.set(0, -0.42, 0.9);
const coreGeom = new THREE.SphereGeometry(0.14, 32, 32);
const core = new THREE.Mesh(coreGeom, new THREE.MeshBasicMaterial({ color:'#FFE7A6' }));
core.position.copy(innerLight.position);
```

## Orbital rings (three tilts)
```
const ringGeom = new THREE.TorusGeometry(1.85, 0.006, 3, 128);
const ringMat = new THREE.MeshStandardMaterial({ color:'#F0C86A', emissive:'#F0C86A', emissiveIntensity:0.9, metalness:0.6, roughness:0.2, transparent:true, opacity:0.85 });
const ring1 = new THREE.Mesh(ringGeom, ringMat.clone()); ring1.rotation.set(0.15, 0, 0.28);
const ring2 = new THREE.Mesh(ringGeom, ringMat.clone()); ring2.rotation.set(0.42, 0, -0.35);
const ring3 = new THREE.Mesh(ringGeom, ringMat.clone()); ring3.rotation.set(-0.22, 0, 0.15);
```
Ring rotation (useFrame): ring1.y += 0.15*delta; ring2.y -= 0.09*delta; ring3.y += 0.12*delta.
Reduced motion: skip; rings stay at initial rotations.

## Glass material (helmet + ears + P)
```
const glassMaterial = new THREE.MeshPhysicalMaterial({
  color:'#E9C989', transmission:0.92, thickness:0.6, roughness:0.08, metalness:0.05, ior:1.42,
  attenuationColor:'#F0C86A', attenuationDistance:1.4, clearcoat:1.0, clearcoatRoughness:0.08,
  envMapIntensity:1.3, transparent:true, opacity:0.95, side:THREE.DoubleSide });
```
REQUIRED env map for glass reflections. If none: `RoomEnvironment` + `PMREMGenerator`
(`scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture`). In R3F, drei
`<Environment>` is an acceptable idiomatic equivalent. Glass without an envMap renders gray plastic.

## Particle sampling (replaces LAYOUT)
Use `MeshSurfaceSampler` (three/examples/jsm/math/MeshSurfaceSampler.js). Merge world-space clones of
head/earL/earR/pMesh/ring1/ring2/ring3 via `mergeGeometries` (BufferGeometryUtils) into a non-rendered
sampling mesh; sample COUNT positions into `characterTargets` Float32Array. Ensure world matrices are
updated before applying `matrixWorld`. Optional per-submesh weights: head 1.0, ears 0.6, P 1.2, rings 0.7.
DELETE the current `LAYOUT` array (obsolete).

## State machine (revised timings)
```
DISPERSED       1.8s   scattered wide in DISP, no character
ASSEMBLING      2.5s   dispersed → characterTargets (damped spring)
PARTICLE_HOLD   0.6s   particles at character positions (Paige outlined)
SOLIDIFY        0.7s   particles alpha 1→0 crossfade vs solid mesh alpha 0→1
CHARACTER_HOLD  3.2s   solid character, rings orbit, subtle breath
DISSOLVE        0.7s   solid alpha 1→0 crossfade vs particles alpha 0→1
PARTICLE_LEAVE  0.6s   particles at character positions, drift begins
RETURN          2.0s   particles → new dispersed positions
TOTAL          12.1s   clearly perceivable
```
Breath (CHARACTER_HOLD): characterGroup.scale = 1 + sin(t*0.9)*0.015 (~1.5%). Reduced: skip, scale 1.

## Composer coupling
- composing===true: CHARACTER_HOLD → 5.5s; ringMat.emissiveIntensity 0.9→1.4 (spring); innerLight 4.5→6.0.
- busy===true: one-shot GSAP ~340ms: innerLight 4.5→10→0 (peak 120ms); core scale 1→3→0 (peak 140ms);
  ring emissive 0.9→2.5→0 (peak 160ms); character alpha 1→0 (last 180ms); handoff to StudioBuildingScreen at 340ms.

## Symmetry (§28)
Composer byte-identical (do NOT touch position/size/alignment). Character X 0 = composer center X 0
(dead-center vertical axis). Character Y 1.5, occupies ~[0.3, 2.7]; composer top ~Y 0 → ~0.3 gap. Z 0.

## Reduced motion (§25 err-visible)
Skip loop. Render solid character fully composed + STILL at (0,1.5,0). Rings at initial rotations, not
rotating. No particles. No breath, no bloom pulse. A finished, legible static Paige — never blank, never
a frozen dispersed cloud.

## Light mode
Return null. Bright `--studio-hero-gradient` carries it. No muddy dark-tuned character on light (§23) —
genuine-light variant deferred.

## Post-processing (§29)
```
<EffectComposer><Bloom intensity={1.4} luminanceThreshold={0.28} luminanceSmoothing={0.85} mipmapBlur /></EffectComposer>
```
Bloom makes eyes/mouth/core/rings glow. Verify it's mounted in the scene tree, not just imported. If the
core doesn't read as a source, raise core emissive → 3.5 and Bloom intensity → 1.6.

## File structure
Modify `src/components/admin/studio/StudioCompositionField.tsx`: delete LAYOUT; add character geometry;
add MeshSurfaceSampler targets; add character-alpha solidify/dissolve crossfade; update timing constants;
add ring rotation; add composer coupling. Do NOT create a new scene file (§12/§18 one home). ONLY if the
file exceeds ~600 lines, extract character geometry to `StudioCharacterMesh.tsx` (same folder, internal helper).

## Preserve (do NOT touch)
PromptComposer.tsx · §28 composer outer box · PaigeScene.tsx + its contract (§30 no fork) · dark-only ·
WebGL fallback + SceneBoundary · lazy-load boundary · useStudioTheme/useStudioReducedMotion reads ·
submit→StudioBuildingScreen handoff.

## Anti-patterns (design-critic blocks)
Opaque plastic Paige (must be translucent glass — see ear pods faintly through far helmet) · flat-decal P
(must extrude+bevel on curved surface) · over-rotating rings (0.15 rad/s max, §22) · gold anywhere not
spec'd (§11: gold only on eyes/mouth/core/rings/submit flare — not bg/borders/chips) · losing the
mouth-glow→light-source relationship · skipping the env map (gray plastic).

## IMAGE-ACCURATE ADDENDUM (owner sent the reference image 2026-07-19 — the image is the source of truth where it diverges from the numbers above)
Observed in the actual reference render; correct the numeric spec to match these:
- **P mark is upper-RIGHT of the dome** (viewer's right), NOT left. Set `pMesh.position.x ≈ +0.35` (positive),
  keep it upper-front (y ~0.55, z ~1.05), engraved-reading on the curved glass. The spec's `-0.15` is wrong per the image.
- **Rings: TWO dominant nearly-horizontal SHALLOW ellipses that CROSS in front of the face** (not three steep tilts).
  Keep three torus meshes if desired, but the read must be shallow (tilt.x ≈ 0.06–0.20) with DIFFERENT y-rotations so
  they criss-cross like an orbital X, radius ~1.85–2.1 (extend beyond head width), thin, with bright specular hotspots.
- **Add a glowing collar/neck base** below the chin: a short translucent-glass cylinder/rounded pedestal (~r 0.5, height 0.35)
  centered under the head at ~y -1.35, same glass material, with the inner light spilling onto it.
- **The chin-glow is the SINGLE brightest element** — a small cupped gold burst at bottom-center of the face; it is Paige's
  light and must be the dominant bloomed anchor (brighter than P and rings). Push core emissive + bloom until it dominates.
- Helmet glass must read genuinely SEE-THROUGH (stars visible through the dome) — transmission + env map, never opaque.
- Overall warm amber inner glow suffuses the whole head; subtle rim light; dark navy star background.
Everything else (helmet/ears/eyes/mouth geometry, glass material, sampler, state machine, reduced-motion, bloom, §28/§30) stands.

## Verification (owner via Chrome MCP on the draft PR preview)
1. Character read test (CHARACTER_HOLD): helmet+P+ears+closed eyes+smile+mouth glow+rings legible.
2. Full loop t=0,2,4,6,8,10,12: dispersed→assembling→particle-hold→SOLIDIFY→character-hold→dissolve→dispersed.
3. Symmetry: character center vs composer center < 4px.
4. Light dominance: mouth-core is the visual anchor.
5. Ring rotation: t=8 vs t=11 delta.
6. Reduced-motion: solid character present + still.
7. §28 composer geometry unchanged.

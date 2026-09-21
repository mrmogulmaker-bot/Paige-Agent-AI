// Mind Orb — real Three.js engine. PORT of the owner-approved "Synapse" direction
// (docs/prototypes/command-center-mind-synapse.* reference, approved 2026-09-20).
//
// §30 STRIP-THEN-REBUILD: the earlier glass-globe orb (fresnel shell, orbital rings, faceted core,
// instanced record nodes, UnrealBloom) was a DIFFERENT design direction. The owner approved Synapse
// as its replacement, which under §28 is the only thing that unfreezes the old look. So the previous
// rendering is REMOVED wholesale here — not layered under the particle field — and rebuilt on the
// same module contract (createMindOrb factory + MindOrbHandle) so MindOrbCanvas ports unchanged.
//
// WHAT THIS RENDERS: a GPU particle field on the Synapse form — two lobes, a gyri ridge, a flattened
// base and a stem — that reads as a mind at a glance. Two tiers, and the split is the honesty rule:
//   • DUST (uCap particles) is STRUCTURE, not data. It is the glowing form itself and it NEVER scales
//     down with record count (A1 FORM FLOOR): the mind is fully readable at 0, 13, or 1,284 records.
//   • NODES (one per governed record) are DATA. Exactly one bright point per real MindRecord, placed
//     in that record's domain region, coloured by its truth tier (grounded teal / partial gold /
//     unavailable grey). Record count drives ONLY the bright nodes. On the owner's account today that
//     is ~13 bright points on a full glowing form. Empty renders the formed mind with NO bright nodes.
//
// The engine renders PRESENTATION. It never fabricates data: it draws the records it is handed and an
// honest absence when handed none. The page owns the headline count, legend, drawer, states and list.
//
// §32: crash-prone setup (WebGL context, geometry build, sampler math) is guarded and degrades LOUD,
// never silent. The Synapse form generators are pure math, unit-smoke-tested in mindDomains + a Node
// smoke script. Additive blending + one soft-sprite shader; NO composer/bloom pass (the FS glows).

import * as THREE from "three";
import { makeRng, gauss, rdir, domainCenter, synapsePoint, hashSeed, dustCap } from "./synapseForm";
import { focusScale, pickRayIndex, pickFrontIndex, feedVisual, type Vec3 } from "./orbInteraction";

// ---------------------------------------------------------------------------
// Public types (exported)
// ---------------------------------------------------------------------------

/** The 3 truth tiers the orb colours a record by (the owner-approved 6→3 orb legend). */
export type MindTruthTier = "grounded" | "partial" | "unavailable";

/** Evidence state of the whole surface (drives the form: formed vs scattered). */
export type MindEvidenceState = "populated" | "empty" | "loading" | "error";

/** Light-theme treatment (A3): "well" = a contained dark stage for the additive field; "light" =
 * true-light alpha-blended particles on the bright ground. The owner picks one at sign-off. */
export type MindMineralMode = "well" | "light";

/**
 * One record the orb renders as a bright node. `id/domain/tier` are what the engine reads; the index
 * signature lets the caller attach its own payload (the MindRecord), returned untouched by onPick.
 */
export interface MindOrbRecordNode {
  id: string;
  domain: string; // one of the domain keys in cfg.domains
  tier: MindTruthTier;
  label?: string;
  [k: string]: unknown;
}

/** A domain region on the form (az/el hub direction, ported from the approved domain geometry). */
export interface MindOrbDomain {
  key: string;
  az: number;
  el: number;
}

export interface MindOrbConfig {
  records: MindOrbRecordNode[];
  domains: MindOrbDomain[];
  state: MindEvidenceState;
  dark: boolean;
  mineral?: MindMineralMode;
  running: boolean;
  reduced: boolean;
  /** Optional hard override for the dust particle count (tests/harness). Defaults by screen size. */
  particleCap?: number;
  onPick?: (n: MindOrbRecordNode) => void;
}

/** Measured runtime numbers (A5) — real, from the rAF loop, never fabricated (§13). */
export interface MindOrbMeasure {
  particlesDust: number;
  particlesNodes: number;
  dustFraction: number;
  fps: number;
  p50FrameMs: number;
  p95FrameMs: number;
  frames: number;
}

/** The controllable handle a successful `createMindOrb` returns. */
export interface MindOrbHandle {
  applyTheme(dark: boolean, mineral?: MindMineralMode): void;
  setData(records: MindOrbRecordNode[], state?: MindEvidenceState): void;
  setState(state: MindEvidenceState): void;
  focus(domainKey: string | null): void;
  /** Fire the incoming-knowledge stream. Call ONLY on a real new-record event (§13 — motion never
   * implies activity). No timer, no ambient trigger. */
  fireFeed(domainKey: string): void;
  setRunning(v: boolean): void;
  setReduced(v: boolean): void;
  setZoom(percent: number): void;
  reset(): void;
  resize(): void;
  dispose(): void;
  setVisible(v: boolean): void;
  available(): boolean;
  pickFront(): void;
  measure(): MindOrbMeasure;
}

export type MindOrbInit = { ok: true; handle: MindOrbHandle } | { ok: false; error: string };

// Tier → base colour (grounded teal→core, partial gold, unavailable grey). Node colours are bright;
// dust uses a dim structural teal→indigo so the FORM glows while only real records read as bright.
const TIER_RGB: Record<MindTruthTier, [number, number, number]> = {
  grounded: [0.37, 0.88, 0.77],
  partial: [0.94, 0.7, 0.35],
  unavailable: [0.44, 0.48, 0.56],
};

// ---------------------------------------------------------------------------
// Shaders (one vertex + one fragment, shared by dust + node materials).
// ---------------------------------------------------------------------------

const VERT = `
attribute vec3 sc;      // scatter target
attribute vec3 aColor;  // base colour
attribute vec4 aMeta;   // x seed, y domainIndex, z sizeJitter, w baseAlpha
uniform float uT, uMix, uScatter, uFlow, uPx, uFocus, uFocusAmt, uFlash, uFlashD, uCamZ, uGrey, uAllNodes, uReduced, uDustFraction, uLight;
varying vec3 vC; varying float vA;
vec3 flow(vec3 p, float t){
  return vec3(
    sin(p.y*2.3+t)+cos(p.z*1.7-t*0.7),
    sin(p.z*2.1+t*0.8)+cos(p.x*1.9+t),
    sin(p.x*2.6-t*0.6)+cos(p.y*1.5+t*0.9)
  ) * 0.5;
}
void main(){
  float sd = aMeta.x, dm = aMeta.y;
  // Adaptive hard floor (A5): dust beyond the fraction is culled, but the fraction never drops so far
  // the FORM breaks (the caller clamps uDustFraction to a floor). Nodes are never culled.
  if (uAllNodes < 0.5 && sd > uDustFraction) { gl_Position = vec4(2.0,2.0,2.0,1.0); vA = 0.0; return; }
  vec3 pos = position;
  // scatter (loading/error) — lerp toward a dispersed target
  pos = mix(pos, sc + flow(sc, uT*0.2)*0.15, uScatter);
  // staggered gather-in with turbulence while re-forming
  float m = clamp(uMix*1.7 - sd*0.7, 0.0, 1.0); m = m*m*(3.0-2.0*m);
  pos += flow(pos*1.1 + sd*9.0, uT*0.9) * sin(m*3.14159) * 0.42 * (1.0-uReduced);
  // ambient flow field + radial breath
  pos += flow(pos*1.3, uT*0.35 + sd*6.28) * uFlow * (1.0-uReduced);
  pos *= 1.0 + 0.055*sin(uT*0.8 - length(pos)*5.5 + sd*0.8) * min(1.0, uFlow*40.0) * (1.0-uReduced);
  // focus — pull the focused domain forward, push the rest back
  float isF = step(abs(dm-uFocus), 0.5) * step(-0.5, uFocus);
  pos *= mix(1.0, mix(0.82, 1.12, isF), uFocusAmt);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;
  float dp = clamp((uCamZ + 1.5 + mv.z) / 2.9, 0.22, 1.0); // depth fade
  vec3 col = mix(aColor, vec3(0.42,0.46,0.53), uGrey);     // grey wash on error
  col += vec3(1.0) * uFlash * step(abs(dm-uFlashD), 0.5);  // feed flash on the fed domain only
  col = mix(col, col*0.55, uLight * (1.0 - uAllNodes*0.55)); // true-light darkens the DUST, keeps NODES saturated
  float al = aMeta.w * mix(1.0, mix(0.16, 1.25, isF), uFocusAmt);
  vC = col * mix(1.0, 1.85, uAllNodes);                    // record nodes read clearly brighter than the form
  vA = al * dp;
  gl_PointSize = aMeta.z * uPx * mix(1.0, 3.8, uAllNodes) * mix(0.75, 1.15, dp) / -mv.z; // nodes are bigger dots
}`;

// Additive (dark / well) fragment: soft sprite + a white core bloom in-shader (no post pass).
const FRAG_ADD = `
varying vec3 vC; varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  if (a*vA < 0.004) discard;
  vec3 c = vC + vec3(0.7)*pow(a, 5.0);
  gl_FragColor = vec4(c*a*vA, a*vA);
}`;

// Normal-blend (true-light) fragment: a solid soft dot, no additive core (would wash the bright ground).
const FRAG_LIGHT = `
varying vec3 vC; varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  if (a*vA < 0.01) discard;
  gl_FragColor = vec4(vC, a*vA);
}`;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface Uniforms {
  [k: string]: { value: number };
}

interface State {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  dust: THREE.Points;
  dustMat: THREE.ShaderMaterial;
  nodes: THREE.Points;
  nodeMat: THREE.ShaderMaterial;
  nodeRecords: MindOrbRecordNode[];
  stream: THREE.Points;
  streamMat: THREE.ShaderMaterial;
  streamU: { uP: { value: number }; uPx: { value: number }; uA: { value: THREE.Vector3 }; uB: { value: THREE.Vector3 } };
  U: Uniforms;
  domains: MindOrbDomain[];
  domainIndex: Map<string, number>;
  disposables: { dispose?: () => void }[];
  raf: number;
  running: boolean;
  reduced: boolean;
  dark: boolean;
  mineral: MindMineralMode;
  state: MindEvidenceState;
  focusKey: string | null;
  onPick: (n: MindOrbRecordNode) => void;
  clock: THREE.Clock;
  t: number;
  last: number;
  visible: boolean;
  dirty: boolean; // a discrete change (drag/zoom/theme/data) needs ONE render while otherwise static
  dpr: number;
  canvas: HTMLCanvasElement;
  capDust: number;
  dustFractionFloor: number;
  raycaster?: THREE.Raycaster;
  rotX: number;
  rotY: number;
  zoomPct: number; // 100 = default framing; >100 closer, <100 farther (survives resize)
  // targets eased each frame
  tgt: { scatter: number; grey: number; flow: number; mix: number; focus: number; focusAmt: number };
  // feed stream
  feedT0: number;
  // A5 measurement
  frameMs: number[];
  frames: number;
  // adaptive step-down
  stepChecked: boolean;
}

// ---------------------------------------------------------------------------
// Factory — one fully independent instance per call.
// ---------------------------------------------------------------------------

export function createMindOrb(canvas: HTMLCanvasElement, cfg: MindOrbConfig): MindOrbInit {
  let S: State | null = null;

  function buildDust(capDust: number, domains: MindOrbDomain[]): THREE.BufferGeometry {
    const r = makeRng(20260920);
    const centers = domains.map(domainCenter);
    const nD = Math.max(1, centers.length);
    const pos = new Float32Array(capDust * 3);
    const sc = new Float32Array(capDust * 3);
    const col = new Float32Array(capDust * 3);
    const meta = new Float32Array(capDust * 4);
    for (let i = 0; i < capDust; i++) {
      const di = Math.floor(r() * nD);
      const p = synapsePoint(centers[di], r, true);
      pos.set(p, i * 3);
      const sd0 = rdir(r);
      const sr = 2.2 + r() * 1.6;
      sc.set([sd0[0] * sr, sd0[1] * sr * 0.7, sd0[2] * sr], i * 3);
      // dust colour: a bright STRUCTURAL teal→indigo glow — this IS the readable form (A1 "v2
      // brightness"), NOT tier data. Records read as brighter, tier-coloured NODES on top of it.
      const t = r();
      col.set([0.28 + t * 0.18, 0.64 + (1 - t) * 0.3, 0.74 + t * 0.24], i * 3);
      // meta: seed (0..1, also the dust-fraction key), domainIndex, sizeJitter, baseAlpha. Alpha is at
      // the reference's v2 level so the form glows and stays fully readable at every record count (A1).
      meta.set([r(), di, 0.7 + r() * 0.7, 0.5 + r() * 0.55], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("sc", new THREE.BufferAttribute(sc, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aMeta", new THREE.BufferAttribute(meta, 4));
    return geo;
  }

  function buildNodes(records: MindOrbRecordNode[], domains: MindOrbDomain[]): THREE.BufferGeometry {
    const centers = domains.map(domainCenter);
    const idxOf = new Map(domains.map((d, i) => [d.key, i]));
    const n = Math.max(1, records.length); // never a zero-length attribute; alpha 0 hides the placeholder
    const pos = new Float32Array(n * 3);
    const sc = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const meta = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const rec = records[i];
      if (!rec) {
        // placeholder vertex when there are no records (empty state): fully transparent, off-form.
        meta.set([0, 0, 0.001, 0], i * 4);
        continue;
      }
      const di = idxOf.get(rec.domain) ?? 0;
      const seed = hashSeed(rec.id);
      const r = makeRng(seed);
      const p = synapsePoint(centers[di] ?? centers[0], r, false); // nodes stay on the readable surface
      pos.set(p, i * 3);
      const sd0 = rdir(r);
      const sr = 2.2 + r() * 1.6;
      sc.set([sd0[0] * sr, sd0[1] * sr * 0.7, sd0[2] * sr], i * 3);
      col.set(TIER_RGB[rec.tier] ?? TIER_RGB.grounded, i * 3);
      // bright node: seed (unused for culling — nodes never cull), domainIndex, size jitter, alpha.
      // Node size jitter is large so a handful of records still read clearly on the full form (A1).
      meta.set([(seed % 1000) / 1000, di, 1.7 + ((seed >>> 6) % 50) / 100, 0.95], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("sc", new THREE.BufferAttribute(sc, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aMeta", new THREE.BufferAttribute(meta, 4));
    return geo;
  }

  function fragFor(mineral: MindMineralMode, dark: boolean): string {
    return !dark && mineral === "light" ? FRAG_LIGHT : FRAG_ADD;
  }
  function blendFor(mineral: MindMineralMode, dark: boolean): THREE.Blending {
    return !dark && mineral === "light" ? THREE.NormalBlending : THREE.AdditiveBlending;
  }

  function init(canvas: HTMLCanvasElement, cfg: MindOrbConfig): { ok: true } | { ok: false; error: string } {
    dispose();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
      if (!renderer.getContext()) throw new Error("no webgl context");
    } catch (e) {
      return { ok: false, error: String((e && (e as Error).message) || e) };
    }
    const DPRcap = 2;
    const dpr = Math.min(window.devicePixelRatio || 1, DPRcap);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const small = Math.min(window.innerWidth, window.innerHeight) < 700;
    const capDust = dustCap(cfg.particleCap, small); // A1: dust count is independent of record count

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.z = small ? 5.2 : 4.5;
    scene.add(camera);
    const group = new THREE.Group();
    scene.add(group);

    const dark = cfg.dark !== false;
    const mineral: MindMineralMode = cfg.mineral ?? "well";

    // shared uniforms (A1: uDustFraction starts at 1 — full form; hard floor applied on step-down)
    const U: Uniforms = {
      uT: { value: 0 }, uMix: { value: 1 }, uScatter: { value: 0 }, uFlow: { value: 0.022 },
      uPx: { value: 8 }, uFocus: { value: -1 }, uFocusAmt: { value: 0 }, uFlash: { value: 0 },
      uFlashD: { value: -1 }, uCamZ: { value: camera.position.z }, uGrey: { value: 0 },
      uAllNodes: { value: 0 }, uReduced: { value: cfg.reduced ? 1 : 0 }, uDustFraction: { value: 1 },
      uLight: { value: !dark && mineral === "light" ? 1 : 0 },
    };

    const domains = cfg.domains && cfg.domains.length ? cfg.domains : [{ key: "all", az: 0, el: 0 }];
    const domainIndex = new Map(domains.map((d, i) => [d.key, i]));

    const dustGeo = buildDust(capDust, domains);
    const records = cfg.records || [];
    const nodeGeo = buildNodes(records, domains);

    const dustMat = new THREE.ShaderMaterial({
      uniforms: U, vertexShader: VERT, fragmentShader: fragFor(mineral, dark),
      transparent: true, depthWrite: false, depthTest: false, blending: blendFor(mineral, dark),
    });
    // node material shares the SAME uniform objects (so rotation/flow/focus stay in lockstep) but forces
    // uAllNodes=1 via its own override — three merges per-material uniforms, so we clone the object and
    // point every shared key at U's SAME value object, then give it its own uAllNodes.
    const nodeUniforms: Uniforms = {};
    for (const k of Object.keys(U)) nodeUniforms[k] = U[k];
    nodeUniforms.uAllNodes = { value: 1 };
    const nodeMat = new THREE.ShaderMaterial({
      uniforms: nodeUniforms, vertexShader: VERT, fragmentShader: fragFor(mineral, dark),
      transparent: true, depthWrite: false, depthTest: false, blending: blendFor(mineral, dark),
    });

    const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; group.add(dust);
    const nodes = new THREE.Points(nodeGeo, nodeMat); nodes.frustumCulled = false; group.add(nodes);

    // incoming-knowledge stream — fired ONLY by fireFeed on a real new-record event.
    const SN = 700;
    const sPos = new Float32Array(SN * 3);
    const sMeta = new Float32Array(SN * 2);
    const sr = makeRng(424242);
    for (let i = 0; i < SN; i++) {
      sPos.set([gauss(sr) * 0.18, gauss(sr) * 0.18, gauss(sr) * 0.18], i * 3);
      sMeta.set([sr(), 0.7 + sr() * 0.8], i * 2);
    }
    const streamGeo = new THREE.BufferGeometry();
    streamGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
    streamGeo.setAttribute("sm", new THREE.BufferAttribute(sMeta, 2));
    const streamU = { uP: { value: 2 }, uPx: U.uPx, uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() } };
    const streamMat = new THREE.ShaderMaterial({
      uniforms: streamU, transparent: true, depthWrite: false, depthTest: false, blending: blendFor(mineral, dark),
      vertexShader:
        "attribute vec2 sm;uniform float uP,uPx;uniform vec3 uA,uB;varying float vA;" +
        "void main(){float t=clamp(uP*1.45-sm.x*0.45,0.0,1.0);float e=t*t*(3.0-2.0*t);" +
        "vec3 side=normalize(cross(uB-uA,vec3(0.2,1.0,0.3)));" +
        "vec3 p=mix(uA,uB,e)+side*sin(e*3.14159)*0.55+position*(1.0-e*0.85);" +
        "vA=sin(t*3.14159);vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;" +
        "gl_PointSize=sm.y*uPx*2.2/-mv.z;}",
      fragmentShader:
        "varying float vA;void main(){float d=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.0,d);" +
        "a*=a*vA;if(a<0.004)discard;gl_FragColor=vec4(vec3(0.85,1.0,0.95)*a,a);}",
    });
    const stream = new THREE.Points(streamGeo, streamMat); stream.frustumCulled = false; stream.visible = false; group.add(stream);

    S = {
      renderer, scene, camera, group, dust, dustMat, nodes, nodeMat, nodeRecords: records,
      stream, streamMat, streamU, U, domains, domainIndex,
      // materials + stream geo only; the dust + node geometries (which the node one is rebuilt on a
      // count change) are disposed EXACTLY once, explicitly, in dispose() — never double-freed here.
      disposables: [dustMat, nodeMat, streamGeo, streamMat],
      raf: 0, running: cfg.running !== false, reduced: !!cfg.reduced, dark, mineral,
      state: cfg.state || "populated", focusKey: null, onPick: cfg.onPick || (() => {}),
      clock: new THREE.Clock(), t: 0, last: now(), visible: true, dirty: true, dpr, canvas,
      capDust, dustFractionFloor: 0.5, rotX: 0.18, rotY: 0.4, zoomPct: 100,
      tgt: { scatter: 0, grey: 0, flow: 0.022, mix: 1, focus: -1, focusAmt: 0 },
      feedT0: -1, frameMs: [], frames: 0, stepChecked: false,
    };

    applyState(S.state);
    resize();
    bindInteraction();
    loop();
    return { ok: true };
  }

  function now(): number {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function applyState(state: MindEvidenceState) {
    if (!S) return;
    S.state = state;
    // A2: empty shows the FORMED mind with NO bright nodes. Scatter is reserved for loading + error.
    if (state === "loading") { S.tgt.scatter = 0.55; S.tgt.grey = 0; S.nodes.visible = false; }
    else if (state === "error") { S.tgt.scatter = 0.9; S.tgt.grey = 1; S.nodes.visible = false; }
    else if (state === "empty") { S.tgt.scatter = 0; S.tgt.grey = 0; S.nodes.visible = false; }
    else { S.tgt.scatter = 0; S.tgt.grey = 0; S.nodes.visible = S.nodeRecords.length > 0; }
    markDirty();
  }

  // Mark that a discrete change happened (drag, zoom, theme, data, state). The always-running loop
  // renders ONE frame for it even when the orb is otherwise static (paused / reduced-motion), then
  // clears the flag. This is what keeps drag-to-rotate + wheel-zoom alive with the orbit paused.
  function markDirty() { if (S) { S.last = now(); S.dirty = true; } }

  function applyTheme(dark: boolean, mineral?: MindMineralMode) {
    if (!S) return;
    S.dark = dark;
    if (mineral) S.mineral = mineral;
    const light = !dark && S.mineral === "light";
    S.U.uLight.value = light ? 1 : 0;
    const frag = fragFor(S.mineral, dark);
    const blend = blendFor(S.mineral, dark);
    for (const mat of [S.dustMat, S.nodeMat, S.streamMat]) {
      mat.fragmentShader = mat === S.streamMat ? mat.fragmentShader : frag;
      mat.blending = blend;
      mat.needsUpdate = true;
    }
    markDirty();
  }

  function setData(records: MindOrbRecordNode[], state?: MindEvidenceState) {
    if (!S) return;
    // Node COUNT changes are handled by a canvas re-mount (the caller's orbKey covers every record id),
    // so here we only re-colour/reposition in place when the ids match; on any count change we rebuild
    // the node geometry defensively (still no rotation reset — the group's rotation is untouched).
    const recs = records || [];
    if (recs.length !== S.nodeRecords.length) {
      const old = S.nodes.geometry;
      const geo = buildNodes(recs, S.domains);
      S.nodes.geometry = geo;
      old.dispose(); // free the superseded geometry now; the live one is freed once at dispose()
    } else {
      // in-place recolour/reposition (ids may differ but count is stable)
      const centers = S.domains.map(domainCenter);
      const idxOf = new Map(S.domains.map((d, i) => [d.key, i]));
      const pos = S.nodes.geometry.getAttribute("position") as THREE.BufferAttribute;
      const col = S.nodes.geometry.getAttribute("aColor") as THREE.BufferAttribute;
      const meta = S.nodes.geometry.getAttribute("aMeta") as THREE.BufferAttribute;
      recs.forEach((rec, i) => {
        const di = idxOf.get(rec.domain) ?? 0;
        const seed = hashSeed(rec.id);
        const r = makeRng(seed);
        const p = synapsePoint(centers[di] ?? centers[0], r, false);
        pos.setXYZ(i, p[0], p[1], p[2]);
        const c = TIER_RGB[rec.tier] ?? TIER_RGB.grounded;
        col.setXYZ(i, c[0], c[1], c[2]);
        // keep ALL of aMeta in sync with the new record so focus dim/brighten + feed flash target the
        // RIGHT node (y is the domain index the shader reads): x seed, y domain, z size, w alpha.
        meta.setXYZW(i, (seed % 1000) / 1000, di, 1.7 + ((seed >>> 6) % 50) / 100, 0.95);
      });
      pos.needsUpdate = true; col.needsUpdate = true; meta.needsUpdate = true;
    }
    S.nodeRecords = recs;
    if (state) applyState(state);
    else applyState(S.state);
    markDirty();
  }

  function setState(state: MindEvidenceState) { applyState(state); }

  function focus(domainKey: string | null) {
    if (!S) return;
    S.focusKey = domainKey || null;
    S.tgt.focus = domainKey && S.domainIndex.has(domainKey) ? (S.domainIndex.get(domainKey) as number) : -1;
    S.tgt.focusAmt = domainKey ? 1 : 0;
    markDirty();
  }

  function fireFeed(domainKey: string) {
    if (!S) return;
    const di = S.domainIndex.get(domainKey);
    if (di == null) return;
    const c = domainCenter(S.domains[di]);
    S.streamU.uA.value.set(c[0] * 3.1, c[1] * 3.1 + 0.4, c[2] * 3.1);
    S.streamU.uB.value.set(c[0] * 1.08 * 0.72, c[1] * 1.08 * 0.72, c[2] * 1.08 * 0.72);
    S.U.uFlashD.value = di;
    // Reduced-motion NEVER animates on a new record (#1303 P2): feedVisual returns neither a stream
    // nor a flash, so the render loop stays idle — the new node still appears statically via setData.
    const fv = feedVisual(S.reduced, S.running);
    if (fv.stream) { S.stream.visible = true; S.feedT0 = now(); }
    else if (fv.flash) { S.U.uFlash.value = 0.9; markDirty(); }
  }

  function setRunning(v: boolean) { if (!S) return; S.running = v; S.last = now(); markDirty(); }
  function setReduced(v: boolean) {
    if (!S) return; S.reduced = v; S.U.uReduced.value = v ? 1 : 0;
    // Turning reduced-motion ON clears any in-flight feed flash so the loop goes idle instead of
    // decaying a residual flash frame by frame (#1303 P2).
    if (v) { S.stream.visible = false; S.feedT0 = -1; S.U.uFlash.value = 0; }
    S.last = now(); markDirty();
  }
  // The default framing distance for the current aspect/screen; zoom is applied ON TOP of it as a
  // percentage, so a resize preserves the user's zoom instead of snapping back to default.
  function baseZoomZ(): number {
    const r = S.canvas.getBoundingClientRect();
    const aspect = Math.max(0.0001, r.width) / Math.max(1, r.height);
    return aspect < 0.85 ? 6.2 : Math.min(window.innerWidth, window.innerHeight) < 700 ? 5.2 : 4.5;
  }
  function applyZoom() {
    if (!S) return;
    const z = Math.max(2.6, Math.min(9, baseZoomZ() * (100 / Math.max(1, S.zoomPct))));
    S.camera.position.z = z; S.U.uCamZ.value = z; S.camera.updateProjectionMatrix();
  }
  function setZoom(percent: number) { if (!S) return; S.zoomPct = Math.max(40, Math.min(260, percent)); applyZoom(); markDirty(); }
  function zoomBy(factor: number) { if (!S) return; S.zoomPct = Math.max(40, Math.min(260, S.zoomPct * factor)); applyZoom(); markDirty(); }
  function reset() {
    if (!S) return;
    S.focusKey = null; S.tgt.focus = -1; S.tgt.focusAmt = 0;
    S.rotX = 0.18; S.rotY = 0.4; S.zoomPct = 100;
    applyZoom(); markDirty();
  }

  function bindInteraction() {
    if (!S) return;
    const cv = S.canvas;
    const drag = { x: 0, y: 0, on: false, moved: false };
    cv.addEventListener("pointerdown", (e) => { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = false; try { cv.setPointerCapture(e.pointerId); } catch { /* older browsers */ } });
    cv.addEventListener("pointermove", (e) => {
      if (!drag.on || !S) return;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
      S.rotY += (e.clientX - drag.x) * 0.006;
      S.rotX = Math.max(-1.1, Math.min(1.1, S.rotX + (e.clientY - drag.y) * 0.006));
      drag.x = e.clientX; drag.y = e.clientY; markDirty();
    });
    cv.addEventListener("pointerup", (e) => { if (drag.on && !drag.moved) pickAt(e); drag.on = false; });
    cv.addEventListener("pointercancel", () => { drag.on = false; });
    // Scroll / trackpad to zoom (advertised in the aria-label + hint). Incremental, clamped.
    cv.addEventListener("wheel", (e) => { if (!S) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.08 : 0.926); }, { passive: false });
    cv.addEventListener("keydown", (e) => {
      if (!S) return;
      const k = e.key; const step = 0.16;
      if (k === "ArrowLeft") S.rotY -= step;
      else if (k === "ArrowRight") S.rotY += step;
      else if (k === "ArrowUp") S.rotX = Math.max(-1.1, S.rotX - step);
      else if (k === "ArrowDown") S.rotX = Math.min(1.1, S.rotX + step);
      else if (k === "+" || k === "=") { zoomBy(1.1); e.preventDefault(); return; } // zoomBy already marks dirty
      else if (k === "-") { zoomBy(0.9); e.preventDefault(); return; }
      else if (k === "Enter") { pickFront(); return; }
      else return;
      e.preventDefault(); markDirty();
    });
  }

  // The EFFECTIVE world position of every node — base position × the shader's focus scale, then the
  // group's world matrix — so hit-testing lands on what is DRAWN under focus, not the pre-focus
  // position (#1303 P2). Both pick paths (pointer + keyboard Enter) share this one computation so
  // rendered and pickable positions can never diverge (§18).
  function effectiveNodeWorld(): Vec3[] {
    S.group.updateMatrixWorld();
    const pos = S.nodes.geometry.getAttribute("position") as THREE.BufferAttribute;
    const meta = S.nodes.geometry.getAttribute("aMeta") as THREE.BufferAttribute;
    const uFocus = S.U.uFocus.value, uFocusAmt = S.U.uFocusAmt.value;
    const v = new THREE.Vector3();
    const out: Vec3[] = [];
    for (let i = 0; i < S.nodeRecords.length; i++) {
      const f = focusScale(meta.getY(i), uFocus, uFocusAmt);
      v.set(pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f).applyMatrix4(S.group.matrixWorld);
      out.push([v.x, v.y, v.z]);
    }
    return out;
  }
  function pickAt(e: PointerEvent) {
    if (!S || !S.nodes.visible || S.nodeRecords.length === 0) return;
    const rect = S.canvas.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    S.raycaster = S.raycaster || new THREE.Raycaster();
    S.raycaster.setFromCamera(m, S.camera);
    const o = S.raycaster.ray.origin, d = S.raycaster.ray.direction;
    const idx = pickRayIndex(effectiveNodeWorld(), [o.x, o.y, o.z], [d.x, d.y, d.z], 0.12);
    if (idx >= 0) { const rec = S.nodeRecords[idx]; if (rec) S.onPick(rec); }
  }
  function pickFront() {
    if (!S || S.nodeRecords.length === 0) return;
    const c = S.camera.position;
    const idx = pickFrontIndex(effectiveNodeWorld(), [c.x, c.y, c.z]);
    if (idx >= 0) { const rec = S.nodeRecords[idx]; if (rec) S.onPick(rec); }
  }

  function resize() {
    if (!S) return;
    const rect = S.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    S.renderer.setPixelRatio(S.dpr);
    S.renderer.setSize(w, h, false);
    S.camera.aspect = w / h;
    applyZoom(); // recompute camera z from the NEW aspect × the user's zoom (never snaps zoom back)
    S.U.uPx.value = h * S.dpr * 0.0185; // A1: v2 uPx
    markDirty();
  }

  function ease(a: number, b: number, k: number): number { return a + (b - a) * k; }

  function render() {
    if (!S) return;
    const nowT = now();
    let dt = (nowT - S.last) / 1000; S.last = nowT;
    if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0;
    const animate = S.running && !S.reduced;
    if (animate) { S.t += dt; S.rotY += dt * 0.07; }
    S.U.uT.value = S.t;
    const k = animate ? Math.min(1, dt * 2.4) : 1;
    S.U.uScatter.value = ease(S.U.uScatter.value, S.tgt.scatter + (S.state === "loading" && animate ? Math.sin(S.t * 1.3) * 0.12 : 0), k);
    S.U.uGrey.value = ease(S.U.uGrey.value, S.tgt.grey, k);
    S.U.uFlow.value = ease(S.U.uFlow.value, animate ? 0.022 : 0, k);
    if (S.tgt.focus >= 0) S.U.uFocus.value = S.tgt.focus;
    S.U.uFocusAmt.value = ease(S.U.uFocusAmt.value, S.tgt.focusAmt, k);
    // feed stream progress
    if (S.feedT0 >= 0) {
      const fp = (nowT - S.feedT0) / 1700;
      S.streamU.uP.value = fp;
      if (fp > 0.75) S.U.uFlash.value = Math.max(S.U.uFlash.value, 0.9 * (1 - Math.abs(fp - 0.95) * 4));
      if (fp >= 1.05) { S.feedT0 = -1; S.stream.visible = false; }
    }
    S.U.uFlash.value *= 1 - Math.min(1, dt * 1.6);
    S.group.rotation.set(S.rotX, S.rotY, 0);
    S.group.updateMatrixWorld();
    S.renderer.render(S.scene, S.camera);
    // A5 measurement (real frame times)
    const frameMs = now() - nowT;
    S.frameMs.push(frameMs); if (S.frameMs.length > 180) S.frameMs.shift();
    S.frames++;
    // adaptive one-time step-down (hard floor keeps the FORM readable — A1/A5)
    if (!S.stepChecked && S.frames >= 90 && animate) {
      S.stepChecked = true;
      const sorted = [...S.frameMs].sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
      if (p95 > 22 && S.U.uDustFraction.value > S.dustFractionFloor) {
        S.U.uDustFraction.value = Math.max(S.dustFractionFloor, 0.66);
      }
    }
  }

  // ONE perpetual loop, started once at init and never stopped (only paused when offscreen/hidden and
  // cancelled at dispose). It renders every frame while ANIMATING or mid-transition, and exactly one
  // frame per discrete `dirty` change (drag/zoom/theme/data) while otherwise static — so a paused or
  // reduced-motion orb still responds to interaction.
  function loop() {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    const tick = () => {
      if (!S) return;
      if (!S.visible || (typeof document !== "undefined" && document.hidden)) { S.raf = requestAnimationFrame(tick); return; }
      const active =
        (S.running && !S.reduced) ||
        S.feedT0 >= 0 ||
        S.U.uFlash.value > 0.01 ||
        Math.abs(S.U.uScatter.value - S.tgt.scatter) > 1e-4 ||
        Math.abs(S.U.uFocusAmt.value - S.tgt.focusAmt) > 1e-4;
      if (active) render();
      else if (S.dirty) { render(); S.dirty = false; }
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }

  function setVisible(v: boolean) { if (S) { S.visible = v; if (v) { S.clock.getDelta(); markDirty(); } } }
  function available() { return !!S; }

  function measure(): MindOrbMeasure {
    if (!S) return { particlesDust: 0, particlesNodes: 0, dustFraction: 1, fps: 0, p50FrameMs: 0, p95FrameMs: 0, frames: 0 };
    const sorted = [...S.frameMs].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const avg = S.frameMs.length ? S.frameMs.reduce((a, b) => a + b, 0) / S.frameMs.length : 0;
    return {
      particlesDust: Math.round(S.capDust * S.U.uDustFraction.value),
      particlesNodes: S.nodeRecords.length,
      dustFraction: S.U.uDustFraction.value,
      fps: avg > 0 ? Math.min(60, Math.round(1000 / Math.max(avg, 1000 / 60))) : 0,
      p50FrameMs: Math.round(p50 * 100) / 100,
      p95FrameMs: Math.round(p95 * 100) / 100,
      frames: S.frames,
    };
  }

  function dispose() {
    if (!S) return;
    const renderer = S.renderer;
    cancelAnimationFrame(S.raf);
    try {
      S.disposables.forEach((d) => d && d.dispose && d.dispose());
      S.nodes.geometry.dispose();
      S.dust.geometry.dispose();
    } catch (e) {
      console.error("[mind-orb] non-fatal error during dispose; still releasing the GPU context.", e);
    } finally {
      try { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } catch { /* best-effort */ }
    }
    S = null;
  }

  const started = init(canvas, cfg);
  if ("error" in started) return { ok: false, error: started.error };
  const handle: MindOrbHandle = {
    applyTheme, setData, setState, focus, fireFeed, setRunning, setReduced, setZoom, reset, resize,
    dispose, setVisible, available, pickFront, measure,
  };
  return { ok: true, handle };
}

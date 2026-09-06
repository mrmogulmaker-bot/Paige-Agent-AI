// Mind Orb — real Three.js engine, PROMOTED from the owner-approved prototype
// (docs/prototypes/_build/orb-entry.mjs) into a typed source module for the real app.
//
// Rendering is FROZEN (§28): geometry, materials, colours, bloom, lighting, camera and motion are
// byte-faithful to the approved prototype. The ONLY things changed in this promotion are module
// STRUCTURE — the singleton IIFE (`const MindOrb = (() => {…})()` + `window.MindOrb`) became an
// exported per-instance factory `createMindOrb(canvas, cfg)`, so each call owns a fully independent
// scene/renderer/state (no module-level shared state, no globals) — and the addition of TypeScript
// types. No pixel of the look was touched.
//
// Genuine dimensionality: a fresnel-glass globe with a lat/long lattice, tilted glowing orbital
// rings, a faceted luminous core, source-coloured instanced record nodes, constellation links,
// drifting dust, PBR lighting + environment, and real UnrealBloom. Calm continuous idle rotation
// (autoRotate) that never resets when data changes; OrbitControls drag + keyboard + reset;
// reduced-motion static; offscreen/hidden pause; idle-throttle (render only when dirty while
// static); DPR capped at 2; full disposal.
//
// The engine renders PRESENTATION. Node colours/positions carry a record's canonical source STATE;
// it never fabricates activity. The page owns the honesty labels, drawer, states and fallback.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// ---------------------------------------------------------------------------
// Public types (exported)
// ---------------------------------------------------------------------------

/**
 * A record node the orb presents. `id/domain/label/colorHex/dir` (+ `hub`/`ghost`) are what the
 * engine reads; the index signature lets a caller attach its OWN ref data (record id, payload,
 * etc.) which the engine never touches and `onPick` hands back on the ORIGINAL object.
 */
export interface MindOrbNode {
  id: string;
  domain: string;
  hub?: boolean;
  ghost?: boolean;
  label: string;
  colorHex: number;
  dir: { x: number; y: number; z: number };
  // Callers may attach their own fields; returned untouched by onPick.
  [k: string]: unknown;
}

export interface MindOrbRing {
  tilt: number;
  spin: number;
  color: number;
  a: number;
}

export interface MindOrbConfig {
  nodes: MindOrbNode[];
  rings: MindOrbRing[];
  dark: boolean;
  running: boolean;
  reduced: boolean;
  dust?: number;
  colors?: unknown;
  onPick?: (n: MindOrbNode) => void;
}

/** The controllable handle a successful `createMindOrb` returns. */
export interface MindOrbHandle {
  applyTheme(colors: unknown, dark: boolean): void;
  setData(payload: MindOrbDataPayload): void;
  focus(key: string | null): void;
  search(q: string): void;
  setZoom(percent: number): void;
  setRunning(v: boolean): void;
  setReduced(v: boolean): void;
  reset(): void;
  resize(): void;
  dispose(): void;
  setVisible(v: boolean): void;
  available(): boolean;
  pickFront(): void;
}

/** `setData` accepts `{nodes,rings}` or a bare nodes array (as the prototype did). */
export type MindOrbDataPayload =
  | { nodes?: MindOrbNode[]; rings?: MindOrbRing[] }
  | MindOrbNode[]
  | null
  | undefined;

export type MindOrbInit =
  | { ok: true; handle: MindOrbHandle }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A node with the transient fields the engine attaches during layout (never fabricated data). */
interface InternalNode extends MindOrbNode {
  _pos?: THREE.Vector3;
  _baseScale?: number;
}

interface RingEntry {
  g: THREE.Group;
  spin: number;
  mat: THREE.MeshBasicMaterial;
}

interface DisposableLike {
  dispose?: () => void;
}

interface State {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  world: THREE.Group;
  controls: OrbitControls;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  rings: RingEntry[];
  core: THREE.Group;
  coreMesh: THREE.Mesh;
  coreHalo: THREE.Sprite;
  inst: THREE.InstancedMesh;
  nodes: InternalNode[];
  hubSprites: { sp: THREE.Sprite; n: InternalNode }[];
  dummy: THREE.Object3D;
  pmrem: THREE.PMREMGenerator;
  envTex: THREE.Texture;
  disposables: DisposableLike[];
  raf: number;
  running: boolean;
  reduced: boolean;
  dark: boolean;
  focusKey: string | null;
  searchQ: string;
  onPick: (n: MindOrbNode) => void;
  t: number;
  clock: THREE.Clock;
  visible: boolean;
  dirty: boolean;
  dpr: number;
  canvas: HTMLCanvasElement;
  raycaster?: THREE.Raycaster;
}

// ---------------------------------------------------------------------------
// Module-level pure helpers (stateless — safe to share across instances)
// ---------------------------------------------------------------------------

function radialSprite(hex: string): THREE.CanvasTexture {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, hex); grd.addColorStop(0.25, hex);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 32, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const FRESNEL_VERT = `
  varying vec3 vN; varying vec3 vV;
  void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal);
    vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`;
const FRESNEL_FRAG = `
  uniform vec3 uColor; uniform float uPower; uniform float uIntensity;
  varying vec3 vN; varying vec3 vV;
  void main(){ float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)),0.0,1.0), uPower);
    gl_FragColor = vec4(uColor * f * uIntensity, f); }`;

// ---------------------------------------------------------------------------
// Factory — one fully independent orb instance per call. No globals, no shared state.
// ---------------------------------------------------------------------------

export function createMindOrb(canvas: HTMLCanvasElement, cfg: MindOrbConfig): MindOrbInit {
  let S: State | null = null; // scene state / disposables — per-instance, closure-scoped

  function hex(n: number) { return new THREE.Color(n); }

  function init(canvas: HTMLCanvasElement, cfg: MindOrbConfig): { ok: true } | { ok: false; error: string } {
    dispose(); // idempotent
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
      const test = renderer.getContext();
      if (!test) throw new Error("no webgl context");
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
    const DPRcap = 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPRcap));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.05, 3.25);
    scene.add(camera);

    // environment for PBR reflection on glass/nodes. RoomEnvironment is a throwaway Scene of lit
    // boxes PMREM bakes into a cube map once — dispose its geometries/materials immediately after
    // baking so they don't leak for the life of the orb (§32/§13: clean up what we allocate).
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTex = pmrem.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    scene.environment = envTex;

    const world = new THREE.Group(); scene.add(world);
    const R = 1.0;

    // --- glass globe: faint physical shell + fresnel rim + lat/long lattice ---
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a0a12, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.05,
      clearcoat: 1, clearcoatRoughness: 0.2, ior: 1.3, envMapIntensity: 1.1, side: THREE.DoubleSide,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), shellMat); world.add(shell);
    const rimMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: hex(0xead5aa) }, uPower: { value: 2.6 }, uIntensity: { value: 1.1 } },
      vertexShader: FRESNEL_VERT, fragmentShader: FRESNEL_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide,
    });
    const rim = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, 64, 48), rimMat); world.add(rim);
    // lat/long lattice from a wireframe of a coarse sphere
    const grid = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(R * 0.999, 24, 16)),
      new THREE.LineBasicMaterial({ color: 0xead5aa, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false }));
    world.add(grid);

    // --- orbital rings (tilted, glowing, per-signal tint) ---
    const ringGroup = new THREE.Group(); world.add(ringGroup);
    const ringDisposables: DisposableLike[] = [];
    const rings: RingEntry[] = (cfg.rings || []).map((r) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: hex(r.color), transparent: true, opacity: r.a, blending: THREE.AdditiveBlending, depthWrite: false });
      const tgeo = new THREE.TorusGeometry(R * 1.14, 0.004, 8, 220);
      const torus = new THREE.Mesh(tgeo, mat);
      torus.rotation.x = r.tilt; torus.rotation.y = r.tilt * 0.4;
      g.add(torus); ringGroup.add(g);
      ringDisposables.push(tgeo, mat);
      return { g, spin: r.spin, mat };
    });

    // --- core: faceted luminous jewel ---
    const core = new THREE.Group(); world.add(core);
    const coreMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1),
      new THREE.MeshStandardMaterial({ color: 0xfff0cf, emissive: 0xffdf9a, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.1 }));
    core.add(coreMesh);
    const coreWire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.OctahedronGeometry(0.19, 0)),
      new THREE.LineBasicMaterial({ color: 0xfff0cf, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.add(coreWire);
    const coreHaloTex = radialSprite("rgba(255,238,196,1)");
    const coreHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: coreHaloTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
    coreHalo.scale.set(0.66, 0.66, 1); core.add(coreHalo);

    // --- record nodes (instanced) + hub halos ---
    const nodes = (cfg.nodes || []) as InternalNode[];
    const nodeGeo = new THREE.SphereGeometry(1, 12, 12);
    const nodeMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    const inst = new THREE.InstancedMesh(nodeGeo, nodeMat, Math.max(1, nodes.length));
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D();
    const haloTex = radialSprite("rgba(255,255,255,1)");
    const hubSprites: { sp: THREE.Sprite; n: InternalNode }[] = [];
    function place() {
      nodes.forEach((n, i) => {
        const p = new THREE.Vector3(n.dir.x, n.dir.y, n.dir.z).multiplyScalar(R * (n.hub ? 1.0 : 0.98));
        n._pos = p;
        const s = (n.hub ? 0.055 : n.ghost ? 0.016 : 0.03);
        n._baseScale = s;
        dummy.position.copy(p); dummy.scale.setScalar(s); dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        inst.setColorAt(i, hex(n.colorHex).multiplyScalar(n.ghost ? 0.5 : 1));
      });
      inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    }
    place(); world.add(inst);
    nodes.forEach((n) => {
      if (!n.hub) return;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color: hex(n.colorHex), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
      sp.position.copy(n._pos); sp.scale.set(0.34, 0.34, 1); world.add(sp); hubSprites.push({ sp, n });
    });

    // --- constellation links (same-domain neighbours) ---
    const linkPos: number[] = [], linkCol: number[] = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.domain !== b.domain || a.ghost || b.ghost) continue;
      if (a._pos.distanceTo(b._pos) > 0.9) continue;
      const c = hex(a.colorHex);
      linkPos.push(a._pos.x, a._pos.y, a._pos.z, b._pos.x, b._pos.y, b._pos.z);
      linkCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute("position", new THREE.Float32BufferAttribute(linkPos, 3));
    linkGeo.setAttribute("color", new THREE.Float32BufferAttribute(linkCol, 3));
    const links = new THREE.LineSegments(linkGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    world.add(links);

    // --- dust (decorative, non-record) ---
    const dustN = cfg.dust ?? 260; const dp: number[] = [];
    for (let i = 0; i < dustN; i++) {
      const a = i * 2.399963, y = 1 - (i / Math.max(1, dustN - 1)) * 2, rr = Math.sqrt(Math.max(0, 1 - y * y));
      dp.push(Math.cos(a) * rr * R * 1.28, y * R * 1.28, Math.sin(a) * rr * R * 1.28);
    }
    const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dp, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xead5aa, size: 0.012, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    world.add(dust);

    // --- lights ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffe6b0, 1.4); key.position.set(3, 4, 5); scene.add(key);
    const rimL = new THREE.DirectionalLight(0x9bb0e0, 0.7); rimL.position.set(-4, -2, -3); scene.add(rimL);
    const corePt = new THREE.PointLight(0xffdf9a, 1.05, 6); core.add(corePt);

    // --- controls ---
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.07;
    controls.enablePan = false; controls.minDistance = 2.4; controls.maxDistance = 4.6;
    controls.rotateSpeed = 0.7;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.45; // calm, continuous
    // mark the frame dirty on any camera change (drag / zoom / damping settle) so the
    // idle-throttle still renders through user interaction while the orb is static.
    controls.addEventListener("start", () => { if (S) S.dirty = true; });
    controls.addEventListener("change", () => { if (S) S.dirty = true; });

    // --- post: real UnrealBloom ---
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.18);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const ray = new THREE.Raycaster(); ray.params.Line.threshold = 0.02;
    S = { renderer, scene, camera, world, controls, composer, bloom, rings, core, coreMesh, coreHalo,
      inst, nodes, hubSprites, dummy, pmrem, envTex, disposables: [shell.geometry, shellMat, rim.geometry, rimMat,
        grid.geometry, grid.material, nodeGeo, nodeMat, haloTex, coreHaloTex, coreMesh.geometry, coreMesh.material,
        coreWire.geometry, coreWire.material, linkGeo, links.material, dustGeo, dust.material, ...ringDisposables],
      raf: 0, running: cfg.running !== false, reduced: !!cfg.reduced, dark: cfg.dark !== false,
      focusKey: null, searchQ: "", onPick: cfg.onPick || (() => {}), t: 0, clock: new THREE.Clock(),
      visible: true, dirty: true, dpr: Math.min(window.devicePixelRatio || 1, DPRcap), canvas };

    applyTheme(cfg.colors, S.dark);
    resize();
    bindInteraction();
    loop();
    return { ok: true };
  }

  function applyTheme(colors: unknown, dark: boolean) {
    if (!S) return; S.dark = dark;
    // bloom washes out on the light ground → keep it subtle in Mineral, full in Obsidian
    S.bloom.strength = dark ? 0.6 : 0.26;
    S.bloom.radius = dark ? 0.5 : 0.4;
    S.bloom.threshold = dark ? 0.28 : 0.5;
    S.renderer.toneMappingExposure = dark ? 1.05 : 1.0;
    render(true);
  }

  function bindInteraction() {
    const cv = S.canvas; const drag = { x: 0, y: 0, moved: false, on: false };
    cv.addEventListener("pointerdown", (e) => { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; drag.moved = false; if (S) S.dirty = true; });
    cv.addEventListener("wheel", () => { if (S) S.dirty = true; }, { passive: true });
    cv.addEventListener("pointermove", (e) => { if (drag.on && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true; });
    cv.addEventListener("pointerup", (e) => { if (drag.on && !drag.moved) pickAt(e); drag.on = false; });
    cv.addEventListener("keydown", (e) => {
      const k = e.key; const step = 0.18;
      if (k === "ArrowLeft") orbitBy(-step, 0);
      else if (k === "ArrowRight") orbitBy(step, 0);
      else if (k === "ArrowUp") orbitBy(0, -step);
      else if (k === "ArrowDown") orbitBy(0, step);
      else if (k === "+" || k === "=") S.camera.position.multiplyScalar(0.92);
      else if (k === "-") S.camera.position.multiplyScalar(1.08);
      else if (k === "Enter") pickFront();
      else return;
      e.preventDefault(); S.controls.update(); render(true);
    });
  }

  // Orbit helpers — OrbitControls (r0.169) exposes getters but NO setAzimuthalAngle/setPolarAngle,
  // so we set the camera from a Spherical around controls.target (clamped to a sane polar range).
  function orbitTo(azAbs: number | null, polAbs: number | null) {
    if (!S) return;
    const off = S.camera.position.clone().sub(S.controls.target);
    const sp = new THREE.Spherical().setFromVector3(off);
    if (azAbs != null) sp.theta = azAbs;
    if (polAbs != null) sp.phi = Math.max(0.35, Math.min(2.79, polAbs));
    sp.makeSafe(); off.setFromSpherical(sp);
    S.camera.position.copy(S.controls.target).add(off); S.controls.update();
  }
  function orbitBy(dTheta: number, dPhi: number) {
    if (!S) return;
    const off = S.camera.position.clone().sub(S.controls.target);
    const sp = new THREE.Spherical().setFromVector3(off);
    sp.theta += dTheta; sp.phi = Math.max(0.35, Math.min(2.79, sp.phi + dPhi));
    sp.makeSafe(); off.setFromSpherical(sp);
    S.camera.position.copy(S.controls.target).add(off); S.controls.update();
  }
  function pickAt(e: MouseEvent) {
    const r = S.canvas.getBoundingClientRect();
    const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    S.raycaster = S.raycaster || new THREE.Raycaster();
    S.raycaster.setFromCamera(m, S.camera);
    const hit = S.raycaster.intersectObject(S.inst)[0];
    if (hit && hit.instanceId != null) { const n = S.nodes[hit.instanceId]; if (n && !n.ghost) S.onPick(n); }
  }
  function pickFront() {
    // nearest node to camera (in front)
    let best: InternalNode | null = null, bd = Infinity;
    S.nodes.forEach((n) => { if (n.ghost) return; const w = n._pos.clone().applyMatrix4(S.world.matrixWorld); const d = w.distanceTo(S.camera.position); if (d < bd) { bd = d; best = n; } });
    if (best) S.onPick(best);
  }

  // Unified emphasis: node colour = base(source state) × focus-dim × search-dim.
  // Never fabricates a colour — it only dims/brightens the canonical source colour a node already carries.
  function applyEmphasis() {
    if (!S) return;
    const key = S.focusKey, q = S.searchQ;
    S.nodes.forEach((n, i) => {
      const c = hex(n.colorHex).multiplyScalar(n.ghost ? 0.5 : 1);
      let f = 1;
      if (key && n.domain !== key) f *= 0.25;
      if (q) { const hit = (n.label || "").toLowerCase().includes(q); f *= hit ? 1 : 0.18; }
      S.inst.setColorAt(i, c.multiplyScalar(f));
    });
    if (S.inst.instanceColor) S.inst.instanceColor.needsUpdate = true;
    S.hubSprites.forEach(({ sp, n }) => {
      let o = 0.55;
      if (key && n.domain !== key) o = 0.15;
      if (q && !(n.label || "").toLowerCase().includes(q)) o = 0.12;
      sp.material.opacity = o;
    });
    render(true);
  }

  function focus(key: string | null) {
    if (!S) return; S.focusKey = key || null;
    applyEmphasis();
    if (key) { const hubNode = S.nodes.find((n) => n.domain === key && n.hub); if (hubNode) {
      const az = Math.atan2(hubNode.dir.x, hubNode.dir.z);
      const pol = Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, hubNode.dir.y)));
      orbitTo(az, pol); } }
    render(true);
  }

  function search(q: string) { if (!S) return; S.searchQ = (q || "").trim().toLowerCase(); applyEmphasis(); }

  function setData(payload: MindOrbDataPayload) { /* recolour nodes + rings in place; DO NOT reset rotation */
    if (!S || !payload) return;
    const nodes = Array.isArray(payload) ? payload : payload.nodes; // accepts {nodes,rings} or a bare nodes array
    // The instanced mesh is sized once at init; setData only RECOLOURS in place. The caller re-mounts
    // the canvas whenever the node count changes (its `orbKey` covers every id), so an overflow here
    // means that contract broke — warn loudly rather than silently dropping nodes off the orb (§32).
    if (Array.isArray(nodes)) {
      if (nodes.length > S.nodes.length) {
        console.warn(`[mind-orb] setData received ${nodes.length} nodes but the mesh holds ${S.nodes.length}; extra nodes ignored. The caller must re-mount on a node-count change (orbKey).`);
      }
      nodes.forEach((n, i) => { if (i < S.nodes.length && n) S.nodes[i].colorHex = n.colorHex; });
    }
    const rings = Array.isArray(payload) ? undefined : payload.rings;
    if (rings) rings.forEach((r, i) => { const rg = S.rings[i]; if (rg && rg.mat) { rg.mat.color.set(hex(r.color)); rg.mat.opacity = r.a; } });
    applyEmphasis(); // repaints nodes from fresh base, preserving focus + search
  }

  function setZoom(percent: number) {
    if (!S) return;
    const d = Math.max(S.controls.minDistance, Math.min(S.controls.maxDistance, 3.25 * (100 / Math.max(1, percent))));
    const dir = S.camera.position.clone(); if (dir.lengthSq() < 1e-6) dir.set(0, 0.015, 1); dir.normalize();
    S.camera.position.copy(dir.multiplyScalar(d)); S.controls.update(); render(true);
  }

  function setRunning(v: boolean) { if (!S) return; S.running = v; S.controls.autoRotate = v && !S.reduced; if (!v) render(true); else loop(); }
  function setReduced(v: boolean) { if (!S) return; S.reduced = v; S.controls.autoRotate = !v && S.running; render(true); if (!v && S.running) loop(); }
  function reset() { if (!S) return; S.searchQ = ""; S.controls.reset(); S.camera.position.set(0, 0.05, 3.25); focus(null); S.controls.update(); render(true); }

  function resize() {
    if (!S) return; const r = S.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    S.renderer.setPixelRatio(S.dpr); S.renderer.setSize(w, h, false);
    S.composer.setPixelRatio(S.dpr); S.composer.setSize(w, h);
    S.bloom.resolution.set(w, h);
    S.camera.aspect = w / h; S.camera.updateProjectionMatrix(); render(true);
  }

  // `_force` is accepted for the `render(true)` call sites (the prototype passed a truthy hint the
  // JS body ignored); the composite always runs the current frame. Kept so those call sites port 1:1.
  function render(_force?: boolean) {
    if (!S) return;
    const dt = Math.min(0.05, S.clock.getDelta());
    const animate = S.running && !S.reduced;
    if (animate) {
      S.t += dt;
      S.rings.forEach((r) => { r.g.rotation.y += dt * r.spin; });
      const pulse = 1 + Math.sin(S.t * 1.6) * 0.06;
      S.core.scale.setScalar(pulse); S.coreMesh.rotation.y += dt * 0.3; S.coreMesh.rotation.x += dt * 0.12;
      S.coreHalo.material.opacity = 0.8 + Math.sin(S.t * 1.6) * 0.12;
    }
    S.controls.update();
    S.composer.render();
  }

  function loop() {
    if (!S) return; cancelAnimationFrame(S.raf);
    const tick = () => {
      if (!S) return;
      // pause when hidden/offscreen
      if (!S.visible || document.hidden) { S.raf = requestAnimationFrame(tick); return; }
      // Idle-throttle: while animating (running + not reduced) render every frame; while STATIC
      // (paused or reduced-motion) render only when something changed (drag / zoom / damping /
      // theme / focus) — the last frame persists on-screen, so no full-bloom composite runs for
      // a still orb. This is the throttle the old dead `still` line only described.
      const animating = S.running && !S.reduced;
      if (animating) render();
      else if (S.dirty) { render(); S.dirty = false; }
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }

  function setVisible(v: boolean) { if (S) { S.visible = v; if (v) { S.clock.getDelta(); loop(); } } }

  function dispose() {
    if (!S) return;
    const renderer = S.renderer; // capture so the GPU teardown runs even if an earlier dispose throws
    cancelAnimationFrame(S.raf);
    try {
      S.controls.dispose();
      S.disposables.forEach((d) => d && d.dispose && d.dispose());
      S.coreHalo.material.dispose();                         // sprite material (was leaked)
      S.hubSprites.forEach(({ sp }) => sp.material.dispose()); // hub-halo sprite materials (were leaked)
      S.inst.dispose(); S.envTex.dispose(); S.pmrem.dispose();
      // EffectComposer.dispose() frees only its own render targets + copy pass, NOT the passes we
      // added — so dispose each pass (UnrealBloom's 11 render targets + blur/composite materials,
      // OutputPass) explicitly before the composer.
      S.composer.passes.forEach((p) => { try { (p as { dispose?: () => void }).dispose?.(); } catch { /* per-pass best-effort */ } });
      S.composer.dispose();
    } catch (e) {
      console.error("[mind-orb] non-fatal error during dispose; still releasing the GPU context.", e);
    } finally {
      // Release the WebGL context unconditionally — a throw above must never leak a live context
      // (each orb owns its own renderer; forceContextLoss reclaims all GPU memory for it).
      try { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } catch { /* best-effort */ }
    }
    S = null;
  }
  function available() { return !!S; }

  const started = init(canvas, cfg);
  // `in`-operator narrowing (not `!started.ok`): with this repo's `strict:false`, a boolean-literal
  // discriminant does NOT narrow a union, but the presence check does — keeps the {ok}/{ok,error} shape.
  if ("error" in started) return { ok: false, error: started.error };
  const handle: MindOrbHandle = {
    applyTheme, setData, focus, search, setZoom, setRunning, setReduced, reset, resize, dispose, setVisible, available, pickFront,
  };
  return { ok: true, handle };
}

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { presenceFrame, SILENT_ENERGY, type AudioEnergy, type PresenceState } from "@/lib/paigeLiveConversation/presence";

/**
 * Paige talking, drawn as the voice itself.
 *
 * WHAT THIS IS, AND THE TWO THINGS IT DELIBERATELY IS NOT. It is not a character: the sculpted
 * figure shipped here first and was rejected on sight, because a humanoid in the corner of a call is
 * a costume for presence rather than presence. It is not an orb either, and specifically not a
 * relative of the other orbs on this platform — the owner ruled those the wrong reference, so the
 * flat presence's lobe silhouette, the landing hero and the studio field are all deliberately NOT
 * borrowed from here. This is a wave. Her speech, given a body.
 *
 * THE ONE IDEA. A strand carries her voice across the frame. Amplitude lifts it; spectral
 * brightness decides the SHAPE of the lift, so a bright consonant reads as tight chop and a vowel as
 * a long swell. That is the "moving with her expressions" requirement, and it is why the wave is
 * built from two terms whose balance shifts rather than one sine with a volume knob — a single
 * frequency scaled by loudness is an amplitude meter, and an amplitude meter is not expression.
 *
 * CALM WHILE SHE IS BEING SPOKEN TO. Listening is the STILLEST state here, not a second excited one.
 * `presenceFrame` reports energy for speaking and listening alike, which is right for a generic
 * presence and wrong for this one: when someone interrupts her, she is receiving, so the strand
 * settles toward a near-straight line and the warm accent drains out of it. Only her own voice
 * moves it. That gating lives here, in presentation, and only ever REMOVES motion — it can never
 * manufacture any, so the honesty contract below is untouched.
 *
 * HONEST BY CONSTRUCTION (§13). Every animated value originates in `presenceFrame`, whose `energy`
 * is zero unless a real sample arrived from the output or microphone analyser and whose `detail`
 * carries real spectral brightness. A strand that rippled on a timer would look richer and would be
 * a lie about whether anything was heard. The resting breath is fixed, tiny and visibly not speech.
 *
 * GOLD IS THE ACT (§11). The strand is indigo at rest and through every listening moment. It crosses
 * to gold only as her own output amplitude rises. Nothing else in the frame is warm.
 */

/** Resting breath. Small and slow on purpose: it must never be mistaken for someone talking. */
const IDLE_LIFT = 0.055;
/** How far her real amplitude may throw the strand, in strand half-widths. */
const ENERGY_LIFT = 0.62;
/** Lengthwise resolution. The wave is sampled per vertex, so this is the smoothness of her voice. */
const SEGMENTS = 260;
/** Layered strands. Three reads as one thickening gesture; more reads as a stack of lines. */
const STRANDS = [
  { phase: 0.0, depth: 0.0, weight: 1.0, thickness: 0.055 },
  { phase: 1.9, depth: -0.28, weight: 0.62, thickness: 0.032 },
  { phase: 3.6, depth: 0.26, weight: 0.4, thickness: 0.022 },
] as const;

const SETTLED: ReadonlySet<PresenceState> = new Set(["held", "disconnected", "interrupted", "unavailable"]);

/**
 * Read one `H S% L%` design token into a colour.
 *
 * The scene lives in WebGL, where a CSS variable cannot reach, and answering that with hardcoded hex
 * makes the surface identical in both themes — silently breaking §23's requirement that light and
 * dark be unmistakably different. Resolving the real token at mount keeps the palette authoritative
 * in the one place it is written down.
 */
function token(styles: CSSStyleDeclaration, name: string, fallback: string): THREE.Color {
  const raw = styles.getPropertyValue(name).trim();
  const [h, s, l] = raw.split(/[\s/]+/);
  const colour = new THREE.Color();
  if (!h || !s || !l) return colour.set(fallback);
  const hue = Number.parseFloat(h), sat = Number.parseFloat(s), lum = Number.parseFloat(l);
  if (![hue, sat, lum].every(Number.isFinite)) return colour.set(fallback);
  return colour.setHSL(hue / 360, sat / 100, lum / 100);
}

const VERTEX = /* glsl */ `
uniform float uTime, uEnergy, uDetail, uIdle, uPhase, uWeight, uThickness;
varying vec2 vUv;
varying float vLift;

/**
 * The wave at a point along the strand.
 *
 * Two travelling terms, not one. The swell is slow and long — the body of a vowel. The chop is fast and
 * short and is scaled by spectral brightness, so it only appears on bright sounds. Their balance is
 * what makes the strand read as speech rather than as a level meter.
 */
float wave(float x){
  float swell = sin(x * 5.4 - uTime * 2.6 + uPhase)
              + 0.55 * sin(x * 8.9 + uTime * 1.7 - uPhase * 0.7);
  float chop  = sin(x * 26.0 - uTime * 11.0 + uPhase * 2.1)
              * 0.45 * uDetail;
  return swell * 0.5 + chop;
}

void main(){
  vUv = uv;

  // Zero at both ends and full in the middle, so the strand resolves into the frame instead of
  // being cut off by it. Raised to <1 so the taper is broad rather than a pinch at the centre.
  float taper = pow(sin(3.14159265 * uv.x), 0.75);

  float x = (uv.x - 0.5) * 6.2;
  // The resting breath is a different, much slower motion than speech, so silence never reads as a
  // quiet voice.
  float idle = sin(x * 1.6 + uTime * 0.85 + uPhase) * uIdle;
  float lift = taper * (idle + wave(x) * uEnergy * ${ENERGY_LIFT.toFixed(3)}) * uWeight;

  // The strand's own thickness also tapers, so the ends thin to nothing rather than stopping.
  // position.y already carries the strip's half-thickness from the geometry; taper narrows it.
  vec3 p = position;
  p.y = p.y * taper + lift;

  vLift = lift;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uRim, uGold;
uniform float uLight, uSpeak, uWeight;
varying vec2 vUv;
varying float vLift;

void main(){
  // Soft across the strand's thickness so the edge is light rather than a hard rule.
  float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float body = smoothstep(0.0, 1.0, across);

  // Ends fade out; the strand has no visible termination.
  float along = pow(sin(3.14159265 * vUv.x), 0.6);

  // Gold arrives ONLY with her own speech (§11). At rest and while listening this is zero and the
  // whole strand is indigo.
  vec3 colour = mix(uRim, uGold, clamp(uSpeak, 0.0, 1.0));

  // Crests carry a little more light than troughs, so the wave is legible as form, not just line.
  float crest = clamp(abs(vLift) * 1.6, 0.0, 1.0);
  // NOT additive. Additive blending reads beautifully on the dark theme and disappears entirely on
  // the light one, because adding to a near-white background is still near-white — which would make
  // the presence invisible for half the platform and fail §23 outright.
  float alpha = clamp((0.5 + uLight * 0.55 + crest * 0.5) * body * along * uWeight, 0.0, 1.0);

  gl_FragColor = vec4(colour, alpha);
  #include <colorspace_fragment>
}
`;

function Strand({ spec, material }: {
  spec: (typeof STRANDS)[number];
  material: THREE.ShaderMaterial;
}) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(6.2, spec.thickness, SEGMENTS, 1), [spec.thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={material} position={[0, 0, spec.depth]} />;
}

function Voice({ state, reduced, readEnergy, onCrash }: {
  state: PresenceState;
  reduced: boolean;
  readEnergy: () => AudioEnergy;
  onCrash: () => void;
}) {
  const invalidate = useThree((three) => three.invalidate);
  const viewport = useThree((three) => three.viewport);
  const group = useRef<THREE.Group>(null);
  const crashed = useRef(false);
  const settled = SETTLED.has(state);

  const materials = useMemo(() => {
    // Resolved once per mount against the live stylesheet, so the strand belongs to whichever theme
    // is actually on rather than to a hex someone typed.
    const styles = getComputedStyle(document.documentElement);
    // --primary, NOT --ring. The focus ring resolves to a pale gold (41 100% 91%) on the dark theme,
    // so sourcing the resting colour from it would have made the wave gold while nothing was being
    // said — gold spent on idling, which is the one thing §11 forbids. --primary is the indigo/violet
    // ground in both themes, which is what "indigo at rest" actually means.
    const rim = token(styles, "--primary", "#6c5ce0");
    const gold = token(styles, "--accent", "#ebb94c");
    return STRANDS.map((spec) => new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uDetail: { value: 0 },
        uLight: { value: 0.28 },
        uSpeak: { value: 0 },
        uIdle: { value: IDLE_LIFT },
        uPhase: { value: spec.phase },
        uWeight: { value: spec.weight },
        uThickness: { value: spec.thickness },
        uRim: { value: rim.clone() },
        uGold: { value: gold.clone() },
      },
    }));
  }, []);

  // Created here rather than handed over by a cache, so ours to free. The stage opens and closes
  // repeatedly and three.js frees no GPU memory on unmount.
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  // Fit the strand to whatever the container is, so the wave spans the frame at every size instead
  // of being framed for one viewport.
  useEffect(() => {
    if (!group.current) return;
    group.current.scale.setScalar(Math.min(viewport.width / 6.6, viewport.height / 2.2));
    if (reduced) invalidate();
  }, [viewport.width, viewport.height, reduced, invalidate]);

  // Reduced motion must SETTLE the strand, not freeze it mid-wave. The canvas is on `demand`, so put
  // the uniforms in their resting pose by hand and ask for the single frame that shows it — losing
  // the presence entirely is a worse answer to "please don't animate" than a still one.
  useEffect(() => {
    if (!reduced) return;
    const still = presenceFrame(state, 0);
    materials.forEach((m) => {
      m.uniforms.uTime.value = 0;
      m.uniforms.uEnergy.value = 0;
      m.uniforms.uDetail.value = 0;
      m.uniforms.uSpeak.value = 0;
      m.uniforms.uLight.value = still.light;
      m.uniforms.uIdle.value = 0;
    });
    invalidate();
  }, [reduced, state, materials, invalidate]);

  useFrame(({ clock }, delta) => {
    if (reduced || crashed.current) return;
    // A THROW HERE ESCAPES THE ERROR BOUNDARY ENTIRELY. R3F calls frame subscribers from inside a
    // requestAnimationFrame callback and React boundaries catch render and lifecycle errors only, so
    // an exception would repeat ~60 times a second forever, freeze the canvas on its last frame, and
    // never reach SceneBoundary or print the one console line the degrade contract rests on.
    try {
      const frame = presenceFrame(state, clock.elapsedTime, readEnergy());

      // ONLY HER OWN VOICE MOVES THE STRAND. While she is being spoken to she is receiving, so the
      // wave settles and the accent drains. This can only ever reduce motion below what
      // presenceFrame reported; it can never invent any.
      const hers = state === "speaking" ? frame.energy : 0;
      const detail = state === "speaking" ? frame.detail : 0;
      // Listening is the calmest state in the scene — calmer than idle, which is the point.
      const idle = state === "listening" ? IDLE_LIFT * 0.22 : settled ? IDLE_LIFT * 0.5 : IDLE_LIFT;

      for (const m of materials) {
        const u = m.uniforms;
        u.uTime.value = clock.elapsedTime;
        // Eased toward the sample rather than snapped to it: a voice envelope is continuous, and
        // per-frame jitter on the raw analyser value reads as noise rather than speech.
        u.uEnergy.value += (hers - u.uEnergy.value) * Math.min(1, delta * 12);
        u.uDetail.value += (detail - u.uDetail.value) * Math.min(1, delta * 9);
        u.uSpeak.value += (hers - u.uSpeak.value) * Math.min(1, delta * 6);
        u.uLight.value = frame.light;
        u.uIdle.value += (idle - u.uIdle.value) * Math.min(1, delta * 3);
      }
    } catch (error) {
      crashed.current = true;
      console.error("[PaigePresenceScene] the animation loop threw — standing down to the flat presence. Cause:", error);
      onCrash();
    }
  });

  return (
    <group ref={group}>
      {STRANDS.map((spec, i) => <Strand key={spec.phase} spec={spec} material={materials[i]} />)}
    </group>
  );
}

export default function PaigePresenceScene({ state, reduced, readEnergy = () => SILENT_ENERGY, onCrash = () => {} }: {
  state: PresenceState;
  reduced: boolean;
  readEnergy?: () => AudioEnergy;
  /** Called once if the animation loop throws — a boundary cannot see inside requestAnimationFrame. */
  onCrash?: () => void;
}) {
  return (
    <Canvas
      // Orthographic, because a waveform read at an angle is a waveform lying about its amplitude.
      orthographic
      camera={{ position: [0, 0, 5], zoom: 100 }}
      // Transparent, so the stage's own ground shows through rather than a second black rectangle.
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      dpr={[1, 1.75]}
      // A still frame is not motion: under reduced motion the scene renders once and stops, instead
      // of disappearing.
      frameloop={reduced ? "demand" : "always"}
      style={{ width: "100%", height: "100%" }}
    >
      <Voice state={state} reduced={reduced} readEnergy={readEnergy} onCrash={onCrash} />
    </Canvas>
  );
}

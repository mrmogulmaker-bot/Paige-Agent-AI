// orbInteraction — the pure, dependency-free decision math for the Mind orb's interaction seams.
//
// WHY THIS FILE EXISTS (§18 one home, §32 headless proof): the engine runs only with a real WebGL
// context, so its pick + feed logic cannot be unit-tested through `createMindOrb`. The selection and
// gating decisions that were WRONG in the first R1a cut (#1303 Codex P2s) are extracted here as pure
// functions the engine CALLS — so the rendered result and the tested result cannot diverge, and the
// fixes are proven headless before the GPU ever runs them:
//   - focusScale: the EXACT scale the vertex shader applies under focus, so hit-testing matches what
//     is drawn (pointer AND keyboard Enter).
//   - pickRayIndex / pickFrontIndex: selection over the EFFECTIVE (focus-scaled) world positions.
//   - feedVisual: reduced-motion NEVER animates on a new record.
//   - reconcileFeedSignal: a feed that arrives while the engine is still importing is HELD, not
//     dropped (it is not marked seen until it actually fires).
//
// No three, no React, no DOM — plain numbers only, so vitest exercises it in jsdom.

export type Vec3 = [number, number, number];

/**
 * The focus scale the vertex shader applies to a node's position:
 *   isF = step(abs(dm - uFocus), 0.5) * step(-0.5, uFocus)
 *   pos *= mix(1.0, mix(0.82, 1.12, isF), uFocusAmt)
 * A focused-domain node scales toward 1.12, every other node toward 0.82, interpolated by uFocusAmt
 * (0 = no focus → scale 1.0). Hit-testing must apply the SAME factor or a click/Enter lands on the
 * pre-focus position and opens the wrong record (#1303 P2).
 */
export function focusScale(domainIndex: number, uFocus: number, uFocusAmt: number): number {
  const isF = uFocus >= -0.5 && Math.abs(domainIndex - uFocus) <= 0.5 ? 1 : 0;
  const focused = 0.82 + isF * (1.12 - 0.82); // mix(0.82, 1.12, isF)
  return 1 + uFocusAmt * (focused - 1); // mix(1.0, focused, uFocusAmt)
}

/** Index of the world point nearest the camera (front-most). -1 when there are none. */
export function pickFrontIndex(world: Vec3[], cam: Vec3): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < world.length; i++) {
    const dx = world[i][0] - cam[0];
    const dy = world[i][1] - cam[1];
    const dz = world[i][2] - cam[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * Index of the front-most world point within `threshold` of the ray (origin `o`, unit direction `d`),
 * mirroring THREE's Points raycast: candidates are within the perpendicular threshold and in front of
 * the camera; among them the nearest along the ray wins. -1 when nothing is hit.
 */
export function pickRayIndex(world: Vec3[], o: Vec3, d: Vec3, threshold: number): number {
  let best = -1;
  let bestAlong = Infinity;
  for (let i = 0; i < world.length; i++) {
    const px = world[i][0] - o[0];
    const py = world[i][1] - o[1];
    const pz = world[i][2] - o[2];
    const along = px * d[0] + py * d[1] + pz * d[2];
    if (along <= 0) continue; // behind the camera
    const cx = px - along * d[0];
    const cy = py - along * d[1];
    const cz = pz - along * d[2];
    const perp = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (perp <= threshold && along < bestAlong) {
      bestAlong = along;
      best = i;
    }
  }
  return best;
}

/**
 * What a new-record feed should present. Reduced-motion returns NEITHER — the record still appears
 * statically via setData; nothing animates (#1303 P2: the old code set uFlash even when reduced,
 * which the render loop then decayed frame by frame). A paused-but-not-reduced orbit keeps the brief
 * flash (it is a deliberate motion the user did not opt out of).
 */
export function feedVisual(reduced: boolean, running: boolean): { stream: boolean; flash: boolean } {
  if (reduced) return { stream: false, flash: false };
  return running ? { stream: true, flash: false } : { stream: false, flash: true };
}

/**
 * Decide what to do with a feed signal. A signal whose token is new but arrives while the engine
 * handle is not yet ready is HELD (hold=true) and is NOT marked seen — so it survives to be flushed
 * once the handle mounts, instead of being silently dropped (#1303 P2). A signal fires (and is
 * marked seen) only when the handle is ready; an already-seen or absent token does nothing.
 */
export function reconcileFeedSignal(
  handleReady: boolean,
  token: number | undefined | null,
  seen: number | undefined | null,
): { fire: boolean; markSeen: boolean; hold: boolean } {
  if (token == null || token === seen) return { fire: false, markSeen: false, hold: false };
  if (handleReady) return { fire: true, markSeen: true, hold: false };
  return { fire: false, markSeen: false, hold: true };
}

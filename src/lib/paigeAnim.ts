// Shared, mutable animation drivers for the 3D Paige.
//
// Written by the landing page (PaigeHome) — the intro hand-off and the scroll
// position — and read every frame by the 3D scene (PaigeScene). It lives in its
// own tiny module (no three.js import) on purpose: PaigeScene is lazy-loaded to
// keep the heavy 3D chunk out of the initial bundle, so PaigeHome must be able
// to drive it without statically importing that chunk.
//
//   entrance — 0 at load. Driven to 1 when the phone intro finishes assembling
//              and Paige "pops out." The scene springs toward it (overshoot =
//              the pop) and gates her cursor rotation on it, so she only starts
//              tracking once she's out.
//   scroll   — 0 at the top of the hero, 1 once scrolled ~one viewport down.
//              The scene uses it to shrink her as the page scrolls.
export const paigeAnim = { entrance: 0, scroll: 0 };

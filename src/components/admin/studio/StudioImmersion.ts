// Lets the deep StudioShell child push the "first build in flight" flag UP to the StudioLayout
// parent, so the OUTER project rail can retract in lockstep with the inner conversation rail —
// the owner's Lovable/Replit "watch it build full-width, then settle into the studio" moment.
// No IO, no JSX — just a one-boolean channel across the nested-route boundary.
import { createContext, useContext } from "react";

export interface StudioImmersionValue {
  /** True while the FIRST build of a fresh project is in flight — both Studio rails retract to
   *  width 0 so the build canvas fills the frame edge-to-edge. Reverses the instant blocks land. */
  immersive: boolean;
  /** StudioShell publishes its locally-computed first-build-generating flag through this. */
  setImmersive: (v: boolean) => void;
}

// Default is an inert no-op so an EMBEDDED StudioShell (rendered with no StudioLayout provider
// above it) stays safe — the inner rail still retracts via its own `immersive` prop; the outer
// setter is simply a harmless no-op.
const StudioImmersionContext = createContext<StudioImmersionValue>({
  immersive: false,
  setImmersive: () => {},
});

export const StudioImmersionProvider = StudioImmersionContext.Provider;

export function useStudioImmersion(): StudioImmersionValue {
  return useContext(StudioImmersionContext);
}

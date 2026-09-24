import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { PaigePresence } from "./PaigePresence";
import { SILENT_ENERGY, type AudioEnergy, type PresenceState } from "@/lib/paigeLiveConversation/presence";
import "./paige-presence-3d.css";

/**
 * The 3D Paige, with the flat presence underneath it as a real fallback rather than a blank.
 *
 * §58 — the owner-approved flat presence is NOT removed. It is what renders when WebGL is absent,
 * when the model fails to load, and when the scene throws. A corner of the Live stage with nothing
 * in it would be a worse outcome than the design that was already approved.
 *
 * §32 — a failure here is LOUD. The cycle this contract exists to break is a boundary that renders
 * null on a throw, so a runtime crash and "it just didn't populate" look identical and cost hours.
 * Every degrade path logs its cause and then shows something.
 *
 * The 3.87 MB model is behind `lazy`, so it is fetched when someone opens Live and never for anyone
 * who does not.
 */

const PaigePresenceScene = lazy(() => import("./PaigePresenceScene"));

function supportsWebGL() {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown, info: unknown) {
    // Never silent. A blank corner with no console line is how a compiles-but-crashes bug hides.
    console.error("[PaigePresence3D] the 3D presence crashed — falling back to the flat presence. Cause:", error, info);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface PaigePresence3DProps {
  state: PresenceState;
  visible?: boolean;
  /** Read only from the actual output/microphone analyser. Never a generated speech timer. */
  readEnergy?: () => AudioEnergy;
}

export function PaigePresence3D({ state, visible = true, readEnergy = () => SILENT_ENERGY }: PaigePresence3DProps) {
  const [reduced, setReduced] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media?.matches ?? false);
    sync();
    media?.addEventListener("change", sync);
    setWebgl(supportsWebGL());
    return () => media?.removeEventListener("change", sync);
  }, []);

  const flat = <PaigePresence state={state} visible={visible} readEnergy={readEnergy} />;
  // Until the capability check has run, and whenever it says no, the approved design stands.
  if (webgl !== true) return flat;

  return (
    <div className="paige-presence-3d" data-presence-state={state} data-motion={reduced ? "reduced" : "ambient"} aria-hidden="true">
      <SceneBoundary fallback={flat}>
        {/* While the model streams, the flat presence holds the frame — so the corner is never empty
            and the transition is a deepening rather than a pop-in from nothing. */}
        <Suspense fallback={<div className="paige-presence-3d__await">{flat}</div>}>
          <PaigePresenceScene state={state} reduced={reduced} readEnergy={visible ? readEnergy : () => SILENT_ENERGY} />
        </Suspense>
      </SceneBoundary>
    </div>
  );
}

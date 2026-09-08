/** Presentation only. Baseline motion is not evidence of audio, connection, or work. */
export type PresenceState = "ready" | "listening" | "thinking" | "working" | "speaking" | "held" | "interrupted" | "unavailable" | "disconnected";
export type AudioEnergy = Readonly<{ amplitude: number; brightness: number }>;
export const SILENT_ENERGY: AudioEnergy = Object.freeze({ amplitude: 0, brightness: 0 });
const unit = (n: number) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

export function resolvePresenceState(input: {
  phase: PresenceState; outputPlaying?: boolean; microphoneActive?: boolean; working?: boolean;
}): PresenceState {
  if (["held", "interrupted", "disconnected"].includes(input.phase)) return input.phase;
  if (input.working) return "working";
  if (input.phase === "speaking" && !input.outputPlaying) return "ready";
  if (input.phase === "listening" && !input.microphoneActive) return "ready";
  return input.phase;
}

/** A closed sculptural spline, deliberately lobed and asymmetric at every sampled time. */
export function presenceFrame(state: PresenceState, seconds: number, sample: AudioEnergy = SILENT_ENERGY) {
  const energy = state === "speaking" || state === "listening" ? unit(sample.amplitude) : 0;
  const settled = ["held", "disconnected", "interrupted"].includes(state);
  // Unavailable audio is not a frozen identity. Calm ambient motion remains clearly visible;
  // only actual input/output samples below can create audio energy.
  const pace = settled ? .22 : state === "thinking" || state === "working" ? .9 : .72;
  const t = seconds * pace;
  const radii = [96, 112, 69, 110, 93, 61, 102, 119, 74, 104, 71, 109];
  const points = radii.map((radius, i) => {
    const angle = i * Math.PI / 6;
    const r = radius + Math.sin(t + i * 1.7) * (settled ? 2.5 : 10) + energy * Math.sin(i * 2.3 + t) * 16;
    return [160 + Math.cos(angle) * r * .94, 146 + Math.sin(angle) * r * 1.04];
  });
  const fixed = (n: number) => n.toFixed(2);
  let path = `M${points[0].map(fixed).join(",")}`;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i + 11) % 12], p1 = points[i], p2 = points[(i + 1) % 12], p3 = points[(i + 2) % 12];
    path += `C${fixed(p1[0] + (p2[0] - p0[0]) / 6)},${fixed(p1[1] + (p2[1] - p0[1]) / 6)} ${fixed(p2[0] - (p3[0] - p1[0]) / 6)},${fixed(p2[1] - (p3[1] - p1[1]) / 6)} ${p2.map(fixed).join(",")}`;
  }
  return { path: `${path}Z`, energy, light: .28 + energy * .65,
    drift: Math.sin(t * .63) * (settled ? 2 : 10), turn: -12 + Math.sin(t * .42) * (settled ? 5 : 8),
    detail: unit(sample.brightness) * energy };
}

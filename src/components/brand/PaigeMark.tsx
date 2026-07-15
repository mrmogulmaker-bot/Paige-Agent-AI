/**
 * PaigeMark — the shared Paige brand mark (gold orbital orb + ring + companion
 * spark + halo). One SVG used across the landing header/footer/intro and the
 * public sign-up flow so the mark is identical everywhere. Owned, design-crew SVG.
 *
 * `animated` (default false, fully backward-compatible) turns on the "Paige presence"
 * motion used by the Vibe Studio's generation stage: the ring keeps orbiting, the orb
 * breathes, the halo pulses, and the companion spark drifts — CSS/SVG animation only
 * (no three.js, no GLB). The keyframes live in index.css (`.paige-orbit-spin`,
 * `.paige-orb-breathe`, `.paige-halo-pulse`, `.paige-spark-drift`) and are ALL no-oped
 * under `prefers-reduced-motion` there, same discipline as the `.gp-*` set. Callers that
 * also gate on `useReducedMotion()` (as GenerationExperience does) get belt-and-suspenders
 * safety; the CSS alone is sufficient even if a caller forgets.
 */
export function PaigeMark({
  className = "",
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg viewBox="0 0 48 48" fill="none" role="img" aria-label="Paige" className={className}>
      <defs>
        <radialGradient id="pg-orb" cx="42%" cy="36%" r="72%">
          <stop offset="0%" stopColor="#FCE7B6" />
          <stop offset="42%" stopColor="#F0C86A" />
          <stop offset="100%" stopColor="#D4A752" />
        </radialGradient>
        <linearGradient id="pg-ring" x1="4" y1="40" x2="44" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D4A752" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#F0C86A" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#D4A752" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id="pg-spark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFF4D8" />
          <stop offset="60%" stopColor="#F0C86A" />
          <stop offset="100%" stopColor="#D4A752" />
        </radialGradient>
        <radialGradient id="pg-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F0C86A" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#F0C86A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        cx="24"
        cy="24"
        r="17"
        fill="url(#pg-halo)"
        className={animated ? "paige-halo-pulse" : undefined}
      />
      <g transform="rotate(-27 24 24)">
        <ellipse
          cx="24"
          cy="24"
          rx="18"
          ry="7.5"
          stroke="url(#pg-ring)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          className={animated ? "paige-orbit-spin" : undefined}
        />
        <circle
          cx="24"
          cy="24"
          r="8"
          fill="url(#pg-orb)"
          className={animated ? "paige-orb-breathe" : undefined}
        />
        <circle cx="21.4" cy="21" r="2.4" fill="#FFF6E2" opacity="0.85" />
        <circle
          cx="37.8"
          cy="29.1"
          r="3.4"
          fill="url(#pg-spark)"
          className={animated ? "paige-spark-drift" : undefined}
        />
      </g>
    </svg>
  );
}

export default PaigeMark;

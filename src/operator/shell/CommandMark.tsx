/**
 * The Command Mark — the operator console's mark. NOT the landing page's orbital mark.
 *
 * `PaigeMark` (the gold orb, ring and companion spark) is the MARKETING site's; its own file
 * says it is used across the landing header, footer, intro and the public sign-up flow. It was
 * mounted here by mistake and the owner caught it live. The console's mark is a slash and an
 * orb on a rimmed plate, and the geometry below is the pack's, exact:
 * `docs/design-references/cd-packs/super-admin-shell-v3/docs/handoff/design-system-port.md` §3.
 *
 * `stroke-width: 3.2` with `stroke-linejoin: round` is what gives the slash its weight. Without
 * the stroke the polygon renders thin and wrong — it is not an outline, it is the mark's mass.
 *
 * THE STATE IS DERIVED FROM REAL ACTIVITY, never decoration. Colour and pulse period both come
 * from `data-cm` (index.css): dormant 5.2s when idle, charged 1.7s when a command is staged,
 * executed 1.1s on completion. A mark pulsing at 1.1s while nothing runs is the motion rule
 * broken, so `state` has no default that implies activity — an unset `data-cm` falls back to
 * the dormant-weight colours and the slowest period.
 */

export type CommandMarkState = "dormant" | "charged" | "executed";

/** The plate variant: the rail lockup and anywhere the mark is the subject. */
export function CommandMark({
  state,
  size = 26,
  className = "",
}: {
  /** Omit while nothing is running — the CSS falls back to the resting treatment. */
  state?: CommandMarkState;
  size?: number;
  className?: string;
}) {
  return (
    <span
      data-cm={state}
      className={`relative grid flex-none place-items-center ${className}`}
      style={{
        width: size + 12,
        height: size + 12,
        borderRadius: "var(--pg-r-plate)",
        background: "var(--pg-graphite)",
        boxShadow: "var(--pg-rim)",
      }}
    >
      <i
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ borderRadius: "var(--pg-r-plate)", boxShadow: "var(--pg-e1)" }}
      />
      <MarkGeometry size={size} withStroke />
    </span>
  );
}

/**
 * The small inline variant — 11–15px glyphs beside "Ask" affordances. Same geometry, no plate,
 * and `currentColor` with no stroke, so it takes the weight of the text it sits in.
 */
export function CommandGlyph({ size = 13, className = "" }: { size?: number; className?: string }) {
  return <MarkGeometry size={size} className={className} />;
}

function MarkGeometry({
  size,
  withStroke = false,
  className = "",
}: {
  size: number;
  withStroke?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="img"
      aria-label="PAIGE"
      className={className}
      style={withStroke ? { position: "relative", filter: "drop-shadow(0 1px 0 rgba(0,0,0,.45))" } : undefined}
    >
      <polygon
        points="21,13.6 30.5,13.6 21,34.4 11.5,34.4"
        fill={withStroke ? "var(--cm-slash)" : "currentColor"}
        stroke={withStroke ? "var(--cm-slash)" : undefined}
        strokeWidth={withStroke ? 3.2 : undefined}
        strokeLinejoin={withStroke ? "round" : undefined}
      />
      <circle cx="34.5" cy="30.5" r="5.5" fill={withStroke ? "var(--cm-orb)" : "currentColor"} />
    </svg>
  );
}

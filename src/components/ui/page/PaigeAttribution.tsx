import { cn } from "@/lib/utils";
import { PaigeMark } from "@/components/brand/PaigeMark";

/**
 * PaigeAttribution — the foundational VP-surfacing byline (#243).
 *
 * A small, read-only credit that names which of Paige's VPs/agents actually
 * produced an AI-generated surface (a drafted email, a generated page, a Command
 * Center card, a chat answer). It is a DISPLAY primitive, never a picker.
 *
 * HONESTY (§13). It renders exactly the contributors it is passed — a LIST, never
 * a single hardcoded name. Even if a human @-mentions ONE VP, every real
 * contributor is credited; the component cannot invent a VP that didn't work
 * (unknown `vp` values are dropped, an empty list renders `null`, and names come
 * only from the frozen {@link VP_ROSTER}). It never collapses to a single canned name.
 *
 * NOT A PICKER (§18/§20/§21). There are no tabs, chips, modes, or agent-selector
 * here — it exposes no way for a human to pick or switch a VP or artifact type. It
 * only credits who already worked.
 *
 * GOLD DISCIPLINE (§11). A byline is NOT an act/approve/on moment, so gold is
 * deliberately absent: the lead-in and names are `--foreground`/`font-medium`,
 * the remit line is `--muted-foreground`, the divider a hairline `--border`. No
 * gold text, no gold fill, no StatePill state="on". Token-only (zero hex), AA in
 * both themes via those semantic tokens.
 *
 * NO MOTION. A resting byline is static. The optional {@link PaigeMark} glyph is
 * rendered with `animated={false}` (a byline is not a live/generation moment), so
 * no animation — and therefore no unguarded motion — ships here.
 *
 * TRI-SCOPE (#243). The SAME six VPs serve tenant / operator / portfolio surfaces;
 * `scope` only frames the surface context, it never swaps the roster. The lead-in
 * label stays "your Paige team" across scopes (§36 — instantly legible to a
 * non-technical user in ~5 seconds: "Drafted by your Paige team: Merit + Vera").
 *
 * §2/§9-clean: roster remits are coaching-generic — no finance/credit/vertical
 * wording, no operator-only content — like every other primitive in this layer.
 */

/** The canonical VP identifiers. PAIGE is the orchestrator; the six VPs are her team. */
export type VP = "PAIGE" | "VERA" | "NEXUS" | "CURA" | "MENTOR" | "MERIT" | "ZION";

/**
 * The single source of truth for VP display names + remits. Callers never
 * hardcode a name — they pass a `VP` id and the byline resolves it here, so the
 * component can never render a VP that isn't in the roster (§13). Remits are
 * coaching-generic and §2-clean, mapped to the §16 10-department model.
 */
export const VP_ROSTER: Record<VP, { name: string; remit: string }> = {
  PAIGE: { name: "Paige", remit: "Orchestrator" },
  VERA: { name: "Vera", remit: "Quality & standards" },
  NEXUS: { name: "Nexus", remit: "Marketing & growth" },
  CURA: { name: "Cura", remit: "Client success" },
  MENTOR: { name: "Mentor", remit: "Curriculum & delivery" },
  MERIT: { name: "Merit", remit: "Sales & revenue" },
  ZION: { name: "Zion", remit: "Operations & automation" },
};

export type AttributionScope = "tenant" | "operator" | "portfolio";

/** One credited contributor. `role` is an optional qualifier, e.g. "drafted", "reviewed". */
export interface PaigeContributor {
  vp: VP;
  role?: string;
}

export interface PaigeAttributionProps {
  /** REQUIRED — a LIST of the real contributors (§13). Never a single hardcoded name. */
  contributors: PaigeContributor[];
  /** Frames the surface context; the roster is identical across scopes. Default "tenant". */
  scope?: AttributionScope;
  /** "inline" = one-line byline (default). "block" = byline + a muted remit line for a card footer. */
  variant?: "inline" | "block";
  /** Default "sm". */
  size?: "sm" | "md";
  /** Render the shared PaigeMark glyph. Default true. */
  showMark?: boolean;
  className?: string;
}

// The lead-in label stays "your Paige team" across scopes — the SAME six VPs serve
// tenant / operator / portfolio surfaces (#243). Scope is retained on the API (and
// surfaced to assistive tech below) so callers frame the surface honestly without
// the roster ever swapping.
const SCOPE_LEADIN: Record<AttributionScope, string> = {
  tenant: "Drafted by your Paige team",
  operator: "Drafted by your Paige team",
  portfolio: "Drafted by your Paige team",
};

const MARK_SIZE = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
} as const;

const TEXT_SIZE = {
  sm: "text-xs",
  md: "text-sm",
} as const;

/** De-dupe by `vp` (first mention wins), drop any `vp` not in the roster (§13 — can't credit a non-existent VP). */
function resolveContributors(contributors: PaigeContributor[]): PaigeContributor[] {
  const seen = new Set<VP>();
  const out: PaigeContributor[] = [];
  for (const c of contributors) {
    if (!c || !(c.vp in VP_ROSTER) || seen.has(c.vp)) continue;
    seen.add(c.vp);
    out.push(c);
  }
  return out;
}

/** "X", "X + Y", "X + Y + Z" — Oxford-free, matches the §36 5-second read. */
function joinNames(parts: string[]): string {
  return parts.join(" + ");
}

export function PaigeAttribution({
  contributors,
  scope = "tenant",
  variant = "inline",
  size = "sm",
  showMark = true,
  className,
}: PaigeAttributionProps) {
  const resolved = resolveContributors(contributors);

  // §13 — no contributors means no credit; never fabricate one.
  if (resolved.length === 0) return null;

  const leadIn = SCOPE_LEADIN[scope];

  // A contributor's optional role renders as a tiny qualifier ("Vera reviewed") for
  // surfaces that distinguish draft vs. review; otherwise just the name.
  const nameLabel = (c: PaigeContributor): string => {
    const name = VP_ROSTER[c.vp].name;
    return c.role ? `${name} ${c.role}` : name;
  };

  const names = joinNames(resolved.map(nameLabel));
  // Remits use a middot list to read distinctly from the "+" name list (§36 clarity):
  // e.g. names "Merit + Vera" over remits "Sales & revenue · Quality & standards".
  const remits = resolved.map((c) => VP_ROSTER[c.vp].remit).join(" · ");

  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2 text-muted-foreground",
        TEXT_SIZE[size],
        className,
      )}
    >
      {showMark && (
        <PaigeMark
          animated={false}
          className={cn("mt-0.5 shrink-0", MARK_SIZE[size])}
        />
      )}
      <div className="min-w-0">
        <p className="leading-snug">
          <span className="sr-only">{scope} surface — </span>
          {leadIn}:{" "}
          <span className="font-medium text-foreground">{names}</span>
        </p>
        {variant === "block" && (
          <p className="mt-1 border-t border-border pt-1 leading-snug text-muted-foreground">
            {remits}
          </p>
        )}
      </div>
    </div>
  );
}

export default PaigeAttribution;

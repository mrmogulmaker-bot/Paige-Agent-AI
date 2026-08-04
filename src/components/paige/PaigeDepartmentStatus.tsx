/**
 * PaigeDepartmentStatus — the ambient "see them work" tiles for the Command Center
 * (Task #245). One live tile per §16 department, each showing the owning VP and what
 * that desk is doing RIGHT NOW (in motion · awaiting you · queued · standing by).
 *
 * §18 EXTEND, not a new home. This renders INSIDE the existing Command Center
 * surfaces (PracticeOverview tenant home, OperatorCommandCenter operator home) — no
 * new route, no new nav, no tab/type-picker. It is proactive surfacing (§36): a
 * non-technical owner reads "here's what my Paige team is doing" at a glance.
 *
 * §243/§12 SINGLE SOURCE. VP names come ONLY from VP_ROSTER (via <PaigeAttribution>);
 * department names come ONLY from the DB (usePaigeDeptStatus). The VP↔department edge
 * is the single shared map in @/lib/paige/vpDepartments — never re-declared here.
 *
 * §11 GOLD-FREE. A status read is NOT an act/approve/on moment (same stance as #244),
 * so no gold is spent: plates rest on the indigo hairline, the "in motion" pill is
 * indigo (StatePill building), the "awaiting you" pill is semantic warning. Gold on
 * the Command Center stays reserved for the Approve act in DraftsAwaitingPanel.
 *
 * §22 MOTION, earned + guarded. This IS the "see them work" surface, so a single
 * lightweight ambient signal is earned: an indigo pulse on desks that are actively
 * in-flight. It writes its OWN reduced-motion fallback (useReducedMotion → a static
 * filled dot). No WebGL, no heavy motion on this working surface (§11 banner rule).
 */
import type { LucideIcon } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import {
  Users2,
  Compass,
  Megaphone,
  Target,
  DollarSign,
  HeartHandshake,
  GraduationCap,
  Cog,
  ClipboardList,
  UsersRound,
  ShieldCheck,
  Inbox,
} from "lucide-react";
import {
  SectionCard,
  GlyphPlate,
  StatePill,
  EmptyState,
  PaigeAttribution,
  type AttributionScope,
} from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePaigeDeptStatus, type DeptStatusRow } from "@/hooks/usePaigeDeptStatus";
import { resolveVpForDept, type DeptSlug } from "@/lib/paige/vpDepartments";

/** Per-department display glyph (indigo plate, never gold — §11). Keyed by DeptSlug
 *  so a new department is a compile error until it picks an icon (§12). Falls back to
 *  a neutral glyph for any slug the DB has that this map hasn't caught up to (§32). */
const DEPT_ICON: Record<DeptSlug, LucideIcon> = {
  executive_office: Compass,
  marketing: Megaphone,
  sales: Target,
  finance: DollarSign,
  client_experience: HeartHandshake,
  product_curriculum: GraduationCap,
  technology_automation: Cog,
  operations_pmo: ClipboardList,
  people_talent: UsersRound,
  legal_compliance: ShieldCheck,
  owner_ops: Inbox,
};

function deptIcon(slug: string): LucideIcon {
  return (DEPT_ICON as Record<string, LucideIcon>)[slug] ?? Users2;
}

/** The live status WORD for a desk, by precedence: awaiting > in motion > queued > idle.
 *  State only — the magnitude lives in the one top-right total (see DeskTile), so the
 *  pill never repeats or contradicts that number (design-crew #245: no double count). */
function DeskPill({ d, reduced }: { d: DeptStatusRow; reduced: boolean }) {
  if (d.awaitingCount > 0) {
    return <StatePill state="warning">Awaiting you</StatePill>;
  }
  if (d.workingCount > 0) {
    return (
      <StatePill state="building" icon={<PulseDot reduced={reduced} />}>
        In motion
      </StatePill>
    );
  }
  if (d.openCount > 0) {
    return <StatePill state="off">Queued</StatePill>;
  }
  return <StatePill state="off">Standing by</StatePill>;
}

/** The ambient "in-flight" signal (§22). Reduced motion → a plain static dot; the
 *  ping ring is the ONLY motion on the surface and it is opt-out by construction. */
function PulseDot({ reduced }: { reduced: boolean }) {
  return (
    <span className="relative inline-flex h-1.5 w-1.5" aria-hidden>
      {!reduced && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--primary)/0.7)]" />
      )}
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />
    </span>
  );
}

function DeskTile({ d, scope, reduced }: { d: DeptStatusRow; scope: AttributionScope; reduced: boolean }) {
  const vp = resolveVpForDept(d.slug);
  const active = d.openCount > 0;
  return (
    <div
      className={cn(
        // Raised a tier above the host SectionCard (bg-card): bg-muted/40 gives a
        // distinct elevation in BOTH themes (lighter than card in dark, a subtle
        // inset in light) so each desk bulges instead of reading card-on-card
        // (design-crew #245, §22/§27). No hover-lift — the tile is not clickable,
        // so a hover:shadow-lg would be a false affordance (§11/§25).
        "flex flex-col gap-3 rounded-[var(--radius)] border bg-muted/40 p-4 shadow-card",
        active ? "border-border" : "border-border/60",
      )}
    >
      <div className="flex items-start gap-3">
        <GlyphPlate icon={deptIcon(d.slug)} size="sm" ring="indigo" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display text-sm font-semibold leading-tight text-foreground">
              {d.name}
            </h3>
            {active && (
              <span className="shrink-0 font-display text-lg font-semibold tabular-nums text-foreground">
                {d.openCount}
              </span>
            )}
          </div>
          <PaigeAttribution
            className="mt-1"
            contributors={[{ vp }]}
            scope={scope}
            size="sm"
            showMark={false}
            leadIn="Run by"
          />
        </div>
      </div>
      <div className="mt-auto">
        <DeskPill d={d} reduced={reduced} />
      </div>
    </div>
  );
}

export function PaigeDepartmentStatus({ scope = "tenant" }: { scope?: AttributionScope }) {
  const { loading, configured, departments } = usePaigeDeptStatus();
  const reduced = useReducedMotion() ?? false;

  const activeCount = departments.filter((d) => d.openCount > 0).length;
  const title = "What your Paige team is doing";
  // DB-driven count — never hardcode a numeral in the copy (the desks come from
  // paige_departments, which today enables 11 including the active owner_ops desk).
  // §13 honesty on the surface whose whole job is at-a-glance legibility (§36).
  const description =
    scope === "operator"
      ? "Your departments across the fleet, and who's running each — live."
      : "Your departments and who's running each — live.";

  return (
    <SectionCard
      title={title}
      description={description}
      icon={Users2}
      actions={
        !loading && configured && activeCount > 0 ? (
          <StatePill state="building">{activeCount} active</StatePill>
        ) : !loading && configured ? (
          <StatePill state="success">All standing by</StatePill>
        ) : undefined
      }
    >
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[7.5rem] rounded-[var(--radius)]" />
          ))}
        </div>
      ) : !configured ? (
        <EmptyState
          icon={Users2}
          title="Your team is standing by"
          description="Work shows up here the moment Paige files it to one of your departments — onboarding a client, drafting a follow-up, or teeing up a decision for you."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {departments.map((d) => (
            <DeskTile key={d.slug} d={d} scope={scope} reduced={reduced} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export default PaigeDepartmentStatus;

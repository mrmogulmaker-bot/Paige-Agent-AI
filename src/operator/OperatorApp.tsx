import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useParams, Navigate } from "react-router-dom";
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  OPERATOR_BRANCHES, leafPath, subtabPath, branchPath,
  type Branch, type SubTab,
} from "@/lib/routing/tierBranches";
import { EmptyState, PageSkeleton } from "@/components/ui/page";
import FleetConsole from "@/operator/surfaces/FleetConsole";
import TrustCompass from "@/operator/surfaces/TrustCompass";
import KnowledgeSurface from "@/operator/surfaces/KnowledgeSurface";
import { useCompass } from "@/operator/data/useCompass";
import { useKnowledge } from "@/operator/data/useKnowledge";
import OperatorPanel from "@/operator/surfaces/OperatorPanel";
import { bespokeSlots } from "@/operator/surfaces/bespokeSlots";
import { getPanelSpec } from "@/operator/surfaces/panelSpecs";
import { tabGlyph } from "@/operator/surfaces/tabGlyphs";
import WorkspaceSurface from "@/operator/surfaces/WorkspaceSurface";
import { PaigePlatformDesk } from "@/components/paige/PaigePlatformDesk";
import { PipelineHead, PipelineBoard, StageBoard } from "@/operator/surfaces/PipelineSurfaces";
import { SocialGrid, SocialQueue } from "@/operator/surfaces/SocialSurfaces";
import BufferDiagram from "@/operator/surfaces/BufferDiagram";
import { AreaChart, Bench } from "@/operator/surfaces/AnalyticsSurfaces";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useIsPlatformOwner } from "@/operator/data/useIsPlatformOwner";
import { useOperatorChrome } from "@/operator/data/useOperatorChrome";
import { performSignOut } from "@/lib/auth/signOut";
import { cn } from "@/lib/utils";

/**
 * OperatorApp — the Platform Operator (God-tier) console shell.
 *
 * URL-DRIVEN, not state-driven: every surface is `/operator/{branch}/{subtab}` (and
 * `/operator/settings/{group}/{tab}` for the one branch that nests a third level), resolved
 * from OPERATOR_BRANCHES — the registry generated from Claude Design's own route file. There
 * is no local tab state to drift out of sync with the address bar, which is what makes all 78
 * surfaces deep-linkable and Paige-addressable (§10/§65).
 *
 * §13 — WHAT THIS IS AND IS NOT. This mounts the CHROME and the navigation. The 78 surfaces
 * are not built: each renders an honest placeholder naming what will live there. A navigable
 * frame you can click through and react to beats five finished screens with no way to reach
 * them — and nothing here fabricates data: a placeholder says "not built yet", never a
 * plausible-looking empty dashboard that reads as "you have no tenants".
 *
 * §58 — ADDITIVE, NOT A REPLACEMENT. The design is a LEFT-RAIL shell; the live God console
 * (AdminLayout) is a TOP-BAR shell. This does not restyle AdminLayout — it stands up a
 * parallel address at `/operator/*` while `/admin/platform/*` stays exactly as it is and
 * remains the operator's working surface. Nothing is retired, hidden, or gated off here.
 *
 * CLAUDE DESIGN IS THE SOURCE OF TRUTH HERE (owner ruling, 2026-08-18): *"If Claude Design
 * made it, that's how it's supposed to be moving forward. Whatever we had before CD is no
 * longer valid."* An earlier pass on this file substituted our pre-CD conventions for three of
 * CD's calls — indigo instead of CD's gold on the active sub-tab and the settings-active rail
 * row, and our cool-indigo palette instead of CD's warm neutrals. The ruling reverses all
 * three: CD's palette and CD's gold ship as designed, via the scoped `.operator-console`
 * token block in index.css (the same pattern `.studio-surface` already uses, so CD's design
 * lands exactly here without repainting any other — including §28-frozen — surface).
 *
 * Two things were NOT copied verbatim, both recorded rather than quietly changed: CD's rail
 * eyebrow measures 4.11:1 and its dark block paints the page the same colour as the rail so
 * the rail vanishes. Those are legibility/visibility defects in the pack, not design intent
 * (§29 — shipped, correct, invisible); each keeps CD's hue and moves only enough to be seen.
 * CD's gold underline measures 2.35:1 — raised once, ruled on, shipping as designed.
 */

/**
 * §53 SECTION-LEVEL OWNER GATE. The subtree guard is OPERATOR (super_admin OR platform_admin);
 * these two branches are God-only on top of it, carried forward from what already ships rather
 * than invented:
 *   • revenue — its shipped twin is MoneySpineAdmin, wrapped in <PlatformOwnerOnly>.
 *   • comms   — its shipped twin is PlatformFleetCommunications, likewise owner-wrapped.
 * Gating the ROUTE as well as the nav is the point: §53's lesson is that a hidden tab whose
 * route stays open is not a gate, because a scoped staffer can deep-link past the hidden nav.
 *
 * SEVEN more branches are MIXED — operator-level section, one or two owner-only tabs/actions
 * inside (fleet's revenue tiles + integrity audit, paige's doctrine corpus, growth's content
 * defaults, analytics' revenue + forecast lenses, provisioning's provision action, settings'
 * governance group). Those inner gates land WITH their surfaces: gating a placeholder that
 * renders no data would be theatre, and would bake a guess into the wrong layer. Tracked.
 */
const OWNER_ONLY_SECTIONS: ReadonlySet<string> = new Set(["revenue", "comms"]);

/** Rail groups in the design's own order. `settings` is a drill-in menu, not a rail item. */
const RAIL_GROUPS: ReadonlyArray<{ key: Branch["group"]; label: string }> = [
  { key: "fleet", label: "The fleet" },
  { key: "business", label: "The business" },
];

function useResolved(section: string | undefined, splat: string) {
  return useMemo(() => {
    const branch = OPERATOR_BRANCHES.find((b) => b.slug === section) ?? null;
    if (!branch) return { branch: null, sub: null, leaf: null, stale: false };
    const [subSlug, leafSlug] = splat.split("/").filter(Boolean);
    const subs = branch.subtabs ?? [];
    const sub = (subSlug ? subs.find((s) => s.slug === subSlug) : subs[0]) ?? subs[0] ?? null;
    const leaves = sub?.subtabs ?? [];
    const leaf = leaves.length
      ? (leafSlug ? leaves.find((l) => l.slug === leafSlug) : leaves[0]) ?? leaves[0] ?? null
      : null;
    // A slug that was SUPPLIED but matched nothing falls back to the default tab — which
    // would render one surface while the address bar names another. That quietly breaks the
    // "deep-linkable and Paige-addressable" contract (§65/§10): a shared or agent-generated
    // link would show content that disagrees with its own URL. Flag it so the caller can
    // redirect to the canonical address instead of lying about where you are.
    const stale =
      (!!subSlug && sub?.slug !== subSlug) || (!!leafSlug && leaves.length > 0 && leaf?.slug !== leafSlug);
    return { branch, sub, leaf, stale };
  }, [section, splat]);
}

/**
 * The pack drives rail density from a ResizeObserver: it measures the nav's real height,
 * divides by row count, and tightens padding / font / gap when the per-row budget drops below
 * ~28px (its `tight` flag). That is content-aware density Tailwind cannot express, so we
 * reproduce the BEHAVIOR — measure, decide, and publish the result as CSS custom properties
 * the rail's arbitrary values read. Chosen over a fixed two-tier media query because the fleet
 * group alone is nine rows: on a 13" laptop the fixed version visibly degrades, which is
 * exactly the "correct but nobody can use it" outcome §29 warns about.
 */
function useRailDensity(rowCount: number) {
  const navRef = useRef<HTMLDivElement | null>(null);
  const [tight, setTight] = useState(false);

  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const perRow = rowCount > 0 ? el.clientHeight / rowCount : 999;
      // Hysteresis: switch in at <28px, back out only above 32px, so a row that lands
      // exactly on the boundary cannot oscillate every frame while resizing.
      setTight((was) => (was ? perRow < 32 : perRow < 28));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowCount]);

  return { navRef, tight };
}

/** One rail row. A real <Link> with aria-current — the pack's rows are div+onClick (§36/C5). */
function RailRow({
  to, label, glyph, badge, active, collapsed, tone = "default",
}: {
  to: string; label: string; active: boolean; collapsed: boolean;
  /**
   * CD's count pill. Present ONLY when the platform can substantiate the number — an absent
   * badge means "not measured", which is a different statement from a badge reading zero, and
   * on an operator console the difference matters (§13).
   */
  badge?: { count: number; tone: "warn" | "risk" | "info" };
  /**
   * CD's per-branch mark. It is what makes the rail read as a console rather than a list of
   * words, and it is the ONLY thing left when the rail collapses to 64px — so a branch without
   * one falls back to the first letter of its label rather than to nothing.
   */
  glyph?: string;
  /** CD tints the SETTINGS menu's active row gold and the front menu's white. Both ship. */
  tone?: "default" | "gold";
}) {
  return (
    <NavLink
      to={to}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "relative mx-2 flex items-center rounded-[9px] transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "focus-visible:ring-offset-rail",
        collapsed ? "justify-center px-1 py-1.5" : "gap-2.5 px-[11px] py-[var(--rail-row-pad)]",
        // CD's own two treatments, both kept: white-alpha on the front menu, gold on the
        // settings menu. An earlier pass unified them on white as a §11 call; the owner
        // ruling puts CD's design back.
        active && tone === "gold"
          ? "bg-cd-gold/[0.14] font-medium text-cd-gold-ink"
          : active
            ? "bg-rail-foreground/10 font-medium text-rail-foreground"
            : "text-rail-foreground/70 hover:bg-rail-foreground/[0.06] hover:text-rail-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex-none text-center leading-none",
          active ? "opacity-100" : "opacity-70",
        )}
        style={{ width: "14px", fontSize: "calc(var(--rail-font) + 1px)" }}
      >
        {glyph ?? label.charAt(0)}
      </span>
      <span
        className={cn("min-w-0 flex-1 truncate leading-[1.35]", collapsed && "sr-only")}
        style={{ fontSize: "var(--rail-font)" }}
      >
        {label}
      </span>
      {badge && (
        <span
          className={cn(
            "flex-none rounded-full px-[7px] py-[1px] text-[10px] font-bold leading-[1.35]",
            collapsed && "absolute right-1 top-1 px-[5px] text-[9px]",
            badge.tone === "risk"
              ? "bg-[hsl(var(--destructive)/0.18)] text-[hsl(var(--destructive))]"
              : badge.tone === "warn"
                ? "bg-[hsl(var(--warning)/0.2)] text-[hsl(var(--gold-dark))]"
                : "bg-rail-foreground/12 text-rail-foreground/80",
          )}
        >
          {badge.count}
        </span>
      )}
      {collapsed && <span aria-hidden className="text-[11px] font-semibold">{label.slice(0, 1)}</span>}
    </NavLink>
  );
}

export default function OperatorApp() {
  const params = useParams();
  const section = params.section;
  const splat = params["*"] ?? "";
  const { branch, sub, leaf, stale } = useResolved(section, splat);
  const { isPlatformOwner: contextOwner } = useTenantContext();
  /**
   * Ownership is ASKED, not read off the context cache. `contextOwner` stays a fast path so a
   * warm navigation never waits, but it can only ever say YES — a `false` there is
   * indistinguishable from "not resolved yet" after a sign-in, and acting on it destroys the
   * operator's deep link. Only the server's answer is allowed to say no.
   */
  const ownerVerdict = useIsPlatformOwner();
  /**
   * The SERVER's answer wins whenever it has one. `contextOwner` is only a fast path for the
   * window before the RPC replies — it is a cache, and a cache must never overrule a live
   * denial. `useIsPlatformOwner` returns `null` (not `false`) when the check could not be made,
   * so a `false` here is a real "no" from `is_platform_owner()` and is honoured as one; an
   * unanswered check falls back to the cache exactly as before.
   */
  const isPlatformOwner = ownerVerdict === null ? contextOwner : ownerVerdict;
  const ownerAnswered = ownerVerdict !== null || contextOwner;
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ fleet: true, business: true });

  /**
   * The live signal behind the chrome — the operator's name, the rail badges, the fleet totals.
   * Every field is read from a real row or comes back absent; nothing here is a placeholder,
   * because a phantom count on the operator's own console is the §57 failure in miniature.
   */
  const chrome = useOperatorChrome();

  /**
   * CD's header carries a theme toggle, and §23 is explicit that the flip must be unmistakable
   * on every surface. We drive the app's own `dark` class so the console never invents a
   * second theme mechanism (§18).
   */
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  const toggleTheme = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
  }, []);

  /** Initials for CD's avatar. Absent rather than a guessed glyph when the name is unknown. */
  const initials = useMemo(() => {
    const name = chrome.firstName;
    return name ? name.charAt(0).toUpperCase() : null;
  }, [chrome.firstName]);

  /**
   * CD's greeting: salutation, then what is actually waiting. Clauses are appended ONLY where a
   * real count exists, so an operator never reads a tally the platform cannot substantiate — and
   * with nothing waiting it says that, rather than printing a row of zeroes.
   */
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const partOfDay = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
    const salutation = chrome.firstName ? `${partOfDay}, ${chrome.firstName}.` : `${partOfDay}.`;
    if (chrome.loading) return salutation;
    // Built from what the hook could actually substantiate. A signal it could not read is
    // simply not mentioned — never a zero standing in for an unknown (§13).
    const clauses: string[] = [];
    if (chrome.statusSummary) clauses.push(chrome.statusSummary);
    const support = chrome.badges.support?.count;
    if (typeof support === "number" && support > 0) {
      clauses.push(`${support} open support ${support === 1 ? "ticket" : "tickets"}`);
    }
    // CD's line ends with a provisioning tally. We do NOT carry one: the provisioning queue's
    // writers were all removed, so `useOperatorChrome` documents that badge as permanently
    // absent — and reading a key the hook can never emit is a clause that would silently never
    // appear, which is worse than not writing it. When a real queue lands, it joins here.
    // With nothing substantiated the line STOPS at the salutation. "Nothing is waiting on you"
    // is a positive claim about the platform's state, and this hook cannot tell a genuine zero
    // from a read that failed — `statusSummary` is null for both, and an unreadable support
    // badge is simply absent. Printing the reassurance in the failure case would tell the
    // operator everything is clear at the exact moment we have no idea (§13).
    return clauses.length ? `${salutation} ${clauses.join(", ")}.` : salutation;
  }, [chrome.firstName, chrome.loading, chrome.statusSummary, chrome.badges]);

  /**
   * CD's rail foot. Built from what the platform can actually count — the seat word and the two
   * fleet totals — and each clause is dropped when its source is unreadable rather than printed
   * as a zero. With nothing readable it is null and the strip is not rendered.
   */
  const railFoot = useMemo(() => {
    const parts: string[] = [];
    if (chrome.roleLabel) parts.push(chrome.roleLabel);
    if (typeof chrome.tenantCount === "number") {
      const tenants = `${chrome.tenantCount} ${chrome.tenantCount === 1 ? "tenant" : "tenants"}`;
      parts.push(
        typeof chrome.subAccountCount === "number"
          ? `${tenants}, ${chrome.subAccountCount} sub-${chrome.subAccountCount === 1 ? "account" : "accounts"} beneath them`
          : tenants,
      );
    }
    return parts.length ? `${parts.join(" · ")}.` : null;
  }, [chrome.roleLabel, chrome.tenantCount, chrome.subAccountCount]);

  const toggleGroup = useCallback(
    (key: string) => setOpenGroups((g) => ({ ...g, [key]: !g[key] })),
    [],
  );

  /**
   * Owner-only sections are hidden only once the server has answered. Until then
   * `isPlatformOwner` is a not-yet, not a no, and treating it as a no would flash a rail with
   * Revenue and Comms missing for the owner (and, below, throw away their deep link entirely).
   */
  const railBranches = useMemo(
    () =>
      OPERATOR_BRANCHES.filter(
        (b) =>
          b.group !== "settings" &&
          (isPlatformOwner || !ownerAnswered || !OWNER_ONLY_SECTIONS.has(b.slug)),
      ),
    [isPlatformOwner, ownerAnswered],
  );
  const visibleRowCount = RAIL_GROUPS.reduce(
    (n, g) => n + (openGroups[g.key as string] ? railBranches.filter((b) => b.group === g.key).length : 0),
    0,
  );
  const { navRef, tight } = useRailDensity(visibleRowCount);

  // Unknown section → the default branch, rather than a dead end.
  if (!branch) return <Navigate to={branchPath("operator", "", OPERATOR_BRANCHES[0].slug)} replace />;

  // §53 — a scoped platform_admin deep-linking an owner-only section goes to the default
  // branch, not to a dead-end card: they ARE a legitimate operator, just not for this surface.
  //
  // NEVER on a not-yet answer. This redirect is `replace`, so firing it early does not merely
  // show the wrong surface — it DESTROYS the URL the operator asked for. An owner who signs in
  // with `?next=/operator/revenue/plans`, or hard-loads that bookmark, would be silently moved
  // to Fleet with no way back to where they were going. So we wait for a real answer first.
  if (OWNER_ONLY_SECTIONS.has(branch.slug) && !isPlatformOwner) {
    if (!ownerAnswered) return <PageSkeleton />;
    return <Navigate to={branchPath("operator", "", OPERATOR_BRANCHES[0].slug)} replace />;
  }

  const isSettings = branch.group === "settings";
  const settingsBranch = OPERATOR_BRANCHES.find((b) => b.group === "settings");

  // The canonical address of what is on screen — the design shows this beside the breadcrumb
  // so an operator can read, share, and hand Paige exactly where they are (§10).
  const canonical = leaf
    ? leafPath("operator", "", branch.slug, sub!.slug, leaf.slug)
    : sub
      ? subtabPath("operator", "", branch.slug, sub.slug)
      : branchPath("operator", "", branch.slug);

  // A URL naming a tab that does not exist gets rewritten to the address of what is actually
  // on screen, rather than rendering a surface the address bar contradicts.
  if (stale) return <Navigate to={canonical} replace />;

  // Level 2 for a normal branch is its subtabs; inside settings the rail holds the groups, so
  // the strip shows the selected group's leaves instead.
  const strip: SubTab[] = (isSettings ? sub?.subtabs : branch.subtabs) ?? [];

  return (
    <div
      // `operator-console` scopes CD's palette to this subtree (index.css). Every colour below
      // reads a token, so the class is the ONLY place the CD-vs-platform choice is made.
      className={cn(
        "operator-console grid h-dvh overflow-hidden bg-background text-foreground",
        collapsed ? "grid-cols-[64px_1fr]" : "grid-cols-[232px_1fr]",
      )}
      style={
        {
          // Published by the density hook; read by the rail's arbitrary values so the
          // measurement result reaches Tailwind without a class-name explosion.
          "--rail-row-pad": tight ? "5px" : "7px",
          "--rail-font": tight ? "12.5px" : "13.5px",
          "--rail-gap": tight ? "1px" : "3px",
        } as React.CSSProperties
      }
    >
      {/* ── RAIL ─────────────────────────────────────────────────────────────
          Its own token pair rather than --primary: on dark, --primary lifts to a vivid
          indigo and would turn this quiet panel into a violet slab (see index.css --rail). */}
      <aside className="relative flex min-h-0 flex-col overflow-hidden border-r border-border-strong bg-rail text-rail-foreground">
        {/* Brand */}
        <div className="flex flex-none items-center gap-2.5 border-b border-rail-foreground/10 px-4 pb-3 pt-4">
          <PaigeMark className="h-[30px] w-[30px] shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              {/* CD's lockup: the name at weight, then AGENT set small and wide in gold. The
                  tracking is what makes it read as a mark rather than two words. */}
              <div className="flex items-baseline gap-[5px] whitespace-nowrap leading-[1.2]">
                <span className="text-[15px] font-bold tracking-[-0.01em] text-rail-foreground">
                  Paige
                </span>
                <span className="text-[10.5px] font-semibold tracking-[0.16em] text-cd-gold">
                  AGENT
                </span>
              </div>
              <div className="mt-[3px] truncate text-[10.5px] leading-tight text-rail-muted">
                {isPlatformOwner ? "Platform operator · God tier" : "Platform operator · scoped"}
              </div>
            </div>
          )}
        </div>

        {/* CD's context chip. It states, unambiguously and at all times, WHOSE data is on
            screen — the thing an operator who can enter any tenant must never have to guess.
            It is presentational until act-as is wired here: rendered without a menu rather
            than with a menu that does nothing (§13). */}
        {!collapsed && (
          <div className="flex-none border-b border-rail-foreground/10 px-3 pb-[9px] pt-[11px]">
            <div className="flex min-w-0 items-center gap-[9px] rounded-[10px] border border-rail-foreground/15 bg-rail-foreground/[0.05] px-2.5 py-2">
              <span
                aria-hidden
                className="h-2 w-2 flex-none rounded-[2px] bg-cd-gold motion-safe:animate-pulse"
              />
              <span className="flex-none text-[8.5px] font-semibold tracking-[0.14em] text-rail-muted">
                CONTEXT
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-rail-foreground">
                Super Admin · platform
              </span>
            </div>
          </div>
        )}

        {/* Nav — CD's front menu, OR its settings back-menu when you have drilled in.
            The back-menu is not decoration: without it the five settings GROUPS have no link
            anywhere, which stranded 12 of the 78 leaves at typed-URL-only. The §39 peer-gate
            caught that the code comment claimed this menu existed while nothing rendered it. */}
        <div
          ref={navRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-1.5"
          style={{ scrollbarWidth: "thin" }}
        >
          {isSettings ? (
            <nav aria-label="Settings groups">
              <NavLink
                to={branchPath("operator", "", OPERATOR_BRANCHES[0].slug)}
                className="flex w-full items-center gap-2.5 border-b border-rail-foreground/10 px-3.5 py-2.5 text-[11.5px] font-semibold transition-colors hover:bg-rail-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span aria-hidden className="text-[12px]">‹</span>
                {!collapsed && <span>Back to the menu</span>}
              </NavLink>
              {!collapsed && (
                <div className="px-3.5 pb-1.5 pt-3">
                  <span className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
                    Settings
                  </span>
                </div>
              )}
              <div className="flex flex-col pb-1" style={{ gap: "var(--rail-gap)" }}>
                {(branch.subtabs ?? []).map((g) => (
                  <RailRow
                    key={g.slug}
                    to={subtabPath("operator", "", branch.slug, g.slug)}
                    label={g.label}
                    glyph={g.glyph}
                    active={g.slug === sub?.slug}
                    collapsed={collapsed}
                    tone="gold"
                  />
                ))}
              </div>
            </nav>
          ) : (
          <nav aria-label="Operator sections">
            {RAIL_GROUPS.map(({ key, label }) => {
              const items = railBranches.filter((b) => b.group === key);
              if (!items.length) return null;
              const open = openGroups[key as string] !== false;
              return (
                <div key={key} className="border-t border-rail-foreground/10 first:border-t-0">
                  {!collapsed && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(key as string)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 px-3.5 pb-1.5 pt-3 text-left transition-colors hover:bg-rail-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      {/* CD's eyebrow hue, lifted to clear AA at 8.5px uppercase (its own
                          #7C73A0 measures 4.11:1 on the rail) — see --rail-muted. */}
                      <span className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-rail-muted">
                        {label}
                      </span>
                      {/* CD sets the section's size in mono beside its name — how many surfaces
                          live under this heading. A count of the rail itself, so it is always
                          real. */}
                      <span className="font-mono text-[8.5px] text-rail-muted">{items.length}</span>
                      <span className="font-mono text-[9.5px] text-rail-foreground/45">{items.length}</span>
                      <span className="ml-auto" aria-hidden>
                        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </span>
                    </button>
                  )}
                  {open && (
                    <div className="flex flex-col pb-1" style={{ gap: "var(--rail-gap)" }}>
                      {items.map((b) => (
                        <RailRow
                          key={b.slug}
                          to={branchPath("operator", "", b.slug)}
                          label={b.label}
                          glyph={b.glyph}
                          badge={chrome.badges[b.slug]}
                          active={b.slug === branch.slug}
                          collapsed={collapsed}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          )}
        </div>

        {/* Settings entry */}
        {settingsBranch && (
          <NavLink
            to={branchPath("operator", "", settingsBranch.slug)}
            aria-current={isSettings ? "page" : undefined}
            className={cn(
              "mx-2 mb-1.5 flex items-center rounded-[9px] border-t border-rail-foreground/10 px-[11px] py-1.5 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              collapsed && "justify-center px-1",
              isSettings
                ? "bg-cd-gold/[0.14] font-medium text-cd-gold-ink"
                : "text-rail-foreground/70 hover:bg-rail-foreground/[0.06] hover:text-rail-foreground",
            )}
          >
            <span className={cn("text-[13px]", collapsed && "sr-only")}>{settingsBranch.label}</span>
            {collapsed && <span aria-hidden className="text-[11px] font-semibold">S</span>}
            {!collapsed && <span aria-hidden className="ml-auto text-[10px] opacity-60">›</span>}
          </NavLink>
        )}

        {/* Collapse */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand the rail" : "Collapse the rail"}
          className="mx-2 mb-2 flex items-center justify-center rounded-[9px] py-1.5 text-rail-foreground/70 transition-colors hover:bg-rail-foreground/[0.06] hover:text-rail-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>

        {/* CD's rail foot — the operator's seat and the size of what sits under it. Every clause
            is a real count or is omitted; with nothing readable the strip does not render at all,
            because a footer asserting "0 tenants" would be a claim, not a blank. */}
        {!collapsed && railFoot && (
          <div className="flex-none border-t border-rail-foreground/10 px-3.5 pb-2 pt-[7px]">
            <div title={railFoot} className="max-h-[27px] overflow-hidden text-[10px] leading-[1.35] text-rail-muted">
              {railFoot}
            </div>
          </div>
        )}
      </aside>

      {/* ── CONTENT COLUMN ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        {/* CD's incident strip. It sits ABOVE the header because an open incident outranks
            whatever surface you navigated to. It renders only when a real open incident row
            exists — never as a dormant frame, which would train the operator to ignore it. */}
        {chrome.incident && (
          <div
            role="status"
            className="flex flex-none items-center gap-3 border-b border-[hsl(var(--destructive)/0.3)] border-l-[3px] border-l-[hsl(var(--destructive))] bg-[hsl(var(--destructive)/0.07)] px-5 py-2.5"
          >
            <span
              aria-hidden
              className="h-2 w-2 flex-none rounded-full bg-[hsl(var(--destructive))] motion-safe:animate-pulse"
            />
            <span className="flex-none text-[9px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--destructive))]">
              Active incident
            </span>
            <span className="flex-none font-mono text-[10px] text-muted-foreground">
              {chrome.incident.ref}
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
              {chrome.incident.summary}
            </span>
            {chrome.incident.href && (
              <NavLink
                to={chrome.incident.href}
                className="flex-none whitespace-nowrap text-[11.5px] font-semibold text-[hsl(var(--destructive))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Open →
              </NavLink>
            )}
          </div>
        )}
        <header className="flex flex-none items-center gap-3 border-b-[1.5px] border-border-strong bg-background px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="truncate text-[11px] text-muted-foreground">
                {branch.label}
                {sub && ` · ${sub.label}`}
                {leaf && ` · ${leaf.label}`}
              </span>
              <code
                title="Canonical route — deep-links to this exact surface"
                className="hidden shrink-0 font-mono text-[9.5px] text-muted-foreground md:inline"
              >
                {canonical}
              </code>
            </div>
            {/* CD's greeting line. It opens with the operator by name and then says what is
                actually waiting — the console leading with the state of the platform rather
                than with a label for itself (§36/§52). Every clause is real or absent: with no
                name it drops the salutation, and with nothing waiting it says so plainly rather
                than inventing a tally. */}
            <div className="mt-0.5 truncate text-[12.5px] text-foreground">{greeting}</div>
          </div>
          <div className="ml-auto flex flex-none items-center gap-2">
            {chrome.statusSummary && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11.5px] font-semibold text-foreground">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--destructive))]" />
                {chrome.statusSummary}
              </span>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={isDark ? "Switch to the light theme" : "Switch to the dark theme"}
              title={isDark ? "Light" : "Dark"}
              className="grid h-8 w-8 flex-none place-items-center rounded-[9px] border border-border bg-card text-[14px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden>{isDark ? "☀" : "☾"}</span>
            </button>
            {/* The operator's own identity, from runtime auth metadata — never the repo (§45). */}
            <AccountMenu
              initials={initials}
              fullName={chrome.fullName}
              email={chrome.email}
              roleLabel={chrome.roleLabel}
              isOwner={isPlatformOwner}
              isDark={isDark}
              onToggleTheme={toggleTheme}
            />
          </div>
        </header>

        {/* ── SUB-TAB STRIP (level 2) ──────────────────────────────────────
            Rendered only when there is more than one to switch between — a strip of one is
            chrome that decides nothing. */}
        {strip.length > 1 && (
          <nav
            aria-label={`${branch.label} views`}
            className="flex flex-none items-center gap-5 overflow-x-auto border-b-[1.5px] border-border-strong bg-background px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {strip.map((t) => {
              const to = isSettings
                ? leafPath("operator", "", branch.slug, sub!.slug, t.slug)
                : subtabPath("operator", "", branch.slug, t.slug);
              const on = isSettings ? t.slug === leaf?.slug : t.slug === sub?.slug;
              // ARITY MATTERS (§32 — a wrong-arity call fails SILENTLY, not loudly). On the
              // settings branch `t` is a THIRD-level leaf, so its glyph is keyed
              // `settings/{group}/{leaf}`; calling the two-argument form here would look up
              // `settings/{leaf}`, miss every time, and quietly render 16 marks as nothing.
              const glyph = isSettings
                ? tabGlyph(branch.slug, sub!.slug, t.slug)
                : tabGlyph(branch.slug, t.slug);
              return (
                <NavLink
                  key={t.slug}
                  to={to}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative whitespace-nowrap py-[11px] text-[13.5px] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                    "inline-flex items-center gap-1.5",
                  )}
                >
                  {/* CD marks each view before its name. Absent rather than substituted where
                      the pack gives none, so the strip never invents a symbol for a surface. */}
                  {glyph && (
                    <span aria-hidden className="flex-none text-[11.5px] opacity-70">
                      {glyph}
                    </span>
                  )}
                  {t.label}
                  {/* CD's gold underline, as designed (owner ruling 2026-08-18). Its 2.35:1
                      against CD's own ground was raised once and ruled on; the label itself
                      carries the accessible signal via weight + `aria-current`, so the
                      indicator is reinforcement rather than the only cue. */}
                  {on && <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-full bg-cd-gold" />}
                </NavLink>
              );
            })}
          </nav>
        )}

        {/* The shell never page-scrolls; the pane owns its scroll (the pack's root and <main>
            are both overflow:hidden for the same reason). */}
        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {/* Real CD surfaces render here as each lands; anything not yet built says so. */}
          <OperatorSurface
            branchSlug={branch.slug}
            subSlug={sub?.slug ?? null}
            leafSlug={isSettings ? (leaf?.slug ?? null) : null}
            title={`${branch.label}${(isSettings ? leaf : sub) ? ` · ${(isSettings ? leaf : sub)!.label}` : ""}`}
            path={canonical}
            isOwner={isPlatformOwner}
          />
        </main>
      </div>
    </div>
  );
}

/**
 * The one place a canonical operator address becomes a surface.
 *
 * Every CD surface lands here as it is ported, so the shell keeps exactly ONE branch on
 * "which screen is this" instead of growing a second dispatch next to the first (§18). Each
 * surface owns its own read, because each reads a different record and none of them should
 * make the others wait.
 */
function OperatorSurface({
  branchSlug, subSlug, leafSlug, title, path, isOwner,
}: {
  branchSlug: string; subSlug: string | null; leafSlug: string | null;
  title: string; path: string; isOwner: boolean;
}) {
  const isFleet = branchSlug === "fleet" && subSlug === "tenants";
  const isCompass = branchSlug === "trust-compass" && subSlug === "autonomy";
  const isKnow = branchSlug === "paige" && subSlug === "knowledge";
  const isWorkspace = branchSlug === "paige" && subSlug === "chat";

  // Hooks are unconditional; each read is gated by its own `enabled` flag so an inactive
  // surface costs nothing (the same shape `useFleet` already uses).
  const compass = useCompass(isCompass);
  const knowledge = useKnowledge(isKnow);

  if (isFleet) return <FleetConsole canSeeRevenue={isOwner} />;
  if (isCompass)
    return (
      /* Read-only until the lane WRITE path lands: no `onCommit`, and the surface says so
         itself rather than offering a control that would silently discard the movement. */
      <TrustCompass
        departments={compass.departments}
        loading={compass.loading}
        error={compass.error}
      />
    );
  if (isKnow)
    return (
      <KnowledgeSurface
        domains={knowledge.domains}
        loading={knowledge.loading}
        error={knowledge.error}
      />
    );
  if (isWorkspace)
    return (
      /* CD's workspace chrome around the REAL operator chat.
       *
       * The platform already ships this conversation — `PaigePlatformDesk` mounts the live
       * `PaigeAIChat` at platform scope with voice dictation, spoken playback, artifact cards
       * and real thread history. CD's pack draws a thread and a composer of its own, but those
       * are a PICTURE of a chat; shipping them here would have replaced a working capability
       * with an illustration of it (§58) — which is exactly what the first pass did.
       *
       * So the rail, the header and the chrome are CD's, and the pane hosts the thing that
       * actually works. The rail's own lists stay empty until the thread/project reads are
       * wired to the same store the chat uses — an honest gap, not an invented one (§13).
       */
      <WorkspaceSurface
        projects={[]}
        recent={[]}
        earlier={[]}
        thread={[]}
        scope={isOwner ? "Platform · full" : "Platform · scoped"}
        chatSlot={<PaigePlatformDesk />}
      />
    );

  /**
   * Every other addressable tab is one of CD's generic panels — the same layout driven by its
   * own copy, which is why the pack builds them from one block rather than 70-odd components.
   * A tab the registry has no copy for still falls through to the stand-in, so a branch added
   * to the tree without copy shows as an honest gap instead of a blank frame.
   */
  const spec = subSlug ? getPanelSpec(branchSlug, subSlug, leafSlug ?? undefined) : null;
  if (spec)
    return (
      <OperatorPanel
        spec={spec}
        bodyColumns={branchSlug === "analytics" ? 2 : 1}
        slots={bespokeSlots(branchSlug, subSlug, leafSlug)}
      />
    );

  return <SurfacePlaceholder title={title} path={path} isOwner={isOwner} />;
}

/**
 * CD's account menu (pack L260-311), ported to the letter with real data behind every row.
 *
 * Three of the pack's rows are DROPPED rather than faked: the "acting as" banner (there is no
 * act-as concept at operator scope — that is an Agency capability, not this tier's), the
 * SESSION/device line (no real device-fingerprint read exists), and the trailing seat COUNT
 * on "Platform seats" (no roster hook exists yet — the row still works as real navigation, it
 * just doesn't claim a number it hasn't read). Everything else — identity, role, theme, the two
 * real links, sign out — is exactly what the pack draws, fed from `useOperatorChrome` and the
 * real auth session rather than invented (§13/§28).
 */
function AccountMenu({
  initials, fullName, email, roleLabel, isOwner, isDark, onToggleTheme,
}: {
  initials: string | null;
  fullName: string | null | undefined;
  email: string | null | undefined;
  roleLabel: string | null;
  isOwner: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (!initials) return null;

  return (
    <div className="relative flex-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account"
        className="grid h-8 w-8 flex-none place-items-center rounded-full border-2 border-cd-gold bg-rail text-[11.5px] font-semibold text-rail-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {initials}
      </button>
      {open && (
        <>
          {/* CD's full-viewport scrim, closing the menu on any outside click. */}
          <div className="fixed inset-0 z-[69]" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-[42px] z-[70] flex w-[300px] flex-col overflow-hidden rounded-[13px] border border-border bg-card shadow-[0_24px_54px_hsl(var(--shadow-ink)/0.18)]"
          >
            <div className="flex flex-none items-center gap-[11px] border-b border-border/70 bg-muted/40 px-[15px] py-3.5">
              <div className="grid h-[38px] w-[38px] flex-none place-items-center rounded-full bg-rail text-[13px] font-bold text-rail-foreground">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold text-foreground">
                  {fullName ?? "—"}
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                  {email ?? "—"}
                </div>
                <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                  <span className="flex-none rounded-full bg-[hsl(var(--primary)/0.12)] px-2.5 py-[2.5px] text-[10px] font-semibold text-[hsl(var(--primary))]">
                    {roleLabel ?? "—"}
                  </span>
                  <span className="min-w-0 truncate text-[10.5px] text-muted-foreground">
                    {isOwner ? "Platform · full" : "Platform · scoped"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-[7px]">
              <NavLink
                to={leafPath("operator", "", "settings", "governance", "audit-log")}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-[9px] py-[7px] text-[12px] text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden className="flex-none text-[11px] text-[hsl(var(--success))]">✓</span>
                <span>Audit log</span>
                <span aria-hidden className="ml-auto flex-none text-[11px] text-muted-foreground">›</span>
              </NavLink>
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex w-full items-center gap-2.5 rounded-lg px-[9px] py-[7px] text-left text-[12px] text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden className="flex-none text-[11px] text-muted-foreground">{isDark ? "☀" : "☾"}</span>
                <span>Appearance</span>
                <span className="ml-auto flex-none text-[11px] text-muted-foreground">{isDark ? "Dark" : "Light"}</span>
              </button>
              <NavLink
                to={leafPath("operator", "", "settings", "team", "seats")}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-[9px] py-[7px] text-[12px] text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden className="flex-none text-[11px] text-muted-foreground">⛉</span>
                <span>Platform seats</span>
              </NavLink>
            </div>
            <button
              type="button"
              disabled={signingOut}
              onClick={() => {
                setSigningOut(true);
                void performSignOut({ redirectTo: "/operator/login" });
              }}
              className="flex flex-none items-center gap-2.5 border-t border-border/70 bg-muted/40 px-[15px] py-[11px] text-left hover:bg-[hsl(var(--destructive)/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <span aria-hidden className="flex-none text-[11px] text-[hsl(var(--destructive))]">⏻</span>
              <span className="text-[12.5px] font-semibold text-[hsl(var(--destructive))]">
                {signingOut ? "Signing out…" : "Sign out"}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The honest stand-in for a surface that has an ADDRESS but no implementation yet. It states
 * plainly that it is not built — never a fabricated dashboard, and never a plausible empty
 * state that reads as "you have no data" when the truth is "this does not exist yet" (§13).
 * It also points at the console that IS live, so the operator is never stranded (§58).
 */
function SurfacePlaceholder({
  title, path, isOwner,
}: { title: string; path: string; isOwner: boolean }) {
  return (
    <EmptyState
      title={title}
      description={
        `This surface has an address but is not built yet. Its implementation lands in its own slice — ` +
        `until then the live operator console is at /admin/platform. Canonical path: ${path}` +
        (isOwner ? "" : " · Some operator surfaces are owner-only and stay hidden for scoped platform admins.")
      }
    />
  );
}

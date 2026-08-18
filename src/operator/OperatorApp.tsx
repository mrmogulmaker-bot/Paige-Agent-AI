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
import { getPanelSpec } from "@/operator/surfaces/panelSpecs";
import WorkspaceSurface from "@/operator/surfaces/WorkspaceSurface";
import { PaigePlatformDesk } from "@/components/paige/PaigePlatformDesk";
import { MarketplaceStore, MarketplaceReview, IntegrationsGrid } from "@/operator/surfaces/MarketplaceSurfaces";
import { CalendarMonth, CalendarWeek } from "@/operator/surfaces/CalendarSurfaces";
import { ComposeSurface } from "@/operator/surfaces/ComposeSurface";
import { SupportThread } from "@/operator/surfaces/SupportThread";
import { PipelineHead, PipelineBoard, StageBoard } from "@/operator/surfaces/PipelineSurfaces";
import { SocialGrid, SocialQueue } from "@/operator/surfaces/SocialSurfaces";
import BufferDiagram from "@/operator/surfaces/BufferDiagram";
import { AreaChart, Bench } from "@/operator/surfaces/AnalyticsSurfaces";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useIsPlatformOwner } from "@/operator/data/useIsPlatformOwner";
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
  to, label, glyph, active, collapsed, tone = "default",
}: {
  to: string; label: string; active: boolean; collapsed: boolean;
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
        "mx-2 flex items-center rounded-[9px] transition-colors",
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
        className={cn("truncate leading-[1.35]", collapsed && "sr-only")}
        style={{ fontSize: "var(--rail-font)" }}
      >
        {label}
      </span>
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
  const isPlatformOwner = ownerVerdict === true || contextOwner;
  const ownerAnswered = ownerVerdict !== null || contextOwner;
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ fleet: true, business: true });

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
              <div className="truncate text-[13px] font-semibold leading-tight">Paige Agent AI</div>
              <div className="truncate text-[10.5px] leading-tight text-rail-foreground/60">
                Platform operator
              </div>
            </div>
          )}
        </div>

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
      </aside>

      {/* ── CONTENT COLUMN ────────────────────────────────────────────────── */}
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
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
            <div className="mt-0.5 truncate text-[12.5px] text-foreground">
              {isPlatformOwner ? "Platform operator · full control" : "Platform operator · scoped"}
            </div>
          </div>
          <div className="ml-auto flex flex-none items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
              Console preview
            </span>
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
              return (
                <NavLink
                  key={t.slug}
                  to={to}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative whitespace-nowrap py-[11px] text-[13.5px] transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
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
  if (spec) return <OperatorPanel spec={spec} bodyColumns={branchSlug === "analytics" ? 2 : 1} />;

  return <SurfacePlaceholder title={title} path={path} isOwner={isOwner} />;
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

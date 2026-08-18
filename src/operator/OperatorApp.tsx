import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useParams, Navigate } from "react-router-dom";
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  OPERATOR_BRANCHES, leafPath, subtabPath, branchPath,
  type Branch, type SubTab,
} from "@/lib/routing/tierBranches";
import { EmptyState } from "@/components/ui/page";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { useTenantContext } from "@/hooks/useTenantContext";
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
 * §11 — WHERE THIS DEPARTS FROM THE PACK, DELIBERATELY. Three departures, all named in the PR:
 *   • The active sub-tab underline is INDIGO, not the design's gold. A nav-active indicator is
 *     not an act (§11), our shipped OperatorTabs already carries the indigo rule in code, and
 *     the design's gold measures 2.35:1 on its own background — under even the 3:1 non-text
 *     bar. Doctrine and accessibility agree here.
 *   • The selected rail row and the open-menu ring are neutral/indigo for the same reason.
 *   • The palette is our cool indigo, not the pack's warm cream. We map by ROLE, not by hex —
 *     there is no warm-neutral family in our tokens and inventing one would fork the platform
 *     palette (§23 is an owner ruling, not a porter's call). This matches the design's
 *     STRUCTURE; it deliberately does not match its temperature.
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
    if (!branch) return { branch: null, sub: null, leaf: null };
    const [subSlug, leafSlug] = splat.split("/").filter(Boolean);
    const subs = branch.subtabs ?? [];
    const sub = (subSlug ? subs.find((s) => s.slug === subSlug) : subs[0]) ?? subs[0] ?? null;
    const leaves = sub?.subtabs ?? [];
    const leaf = leaves.length
      ? (leafSlug ? leaves.find((l) => l.slug === leafSlug) : leaves[0]) ?? leaves[0] ?? null
      : null;
    return { branch, sub, leaf };
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
  to, label, active, collapsed,
}: { to: string; label: string; active: boolean; collapsed: boolean }) {
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
        // Selected is a neutral white-alpha lift, never gold — a resting selection is not an
        // act (§11). The pack renders this exact state in white on its front menu and in gold
        // on its settings menu; we unify on the white.
        active
          ? "bg-rail-foreground/10 font-medium text-rail-foreground"
          : "text-rail-foreground/70 hover:bg-rail-foreground/[0.06] hover:text-rail-foreground",
      )}
    >
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
  const { branch, sub, leaf } = useResolved(section, splat);
  const { isPlatformOwner } = useTenantContext();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ fleet: true, business: true });

  const toggleGroup = useCallback(
    (key: string) => setOpenGroups((g) => ({ ...g, [key]: !g[key] })),
    [],
  );

  const railBranches = useMemo(
    () =>
      OPERATOR_BRANCHES.filter(
        (b) => b.group !== "settings" && (isPlatformOwner || !OWNER_ONLY_SECTIONS.has(b.slug)),
      ),
    [isPlatformOwner],
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
  if (OWNER_ONLY_SECTIONS.has(branch.slug) && !isPlatformOwner) {
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

  // Level 2 for a normal branch is its subtabs; inside settings the rail holds the groups, so
  // the strip shows the selected group's leaves instead.
  const strip: SubTab[] = (isSettings ? sub?.subtabs : branch.subtabs) ?? [];

  return (
    <div
      className={cn(
        "grid h-dvh overflow-hidden bg-background text-foreground",
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

        {/* Nav */}
        <div
          ref={navRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-1.5"
          style={{ scrollbarWidth: "thin" }}
        >
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
                      {/* /60 rather than the pack's #7C73A0, which measures 4.11:1 on the rail
                          and fails AA at 8.5px uppercase (C2). */}
                      <span className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-rail-foreground/60">
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
                ? "bg-rail-foreground/10 font-medium text-rail-foreground"
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
                  {/* Indigo, not the design's gold — nav-active is not an ACT (§11), and the
                      design's gold fails even the 3:1 non-text bar on its own ground. */}
                  {on && <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 rounded-t-full bg-primary" />}
                </NavLink>
              );
            })}
          </nav>
        )}

        {/* The shell never page-scrolls; the pane owns its scroll (the pack's root and <main>
            are both overflow:hidden for the same reason). */}
        <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          <SurfacePlaceholder
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

/**
 * OperatorShell — the operator console's geometry. Band above, three columns beneath.
 *
 * PORTED FROM THE PACK, not from what was here (§30 — strip, do not layer). The shell this
 * replaces was a two-column grid built for seventeen branches in two collapsible groups over a
 * three-level tree; none of that machinery survives contact with six flat slots, so none of it
 * was carried across. The pack's own geometry (`v3.dc.html` L71-L126, `shellStyle` L10728,
 * `canvasStyle` L11040):
 *
 *   root      height:100vh · flex column · overflow:hidden      ← the document never scrolls
 *   band      flex:none · min-height:36px                       ← spans all three columns
 *   shell     flex:1 · min-height:0 · display:grid
 *             216px | minmax(0,1fr) | minmax(340px,26vw)        ← at rest
 *              72px | minmax(0,1fr) | minmax(340px,26vw)        ← rail compact
 *             216px | minmax(0,1fr) | 0px                       ← spine collapsed
 *             transition: grid-template-columns 200ms cubic-bezier(.22,1,.36,1)
 *   canvas    grid-template-rows: 58px minmax(0,1fr)
 *
 * RULE 4 IS SYSTEMATIC HERE, NOT SPOT-CHECKED. Every grid and flex child carries an explicit
 * `min-w-0` (and `min-h-0` wherever it is a vertical child), because the browser's `auto`
 * minimum sizes a track by its CONTENT: one long tenant name, one unbroken canonical path, one
 * wide table and the track blows out at a width nobody tests. That defect landed six times
 * during design; the fix is a rule applied to every child, not to the ones that looked risky.
 *
 * ROUND 1 IS GEOMETRY. It wires no data. The canvas renders the slot's views as its own tab row
 * and, where the IA holds an ABSENCE, renders that absence verbatim; a slot without one renders
 * an empty region reserved for the surface that lands in a later round. Nothing here invents a
 * figure, a tenant name, or an empty-state paragraph (§13 — and `src/operator/CLAUDE.md`: the
 * pack's prose is design copy, and a stand-in paragraph where the pack draws a surface is not
 * the design).
 *
 * §58 — WHAT THIS ROUND DOES NOT CARRY YET, said plainly rather than left to be discovered. The
 * seventeen-branch console's live surfaces (Fleet Console, Systems Check, History, Team Pulse,
 * Alert Rules, Trust Compass, Knowledge, and the panel-spec surfaces) are addressed
 * `/operator/{branch}/{subtab}` and have no address in the six-slot IA. Their modules are
 * untouched on disk and the shell that mounted them is preserved at
 * `src/operator/legacy/OperatorLegacyApp.tsx` — nothing was deleted — but while this shell owns
 * `/operator/*` they are NOT reachable. Wiring them into the slots is the next round's work.
 */
import { useCallback, useEffect, useState } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { OPERATOR_SLOTS } from "@/operator/ia/operatorIA";
import {
  canonicalPath, resolveOperatorAddress, slotPath, viewPath, type OperatorAddress,
} from "@/operator/shell/operatorAddress";
import ScopeBand from "@/operator/shell/ScopeBand";
import { PLATFORM_SCOPE } from "@/operator/shell/scopeStates";
import SlotRail from "@/operator/shell/SlotRail";
import OperatorSpine from "@/operator/shell/OperatorSpine";
import SlotSurfaceBody from "@/operator/shell/SlotSurfaceBody";
import { performSignOut } from "@/lib/auth/signOut";
import { cn } from "@/lib/utils";

const RAIL_REST = "216px";
const RAIL_COMPACT = "72px";
const SPINE_OPEN = "minmax(340px,26vw)";
const SPINE_SHUT = "0px";

export default function OperatorShell() {
  const params = useParams();
  const address = resolveOperatorAddress(params.section, params["*"] ?? "");

  const reduce = useReducedMotion();
  const [railCompact, setRailCompact] = useState(false);
  const [spineOpen, setSpineOpen] = useState(true);
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  /** One theme mechanism for the whole app (§18) — the console never invents a second. */
  const toggleTheme = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setIsDark(next);
  }, []);

  /**
   * The pack's two shell shortcuts: ⌘\ folds the spine, ⌥⌘\ collapses the rail. Scoped to this
   * shell's lifetime and deliberately NOT ⌘K — the command palette has exactly one owner
   * platform-wide (`AgentPresenceContext`), and a second listener for it here would be the §18
   * collision that guard exists to catch.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "\\") return;
      e.preventDefault();
      if (e.altKey) setRailCompact((v) => !v);
      else setSpineOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A URL naming a view that does not exist is rewritten to the address of what is actually on
  // screen, rather than rendering one view while the address bar names another. An unknown SLOT
  // is a different failure and is NOT redirected — see the 404 below.
  if (address.kind === "resolved" && address.stale) {
    return <Navigate to={canonicalPath(address)} replace />;
  }

  const columns = [
    railCompact ? RAIL_COMPACT : RAIL_REST,
    "minmax(0,1fr)",
    spineOpen ? SPINE_OPEN : SPINE_SHUT,
  ].join(" ");

  return (
    <div
      // `data-pg` is what scopes CD's installed design system to this subtree (index.css), and
      // it carries the THEME rather than a class — the pack authors both themes separately,
      // because champagne inverts role between them and neither is a filter of the other.
      // `data-shell-root` paints `--pg-env`, the ground the depth ladder sits on.
      data-pg={isDark ? "dark" : "light"}
      data-shell-root
      className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <ScopeBand {...PLATFORM_SCOPE} />

      <div
        data-shell-grid
        className="grid min-h-0 min-w-0 flex-1"
        style={{
          gridTemplateColumns: columns,
          transition: reduce ? undefined : "grid-template-columns 200ms cubic-bezier(.22,1,.36,1)",
        }}
      >
        <SlotRail
          compact={railCompact}
          onToggleCompact={() => setRailCompact((v) => !v)}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          onSignOut={() => void performSignOut({ redirectTo: "/operator/login" })}
        />

        <OperatorCanvas
          address={address}
          spineOpen={spineOpen}
          onToggleSpine={() => setSpineOpen((v) => !v)}
        />

        {/* Both collapse mechanisms, as the pack has them: the track goes to 0px AND the panel
            unmounts. Either alone is a visible defect. */}
        {spineOpen && <OperatorSpine />}
      </div>
    </div>
  );
}

/** Column 2: a 58px command row over a scrolling surface region. */
function OperatorCanvas({
  address, spineOpen, onToggleSpine,
}: {
  address: OperatorAddress;
  spineOpen: boolean;
  onToggleSpine: () => void;
}) {
  return (
    <div className="relative grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[58px_minmax(0,1fr)] bg-background">
      {/* Row 1 — the command row. 58px exactly: the pack keeps this height, the canvas row track
          and the slide-over's top offset equal, and they drift apart the moment one is guessed.
          Its left half is the command bar's reserved space; the bar and its palette are a later
          round, and an inert pill that looks like a control but answers nothing is a defect
          (`src/operator/CLAUDE.md` — every control is real or honestly inert), so the space is
          left empty rather than filled with a decoy. */}
      <div className="col-span-full row-start-1 flex min-h-0 min-w-0 items-center gap-4 border-b border-border bg-card px-5">
        <div className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={onToggleSpine}
          aria-label={spineOpen ? "Fold PAIGE away" : "Bring PAIGE back"}
          aria-expanded={spineOpen}
          title={spineOpen ? "Fold PAIGE away  ⌘\\" : "Bring PAIGE back  ⌘\\"}
          className={cn(
            "grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px]",
            "border border-border bg-background text-muted-foreground",
            "transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <i
            aria-hidden
            className={cn(
              "h-3.5 w-3.5 rounded-[2px] border border-current",
              spineOpen ? "border-r-[3px]" : "border-r",
            )}
          />
        </button>
      </div>

      {/* Row 2 — the surface. The ONLY scroller in this column. */}
      <main className="relative col-start-1 row-start-2 min-h-0 min-w-0 overflow-auto">
        <div className="mx-auto w-[min(100%,1080px)] min-w-0 px-[clamp(24px,3vw,44px)] pb-[72px] pt-8">
          {address.kind === "unknown" ? (
            <UnknownSection section={address.section} />
          ) : (
            <SlotSurface address={address} />
          )}
        </div>
      </main>
    </div>
  );
}

function SlotSurface({ address }: { address: Extract<OperatorAddress, { kind: "resolved" }> }) {
  const { slot, view } = address;
  return (
    <>
      <header className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-8 border-b border-border pb-5">
        <h1 className="min-w-0 truncate text-[21px] font-medium leading-[1.1] tracking-[-0.022em] text-foreground">
          {slot.label}
        </h1>
        <code className="hidden flex-none font-mono text-[11px] text-muted-foreground md:block">
          {canonicalPath(address)}
        </code>
      </header>

      {/* The view row. `z-12` is the pack's own call and it is load-bearing: the row that gets
          you OUT of a surface must sit above anything a surface summons over it. It scrolls
          sideways within itself and never widens the column (min-w-0 + overflow-x). */}
      {slot.views.length > 0 && (
        <nav
          aria-label={`${slot.label} views`}
          className="relative z-[12] my-2.5 flex min-w-0 flex-none flex-nowrap gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slot.views.map((name) => (
            <NavLink
              key={name}
              to={viewPath(slot.id, name)}
              data-view={name}
              aria-current={name === view ? "page" : undefined}
              className={cn(
                "relative flex-none whitespace-nowrap rounded-t-[6px] px-3 py-2 text-[13px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                name === view
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {name}
              {name === view && (
                <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-cd-gold" />
              )}
            </NavLink>
          ))}
        </nav>
      )}

      {/* The surface region. `SlotSurfaceBody` resolves the view to the feature that already
          ships — a bespoke component, its ported CD panels, or the absence that names what is
          missing. A header over an empty section is the blank-screen failure this console has
          been rejected for twice; no path here renders nothing. */}
      <section data-surface-slot={slot.id} data-surface-view={view ?? undefined} className="min-w-0 pt-1">
        <SlotSurfaceBody slot={slot} view={view} />
      </section>
    </>
  );
}

/**
 * An address no slot answers to.
 *
 * It renders IN the shell — rail, band and spine intact — because the operator is not lost, one
 * segment is. And it does NOT redirect: the shell this replaces sent every unknown section to
 * Fleet with `replace`, which showed a surface the operator never asked for AND destroyed the
 * address that would have revealed the mistake. A wrong link should say it is wrong.
 */
function UnknownSection({ section }: { section: string }) {
  return (
    <div className="min-w-0 max-w-[68ch]">
      <h1 className="min-w-0 text-[21px] font-medium leading-[1.1] tracking-[-0.022em] text-foreground">
        No slot answers to this address
      </h1>
      <p className="mt-2 min-w-0 text-[13px] leading-[1.6] text-muted-foreground">
        <code className="font-mono text-[13px] text-foreground">/operator/{section}</code> does not
        resolve. The console has six slots:
      </p>
      <ul className="mt-4 grid min-w-0 gap-1">
        {OPERATOR_SLOTS.map((slot) => (
          <li key={slot.id} className="min-w-0">
            <NavLink
              to={slotPath(slot.id)}
              className="inline-block min-w-0 truncate text-[13px] text-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {slot.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Trust Compass — Claude Design's `isCompass` block (Super Admin Shell.dc.html, L475–579).
 *
 * The autonomy console: the ten-department dial grid on CD's dark panel, its lane legend and
 * shortcut legend, the moved-note on a dial the operator has turned, the dirty-state
 * Commit/Revert bar, and the 290px right rail (Worth raising · Paige's read).
 *
 * §13 — THIS SURFACE INVENTS NO LANE. A lane is a governance gate: every action Paige takes
 * passes through it before it runs (draft only · ask first · draft and send), and the platform
 * compass is the CEILING every tenant's compass is clamped by. Rendering a plausible-looking
 * lane position for a department would not be a cosmetic lie — it would tell the operator that
 * a gate is set where it is not. So the dials are drawn ONLY from `departments` handed in by
 * the caller. No `departments` → no dials, and the surface says plainly that the autonomy
 * substrate is not connected. CD's own pack agrees: its header carries the banner "No autonomy
 * substrate exists yet — lanes shown here are stand-ins, not platform settings."
 *
 * §10 — the caller owns the seam. `onCommit` receives the batch of movements (department,
 * from-lane, to-lane) so one commit becomes ONE audit entry with several movements inside it,
 * which is what the backend note asks for (`PUT /autonomy/lanes` accepts a batch). With no
 * `onCommit` the dials are READ-ONLY and say so, rather than offering a control that silently
 * discards what the operator just set.
 */

/** 0 draft · 1 ask · 2 send — the `autonomy_lanes.lane` smallint, not a UI invention. */
export type AutonomyLane = 0 | 1 | 2;

export type CompassDepartment = {
  /** The department enum value the backend keys on. */
  id: string;
  name: string;
  /** The lane the platform record actually holds right now. */
  lane: AutonomyLane;
  /** What she is doing in that department, when the caller knows. Never invented here. */
  focus?: string | null;
};

/** One movement in a commit — `previous_lane` is what makes the audit read as a movement. */
export type LaneChange = { id: string; name: string; from: AutonomyLane; to: AutonomyLane };

export type CompassAction = {
  id: string;
  text: string;
  cta: string;
  /** `act` edges gold (a move she is asking for), `hold` edges green (leave it alone). */
  tone: "act" | "hold";
  onAct?: () => void;
};

export type TrustCompassProps = {
  /** The platform-scope lanes. Empty = the substrate is not wired; the surface says so. */
  departments: readonly CompassDepartment[];
  loading?: boolean;
  error?: string | null;
  /** Batch commit. Absent → read-only dials, stated on the surface. */
  onCommit?: (changes: readonly LaneChange[]) => void;
  /** Rail: what Paige thinks is worth raising. Absent → the rail card says it is not wired. */
  actions?: readonly CompassAction[];
  /** Rail: Paige's read of the compass. Absent → the card says she has not read it yet. */
  read?: string | null;
  /** Rail: opens the operator workspace with the compass in context. */
  onAsk?: () => void;
};

const LANE_LABEL = ["Draft only", "Ask first", "Draft and send"] as const;
const LANE_NOTE = [
  "She writes it, you send it",
  "She acts once you say yes",
  "She acts, and tells you after",
] as const;
/** CD's dial geometry: the arc percentage and the pointer angle per lane. */
const LANE_PCT = [18, 58, 92] as const;

/**
 * CD's three lane hues mapped onto our semantic tokens — blue/amber/green become
 * chart-4/warning/success-light, so the console re-tints with the theme instead of carrying
 * three pasted hexes (§11 token-only).
 */
const LANE_TONE = [
  "hsl(var(--chart-4))",
  "hsl(var(--warning))",
  "hsl(var(--success-light))",
] as const;

const clampLane = (n: number): AutonomyLane => (n < 0 ? 0 : n > 2 ? 2 : (n as AutonomyLane));

export default function TrustCompass({
  departments,
  loading = false,
  error = null,
  onCommit,
  actions,
  read = null,
  onAsk,
}: TrustCompassProps) {
  /** Draft movements, keyed by department id. Nothing applies until Commit (CD's rule). */
  const [draft, setDraft] = useState<Record<string, AutonomyLane>>({});
  const [lastMoved, setLastMoved] = useState<string | null>(null);
  const editable = typeof onCommit === "function";

  const put = useCallback(
    (d: CompassDepartment, next: number) => {
      if (!editable) return;
      const lane = clampLane(next);
      setDraft((prev) => ({ ...prev, [d.id]: lane }));
      setLastMoved(d.name);
    },
    [editable],
  );

  const laneOf = useCallback(
    (d: CompassDepartment): AutonomyLane => draft[d.id] ?? d.lane,
    [draft],
  );

  const changes = useMemo<LaneChange[]>(
    () =>
      departments
        .filter((d) => draft[d.id] != null && draft[d.id] !== d.lane)
        .map((d) => ({ id: d.id, name: d.name, from: d.lane, to: draft[d.id] })),
    [departments, draft],
  );

  /** CD's chip. A share of nothing is not 0% — with no lanes read it is "—" (§13). */
  const autopilot = departments.length
    ? `${Math.round((departments.filter((d) => laneOf(d) === 2).length / departments.length) * 100)}% on autopilot`
    : "—";

  const legend = useMemo(
    () =>
      LANE_LABEL.map((label, lane) => ({
        label,
        note: LANE_NOTE[lane],
        tone: LANE_TONE[lane],
        count: departments.length ? String(departments.filter((d) => laneOf(d) === lane).length) : "—",
      })),
    [departments, laneOf],
  );

  const revert = () => {
    setDraft({});
    setLastMoved(null);
  };

  const commit = () => {
    if (!onCommit || !changes.length) return;
    onCommit(changes);
    setDraft({});
    setLastMoved(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* ── title row ───────────────────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[9.5px] font-semibold tracking-[0.15em] text-muted-foreground">
              TRUST COMPASS
            </span>
            <span className="text-[21px] font-bold tracking-[-0.02em]">Trust Compass</span>
            <span
              title={
                departments.length
                  ? "Platform scope. Every tenant's compass is clamped by this one."
                  : "No autonomy substrate is connected — nothing on this surface is a live platform setting."
              }
              className="grid h-[19px] w-[19px] flex-none cursor-help place-items-center rounded-[6px] border border-[hsl(var(--warning)/0.35)] bg-[hsl(var(--warning)/0.14)] text-[11px] font-bold text-[hsl(var(--gold-dark))]"
            >
              !
            </span>
          </div>
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">
            How much she may act at platform scope, department by department. Every tenant&apos;s
            compass is clamped by this one.
          </div>
        </div>
        <div className="ml-auto flex-none whitespace-nowrap rounded-[20px] border border-border bg-muted px-3.5 py-[7px] text-[12px] font-semibold text-foreground/80">
          {loading ? "—" : autopilot}
        </div>
      </div>

      {/* ── the clamp, stated once, above the console ────────────────────── */}
      <div className="flex min-w-0 flex-none items-center gap-2.5 rounded-[10px] border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.06)] px-3 py-2">
        <span aria-hidden className="flex-none text-[11px] text-[hsl(var(--primary))]">⌖</span>
        <span className="min-w-0 text-[11.5px] leading-[1.45] text-[hsl(var(--primary))]">
          This is the ceiling, not the setting. A tenant can lower their own department below the
          platform lane but never raise it above.
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3.5">
        {/* ── the console ───────────────────────────────────────────────── */}
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[15px] bg-rail px-4 py-3.5 text-rail-foreground shadow-[shadow:0_16px_36px_hsl(var(--shadow-ink)/0.32)]"
          // CD's panel is a two-stop gradient (#111A2C → #191231). The second stop IS --rail,
          // so the first is expressed as a token-built wash over it rather than a pasted hex.
          style={{
            backgroundImage:
              "linear-gradient(150deg, hsl(var(--foreground) / 0.16), hsl(var(--foreground) / 0))",
          }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="text-[9px] font-semibold tracking-[0.16em] text-rail-foreground/50">
              PLATFORM AUTONOMY · {departments.length ? `${departments.length} DEPARTMENTS` : "NOT CONNECTED"}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              {legend.map((l) => (
                <span key={l.label} title={l.note} className="flex items-center gap-[7px]">
                  <span
                    aria-hidden
                    className="h-2 w-2 flex-none rounded-full"
                    style={{ background: l.tone }}
                  />
                  <span className="whitespace-nowrap text-[10.5px] text-rail-foreground/[0.66]">
                    {l.label}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-rail-foreground/[0.74]">
                    {l.count}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Loading · error · not-connected all say what is true, and draw no dials. */}
          {loading && (
            <div className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(min(104px,100%),1fr))] content-start gap-2.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="flex animate-pulse flex-col items-center gap-[7px] rounded-[13px] border border-rail-foreground/10 bg-rail-foreground/[0.035] px-2.5 py-[11px]"
                >
                  <span className="h-[46px] w-[46px] rounded-full bg-rail-foreground/10 sm:h-[54px] sm:w-[54px]" />
                  <span className="h-2 w-16 rounded bg-rail-foreground/10" />
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
              <div className="max-w-md">
                <div className="text-[13px] font-semibold text-rail-foreground">
                  The autonomy lanes could not be read.
                </div>
                <div className="mt-1.5 text-[11.5px] leading-relaxed text-rail-foreground/70">
                  {error} Nothing is shown rather than a lane that might be wrong — a governance
                  gate you cannot trust is worse than one you cannot see.
                </div>
              </div>
            </div>
          )}

          {!loading && !error && departments.length === 0 && (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
              <div className="max-w-md">
                <div className="text-[13px] font-semibold text-rail-foreground">
                  This surface is not connected to its backend yet.
                </div>
                <div className="mt-1.5 text-[11.5px] leading-relaxed text-rail-foreground/70">
                  The autonomy substrate — the <span className="font-mono">autonomy_lanes</span>{" "}
                  record, its clamp constraint and the batch commit — does not exist yet, so there
                  are no lanes to show. No dial is drawn until a real lane backs it: a fabricated
                  lane position would claim a gate is set where it is not.
                </div>
              </div>
            </div>
          )}

          {/* ── the dials ─────────────────────────────────────────────── */}
          {!loading && !error && departments.length > 0 && (
            <ul className="grid min-h-0 flex-1 list-none grid-cols-[repeat(auto-fit,minmax(min(104px,100%),1fr))] content-start gap-2.5 overflow-y-auto overflow-x-hidden p-0">
              {departments.map((d, i) => {
                const lane = laneOf(d);
                const label = LANE_LABEL[lane];
                const tone = LANE_TONE[lane];
                const pct = LANE_PCT[lane];
                const moved = draft[d.id] != null && draft[d.id] !== d.lane;
                return (
                  <li
                    key={d.id}
                    className="group relative flex min-w-0 flex-col items-center gap-[7px] rounded-[13px] border border-rail-foreground/10 bg-rail-foreground/[0.035] px-2.5 py-[11px] transition-colors hover:border-rail-foreground/30 hover:bg-rail-foreground/[0.07]"
                  >
                    <div
                      role={editable ? "slider" : "img"}
                      tabIndex={editable ? 0 : undefined}
                      aria-label={
                        editable
                          ? `${d.name} autonomy · ${label} · arrow keys lower and raise`
                          : `${d.name} autonomy · ${label} · read only`
                      }
                      aria-valuemin={editable ? 0 : undefined}
                      aria-valuemax={editable ? 2 : undefined}
                      aria-valuenow={editable ? lane : undefined}
                      aria-valuetext={editable ? label : undefined}
                      aria-readonly={editable ? undefined : true}
                      title={d.focus ?? `${d.name} · ${label}`}
                      onClick={editable ? () => put(d, lane === 2 ? 0 : lane + 1) : undefined}
                      onKeyDown={
                        editable
                          ? (e) => {
                              const k = e.key;
                              if (k === "ArrowRight" || k === "ArrowUp") {
                                e.preventDefault();
                                put(d, lane + 1);
                              } else if (k === "ArrowLeft" || k === "ArrowDown") {
                                e.preventDefault();
                                put(d, lane - 1);
                              } else if (k === "1") put(d, 0);
                              else if (k === "2") put(d, 1);
                              else if (k === "3") put(d, 2);
                              else if (k === " " || k === "Enter") {
                                e.preventDefault();
                                put(d, lane === 2 ? 0 : lane + 1);
                              }
                            }
                          : undefined
                      }
                      // CD adjusts the lane on scroll-over. React's wheel listener is passive, so
                      // preventDefault() there is a console error and hijacking an un-focused
                      // wheel steals the page scroll. Scroll therefore only moves a dial the
                      // operator has actually focused — CD's affordance, without the hijack.
                      onWheel={
                        editable
                          ? (e) => {
                              if (document.activeElement !== e.currentTarget) return;
                              put(d, lane + (e.deltaY < 0 ? 1 : -1));
                            }
                          : undefined
                      }
                      className={cn(
                        "relative h-[46px] w-[46px] flex-none rounded-full outline-none sm:h-[54px] sm:w-[54px]",
                        editable
                          ? "cursor-grab focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-rail"
                          : "cursor-default",
                      )}
                    >
                      {/* the seat the dial sits in */}
                      <span
                        aria-hidden
                        className="absolute -inset-[3px] rounded-full shadow-[shadow:0_6px_14px_hsl(var(--shadow-ink)/0.5)]"
                        style={{
                          background:
                            "radial-gradient(circle at 50% 0%, hsl(var(--rail-foreground) / 0.16), hsl(var(--rail-foreground) / 0.03) 58%)",
                        }}
                      />
                      {/* the lane arc */}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute inset-0 rounded-full motion-safe:animate-pulse",
                        )}
                        style={{
                          animationDuration: `${(3.4 + (i % 3) * 0.5).toFixed(1)}s`,
                          background: `conic-gradient(from 220deg, ${tone} 0 ${pct * 0.8}%, hsl(var(--rail-foreground) / 0.10) ${pct * 0.8}% 80%, transparent 80%)`,
                        }}
                      />
                      <span
                        aria-hidden
                        className="absolute inset-[4px] rounded-full border border-rail-foreground/[0.14]"
                      />
                      {/* the cap, and the pointer that reads the lane */}
                      <span
                        aria-hidden
                        className="absolute inset-[7px] grid place-items-center rounded-full shadow-[shadow:inset_0_1px_2px_hsl(var(--rail-foreground)/0.2),inset_0_-2px_4px_hsl(var(--shadow-ink)/0.5),0_5px_12px_hsl(var(--shadow-ink)/0.45)]"
                        style={{
                          background:
                            "radial-gradient(circle at 34% 26%, hsl(var(--rail-foreground) / 0.18), hsl(var(--rail) / 0.98) 74%)",
                        }}
                      >
                        <span
                          className="-mt-2 w-[2.5px] rounded-[2px] transition-transform"
                          style={{
                            height: "14px",
                            background: tone,
                            boxShadow: `0 0 6px ${tone}`,
                            transform: `rotate(${-140 + pct * 2.8}deg)`,
                            transformOrigin: "50% 92%",
                          }}
                        />
                      </span>
                    </div>

                    <div className="min-w-0 text-center">
                      <div className="text-[11.5px] font-semibold leading-[1.25] text-rail-foreground">
                        {d.name}
                      </div>
                      <div
                        className="mt-[3px] truncate whitespace-nowrap text-[10px]"
                        style={{ color: tone }}
                      >
                        {label}
                      </div>
                      {moved && (
                        <div className="mt-[2px] truncate whitespace-nowrap text-[9px] text-cd-gold-ink">
                          changed from {LANE_LABEL[d.lane].toLowerCase()}
                        </div>
                      )}
                    </div>

                    {editable && (
                      <div role="group" aria-label={`${d.name} lane`} className="flex items-center gap-[3px]">
                        {LANE_LABEL.map((stop, v) => (
                          <button
                            key={stop}
                            type="button"
                            title={stop}
                            aria-label={`${d.name}: ${stop}`}
                            aria-pressed={lane === v}
                            onClick={() => put(d, v)}
                            className={cn(
                              "h-[5px] w-4 rounded-[3px] transition-opacity",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-rail",
                              lane === v ? "opacity-100" : "opacity-55 hover:opacity-100",
                            )}
                            style={{ background: LANE_TONE[v] }}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* ── shortcut legend · CD's own list, rendered only where the keys work ── */}
          {editable && departments.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-3 px-3.5 pt-2.5">
              {[
                { keys: "Click", what: "cycle the lane" },
                { keys: "← →", what: "lower · raise" },
                { keys: "1 2 3", what: "draft · ask · send" },
                { keys: "Scroll", what: "over a focused dial" },
              ].map((h) => (
                <span key={h.keys} className="flex flex-none items-center gap-1.5">
                  <kbd className="rounded-[5px] border border-rail-foreground/[0.14] bg-rail-foreground/[0.09] px-1.5 py-0.5 font-mono text-[9.5px] font-normal text-rail-foreground/85">
                    {h.keys}
                  </kbd>
                  <span className="text-[9.5px] text-rail-foreground/55">{h.what}</span>
                </span>
              ))}
            </div>
          )}

          {!editable && departments.length > 0 && (
            <div className="mx-3.5 mt-3 rounded-[10px] border border-rail-foreground/[0.14] bg-rail-foreground/[0.05] px-3 py-2.5 text-[11px] leading-relaxed text-rail-foreground/70">
              Read-only here — no commit seam is wired, so these dials show the lanes and do not
              set them. Turning one would discard what you set the moment you left.
            </div>
          )}

          {/* ── dirty state · nothing takes effect until Commit ─────────── */}
          {editable && changes.length > 0 && (
            <div className="mx-3.5 mt-[11px] flex min-w-0 items-center gap-2.5 rounded-[10px] border border-[hsl(var(--cd-gold)/0.4)] bg-[hsl(var(--cd-gold)/0.12)] px-3 py-2.5">
              <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-cd-gold" />
              <span className="min-w-0 text-[11.5px] leading-[1.4] text-cd-gold-ink">
                {changes.length === 1
                  ? `${lastMoved ?? changes[0].name} moved.`
                  : `${changes.length} departments moved.`}{" "}
                Nothing takes effect until you commit.
              </span>
              <button
                type="button"
                onClick={commit}
                className="ml-auto flex-none whitespace-nowrap rounded-lg bg-cd-gold px-3.5 py-1.5 text-[11.5px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-rail"
              >
                ✓ Commit
              </button>
              <button
                type="button"
                onClick={revert}
                className="flex-none whitespace-nowrap rounded-lg border border-rail-foreground/[0.22] px-[11px] py-1.5 text-[11.5px] text-rail-foreground/85 transition-colors hover:bg-rail-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-rail"
              >
                Revert
              </button>
            </div>
          )}
        </div>

        {/* ── right rail ────────────────────────────────────────────────── */}
        <aside className="hidden w-[290px] flex-none flex-col gap-2.5 overflow-y-auto overflow-x-hidden xl:flex">
          <div className="flex-none rounded-[13px] border-[1.5px] border-border bg-card px-3.5 py-3 shadow-sm">
            <div className="text-[13.5px] font-semibold">Worth raising</div>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {!actions?.length && (
                <div className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Nothing to raise. She reads the compass against what each department has actually
                  done — with no lanes and no action history wired, she has nothing to compare.
                </div>
              )}
              {actions?.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "rounded-[10px] border border-border/60 border-l-[3px] bg-muted/40 px-[11px] py-2.5",
                    a.tone === "act"
                      ? "border-l-[hsl(var(--cd-gold))]"
                      : "border-l-[hsl(var(--success))]",
                  )}
                >
                  <div className="text-[11.5px] leading-[1.5] text-foreground/85">{a.text}</div>
                  {a.onAct && (
                    <button
                      type="button"
                      onClick={a.onAct}
                      className="mt-2 inline-flex rounded-lg bg-cd-gold px-[11px] py-1.5 text-[11px] font-semibold text-[hsl(var(--accent-foreground))] transition-[filter] hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    >
                      {a.cta}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-none rounded-[13px] border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.06)] px-3.5 py-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-[12px] text-[hsl(var(--primary))]">✦</span>
              <div className="text-[12.5px] font-semibold text-[hsl(var(--primary))]">
                Paige&apos;s read
              </div>
            </div>
            <div className="mt-[7px] text-[12px] leading-[1.6] text-foreground/85">
              {read ??
                "She has not read this compass. Her read is a judgement about lanes against what each department did — it needs the lane record and the action history, and neither is wired yet."}
            </div>
            {onAsk && (
              <button
                type="button"
                onClick={onAsk}
                className="mt-2.5 inline-flex rounded-[9px] border border-[hsl(var(--primary)/0.28)] bg-card px-3 py-[7px] text-[11.5px] font-semibold text-[hsl(var(--primary))] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              >
                Ask her about this
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

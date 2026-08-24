import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Knowledge — Claude Design's `isKnow` block (Super Admin Shell.dc.html, L579–656).
 *
 * Her second brain at PLATFORM scope: the layer tiles, the neural-field panel with its
 * overlaid scope caption and corpus meta, the orbit hint, and the 296px right rail (the
 * focused domain, the Domains list, Paige's read).
 *
 * §13 — EVERY ELEMENT HERE ASSERTS A FACT. The pack's own backend note is explicit about it:
 * a mote claims a document exists, a hub claims a domain holds that much, a spike claims a
 * retrieval actually happened. So none of it is drawn from a literal. Domains come from
 * `domains`; a count the corpus feed has not reported renders "—" rather than a plausible
 * number; and with no domains at all the surface says the corpus feed is not connected instead
 * of inventing a shape. CD's note states the same rule for the fallbacks: "it may look inert,
 * it may not look informed when it is not."
 *
 * §9 — PLATFORM SCOPE ONLY. This brain shows doctrine, the skills library, the integration
 * surface, cross-tenant meta-patterns and the support corpus in aggregate. It must never
 * render a mote that represents one tenant's document; a tenant-scoped retrieval is expected
 * to arrive anonymised at the emitter (no doc id, no tenant id) so the panel cannot leak what
 * it was never sent.
 *
 * NOT PORTED IN THIS PASS — the neural field itself. CD drives it from `platform-brain.js`
 * (a WebGL/canvas component with its own retrieval-event feed). `fieldSlot` is the marked
 * mount point; until something is passed, the panel says plainly that the field is not
 * rendered and that retrieval telemetry is not connected, rather than looping a decorative
 * animation that would read as live traffic.
 */

export type KnowledgeDomain = {
  id: string;
  name: string;
  /** What the domain holds, in the caller's words. Never composed here. */
  note: string | null;
  /** Indexed documents. null when the corpus feed reports no count — renders "—". */
  docs: number | null;
  /** Human label for the last index, e.g. "12m ago". null → "—". */
  lastIndexed: string | null;
  /**
   * Server-assigned stable hue (0–360) so a domain keeps its colour across sessions and
   * operators, per the corpus-snapshot contract. null → the domain reads neutral.
   */
  hue: number | null;
  /** True when the domain is past its freshness window: it reads stale, never green. */
  stale?: boolean;
};

/** A layer tile — the caller supplies the value or the tile shows "—". */
export type KnowledgeLayer = { id: string; label: string; value: string | null; note: string };

export type KnowledgeSurfaceProps = {
  domains: readonly KnowledgeDomain[];
  /** CD ships the layer strip switched OFF. Pass tiles only when each value is real. */
  layers?: readonly KnowledgeLayer[];
  loading?: boolean;
  error?: string | null;
  /** The neural field. Absent → the panel says the field is not rendered (see above). */
  fieldSlot?: ReactNode;
  /** True only when the retrieval broadcast is actually attached. */
  retrievalConnected?: boolean;
  /** Paige's read of the corpus. Absent → the card says she has not read it. */
  read?: string | null;
};

const nf = new Intl.NumberFormat();

/** CD renders a coloured initials plate per domain; derive it rather than store it. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * A domain's hue is DATA (assigned server-side, stable per domain), not a design choice, so it
 * is read from the row and expressed through a CSS variable. With no hue the domain falls back
 * to a token — never to an invented colour that would imply a classification we do not have.
 */
function tone(d: KnowledgeDomain): string {
  return d.hue == null ? "hsl(var(--muted-foreground))" : `hsl(${d.hue} 52% 52%)`;
}

export default function KnowledgeSurface({
  domains,
  layers,
  loading = false,
  error = null,
  fieldSlot,
  retrievalConnected = false,
  read = null,
}: KnowledgeSurfaceProps) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const focus = useMemo(() => domains.find((d) => d.id === focusId) ?? null, [domains, focusId]);

  /**
   * CD's meta line is "3,850 documents · 8 domains · indexed continuously". Ours states only
   * what the rows support: a total is printed only when every domain reported a count, and
   * "indexed continuously" is a claim about an indexer, so it is not made here.
   */
  const meta = useMemo(() => {
    if (loading) return "Reading the corpus…";
    if (error) return "The corpus could not be read.";
    if (!domains.length) return "No corpus snapshot";
    const counted = domains.filter((d) => d.docs != null);
    const domainPart = `${domains.length} ${domains.length === 1 ? "domain" : "domains"}`;
    if (counted.length !== domains.length) return `${domainPart} · document count not reported`;
    const total = counted.reduce((n, d) => n + (d.docs ?? 0), 0);
    return `${nf.format(total)} documents · ${domainPart}`;
  }, [domains, loading, error]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* ── title ───────────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-none">
        <div className="flex items-center gap-2.5">
          <span className="text-[9.5px] font-semibold tracking-[0.15em] text-muted-foreground">
            WHAT SHE KNOWS
          </span>
          <span className="text-[21px] font-bold tracking-[-0.02em]">Knowledge</span>
        </div>
        <div className="mt-1.5 text-[12.5px] text-muted-foreground">
          Her second brain for the whole machine — every domain she has read, every specialist she
          routes to, and what she has learned since.
        </div>
      </div>

      {/* ── layer tiles · CD ships these switched off; they render only when passed ── */}
      {!!layers?.length && (
        <div className="grid flex-none grid-cols-2 gap-2.5 lg:grid-cols-4">
          {layers.map((l) => (
            <div
              key={l.id}
              title={l.note}
              className="min-w-0 rounded-[11px] border border-border bg-card px-[11px] py-2.5"
            >
              <div className="flex min-w-0 items-center gap-[7px]">
                <span aria-hidden className="h-[7px] w-[7px] flex-none rounded-full bg-[hsl(var(--primary))]" />
                <span className="truncate whitespace-nowrap text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
                  {l.label}
                </span>
              </div>
              <div className="mt-[3px] text-[17px] font-bold tabular-nums tracking-[-0.02em]">
                {l.value ?? "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3.5">
        {/* ── the field ─────────────────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-[15px] bg-rail shadow-[shadow:0_16px_36px_hsl(var(--shadow-ink)/0.3)]">
            {/*
              NEURAL-FIELD SLOT — CD's `platform-brain.js` mounts here. Deliberately not ported
              in this pass; nothing decorative stands in for it (§13).
            */}
            {fieldSlot ? (
              <div className="absolute inset-0 overflow-hidden">{fieldSlot}</div>
            ) : (
              <div className="absolute inset-0 grid place-items-center px-6 pb-6 pt-24">
                <div className="max-w-md text-center">
                  <div className="text-[13px] font-semibold text-rail-foreground">
                    The field is not rendered here yet.
                  </div>
                  <div className="mt-1.5 text-[11.5px] leading-relaxed text-rail-foreground/70">
                    Every mote, fibre and spike in this panel asserts something factual — a
                    document, a semantic neighbour, a retrieval that actually happened. It is left
                    dark until it is drawn from the corpus snapshot and the retrieval feed rather
                    than from a loop.
                    {!retrievalConnected && " Retrieval telemetry is not connected."}
                  </div>
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 top-0 px-[17px] py-[15px]">
              <div className="text-[9px] font-semibold tracking-[0.16em] text-rail-foreground/[0.54]">
                HER SECOND BRAIN · PLATFORM SCOPE
              </div>
              <div className="mt-1.5 font-mono text-[10.5px] text-rail-foreground/[0.46]">{meta}</div>
            </div>
          </div>
          <div className="mt-[7px] flex-none text-[10.5px] text-muted-foreground">
            {fieldSlot
              ? "Drag to orbit · scroll to zoom · click a hub to isolate its region"
              : "Pick a domain in the list to isolate it — the orbit controls arrive with the field."}
          </div>
        </div>

        {/* ── right rail ────────────────────────────────────────────────── */}
        <aside className="hidden w-[296px] flex-none flex-col gap-2.5 overflow-y-auto overflow-x-hidden xl:flex">
          {focus && (
            <div
              className="flex-none rounded-[13px] border border-border border-l-[3px] bg-card px-3.5 py-3"
              style={{ borderLeftColor: tone(focus) }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="min-w-0 truncate whitespace-nowrap text-[13.5px] font-semibold">
                  {focus.name}
                </span>
                <button
                  type="button"
                  onClick={() => setFocusId(null)}
                  className="ml-auto flex-none rounded text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                >
                  clear
                </button>
              </div>
              <div className="mt-1.5 text-[11.5px] leading-[1.45] text-muted-foreground">
                {focus.note ?? "No description recorded for this domain."}
              </div>
              <div className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">
                {focus.docs == null ? "— documents" : `${nf.format(focus.docs)} documents`} · indexed{" "}
                {focus.lastIndexed ?? "—"}
                {focus.stale ? " · stale" : ""}
              </div>
            </div>
          )}

          <div className="flex-none overflow-hidden rounded-[13px] border-[1.5px] border-border bg-card shadow-sm">
            <div className="px-[15px] pb-2 pt-3 text-[13.5px] font-semibold">Domains</div>

            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 border-t border-border/60 px-[15px] py-2.5">
                  <span className="h-[26px] w-[26px] flex-none animate-pulse rounded-lg bg-muted" />
                  <span className="h-3 w-32 animate-pulse rounded bg-muted" />
                </div>
              ))}

            {!loading && error && (
              <div className="border-t border-border/60 px-[15px] py-6 text-center">
                <div className="text-[12px] font-semibold">The corpus could not be read.</div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{error}</div>
              </div>
            )}

            {!loading && !error && domains.length === 0 && (
              <div className="border-t border-border/60 px-[15px] py-6 text-center">
                <div className="text-[12px] font-semibold">Not connected to its backend yet.</div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  The corpus snapshot — the domains she has indexed, their sizes and when each was
                  last read — is not wired. No domain list is shown rather than a made-up one.
                </div>
              </div>
            )}

            {!loading &&
              !error &&
              domains.map((d) => {
                const on = d.id === focusId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFocusId(on ? null : d.id)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-2.5 overflow-hidden border-t border-border/60 px-[15px] py-2.5 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]",
                      on ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <span
                      aria-hidden
                      className="grid h-[26px] w-[26px] flex-none place-items-center rounded-lg bg-muted text-[9.5px] font-bold text-foreground/70"
                      style={{ boxShadow: `inset 0 0 0 2px ${tone(d)}` }}
                    >
                      {initials(d.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate whitespace-nowrap text-[12px] font-semibold">
                        {d.name}
                      </span>
                      <span className="mt-0.5 block truncate whitespace-nowrap text-[10px] text-muted-foreground">
                        {d.note ?? "—"}
                      </span>
                    </span>
                    <span className="flex-none text-right">
                      <span className="block font-mono text-[10.5px] tabular-nums text-foreground/75">
                        {d.docs == null ? "—" : `${nf.format(d.docs)} docs`}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[9.5px]",
                          d.stale ? "text-[hsl(var(--warning))]" : "text-muted-foreground",
                        )}
                      >
                        {d.lastIndexed ?? "—"}
                      </span>
                    </span>
                  </button>
                );
              })}
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
                "She has not read this corpus. Which domain she leans on, and which is going stale, comes from retrieval history — that feed is not connected yet."}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

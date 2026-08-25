import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { viewPath } from "@/operator/shell/operatorAddress";

/**
 * Campaigns · Social — authoritative v3 source:
 * `docs/design-references/cd-packs/super-admin-shell-v3/PAIGE Super Admin Shell v3.dc.html`
 * markup 1331–1395 · builder `socialVals` 7431–7567 (ROUTE-MAP.md 35).
 * Contract taxonomy: `paige-ia.js` 1187–1238.
 *
 * The six channel lanes, seven-day axis, tape, grant rail, legend, and Integrations handoff
 * port verbatim. Handles, owners, schedules, grants, post bodies, dates, and spend in the pack
 * are reference fixtures: none ship. Until a social read exists they remain honest em-dashes.
 */

const GRID = "minmax(132px,168px) repeat(7,minmax(0,1fr))";

const CHANNELS = [
  { name: "LinkedIn", glyph: "M3.4 6.2v7.4 M3.4 3.4v.02 M6.8 13.6V6.2 M6.8 9.2a2.8 2.8 0 0 1 5.6 0v4.4" },
  { name: "X", glyph: "M3.2 3.2l9.6 9.6 M12.8 3.2L3.2 12.8" },
  { name: "Instagram", glyph: "M3.2 3.2h9.6v9.6H3.2z M6.2 8a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0 M10.8 5.2v.02" },
  { name: "Facebook", glyph: "M9.6 13.6V8.8h2.2l.4-2.6H9.6V4.8c0-.8.3-1.3 1.4-1.3h1.3V1.2a18 18 0 0 0-2-.1c-2 0-3.3 1.2-3.3 3.4v1.7H4.6v2.6h2.4v4.8z" },
  { name: "YouTube", glyph: "M2 5.4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5.2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M6.8 6.2l3 1.8-3 1.8z" },
  { name: "TikTok", glyph: "M9.4 2.4v6.8a2.4 2.4 0 1 1-2.4-2.4 M9.4 4.6a3.2 3.2 0 0 0 3.2 2.4" },
] as const;

const MARKS = [
  { label: "Post", note: "A point in time", kind: "post" },
  { label: "Reply", note: "She answered a mention", kind: "reply" },
  { label: "Story", note: "Expires on its own", kind: "story" },
  { label: "Ad flight", note: "A duration, and money", kind: "ad" },
] as const;

function weekAxis(now = new Date()) {
  const monday = new Date(now);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(monday);
    value.setDate(monday.getDate() + index);
    return {
      d: value.toLocaleDateString(undefined, { weekday: "short" }),
      n: String(value.getDate()),
      today: value.toDateString() === now.toDateString(),
    };
  });
}

export default function SocialSurface() {
  const navigate = useNavigate();
  const days = useMemo(() => weekAxis(), []);
  const openIntegrations = () => navigate(viewPath("settings", "Integrations"));

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col pb-0.5" aria-labelledby="social-spine-title">
      <h2 id="social-spine-title" className="sr-only">Social publishing spine</h2>

      <div className="flex flex-none flex-wrap items-baseline gap-x-4 gap-y-1 pb-[9px]">
        {[
          "accounts connected",
          "scheduled this week",
          "drafted, awaiting your word",
          "ad flights held",
          "spend",
        ].map((label) => (
          <span key={label} className="flex items-baseline gap-[7px]">
            <b className="font-mono text-[14px] font-medium tracking-[-0.01em] text-[var(--pg-faint)]">—</b>
            <small className="whitespace-nowrap text-[11px] text-[var(--pg-faint)]">{label}</small>
          </span>
        ))}
        <button
          type="button"
          onClick={openIntegrations}
          className="ml-auto min-h-[30px] flex-none whitespace-nowrap rounded-[var(--pg-r-chip)] border border-[var(--pg-line)] bg-[var(--pg-surface)] px-[13px] text-[11.5px] font-medium text-[var(--pg-ink-2)]"
        >
          Connect an account
        </button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-t border-[var(--pg-line)] [scrollbar-gutter:stable]">
        <div
          className="grid min-h-[34px] items-end border-b border-[var(--pg-line-soft)] pb-1.5"
          style={{ gridTemplateColumns: GRID }}
        >
          <small className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--pg-faint)]">Channel</small>
          {days.map((day) => (
            <span
              key={`${day.d}-${day.n}`}
              className="flex min-w-0 flex-col items-center gap-px"
              style={{ boxShadow: day.today ? "inset 1px 0 0 var(--pg-gold)" : "none" }}
            >
              <small
                className="font-mono text-[9.5px] tracking-[0.05em]"
                style={{ color: day.today ? "var(--pg-gold-deep)" : "var(--pg-faint)" }}
              >
                {day.d}
              </small>
              <b
                className="font-mono text-[12px]"
                style={{
                  color: day.today ? "var(--pg-gold-deep)" : "var(--pg-muted)",
                  fontWeight: day.today ? 600 : 400,
                }}
              >
                {day.n}
              </b>
            </span>
          ))}
        </div>

        {CHANNELS.map((channel) => (
          <div
            key={channel.name}
            className="grid min-h-[52px] min-w-0 items-stretch border-b border-[var(--pg-line-soft)] opacity-[0.58]"
            style={{ gridTemplateColumns: GRID }}
          >
            <button
              type="button"
              onClick={openIntegrations}
              className="flex min-w-0 items-center gap-[9px] border-0 bg-transparent py-0 pr-3 text-left"
              aria-label={`Connect ${channel.name} in Integrations`}
            >
              <span
                className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[var(--pg-r-chip)] text-[var(--pg-faint)]"
                style={{ boxShadow: "inset 0 0 0 1px var(--pg-line)" }}
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d={channel.glyph} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5 text-left">
                <b className="truncate text-[12px] font-medium text-[var(--pg-faint)]">{channel.name}</b>
                <small className="truncate font-mono text-[9.5px] text-[var(--pg-faint)]">— · —</small>
              </span>
              <i className="my-[9px] ml-auto w-[3px] self-stretch bg-transparent" title="Not connected" />
            </button>

            <div className="relative col-[2/-1] min-w-0">
              {days.map((day, index) => (
                <i
                  key={`${channel.name}-${day.d}`}
                  className="absolute bottom-0 top-0 w-px"
                  style={{
                    left: `${(index / 7) * 100}%`,
                    background: day.today ? "var(--pg-gold)" : "var(--pg-line-soft)",
                    opacity: day.today ? 0.55 : 1,
                  }}
                />
              ))}
              <button
                type="button"
                onClick={openIntegrations}
                className="absolute left-1.5 top-[15px] min-h-[22px] border-0 bg-transparent px-2 text-left text-[10.5px] text-[var(--pg-faint)]"
              >
                Connect {channel.name} to publish here
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-[9px] flex flex-none flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-[var(--pg-line-soft)] pt-[9px]">
        {MARKS.map((mark) => (
          <span key={mark.kind} className="flex items-center gap-[5px]">
            <i
              className={mark.kind === "ad" ? "h-[9px] w-4 rounded-[2px] bg-[var(--pg-lift)]" : "h-[7px] w-[7px] rotate-45"}
              style={{
                width: mark.kind === "reply" ? 5 : undefined,
                height: mark.kind === "reply" ? 5 : undefined,
                background: mark.kind === "story" ? "transparent" : mark.kind === "ad" ? undefined : "var(--pg-positive)",
                outline: mark.kind === "story" ? "1px solid var(--pg-positive)" : undefined,
                boxShadow: mark.kind === "ad" ? "inset 0 0 0 1px var(--pg-warning)" : undefined,
              }}
            />
            <small title={mark.note} className="text-[10px] font-medium text-[var(--pg-ink-2)]">{mark.label}</small>
          </span>
        ))}
        <small className="min-w-[120px] flex-1 text-[10.5px] leading-[1.4] text-[var(--pg-faint)]">
          Representative — no social API is wired, so nothing here has been posted. Connections are made in Integrations; performance is read in Performance.
        </small>
      </div>
    </section>
  );
}

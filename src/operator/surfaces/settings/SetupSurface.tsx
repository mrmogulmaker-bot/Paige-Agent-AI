import { useMemo, useState } from "react";
import {
  SETUP_ABSENCE,
  SETUP_DROPS,
  SETUP_FIELDS,
  SETUP_GROUPS,
  SETUP_PICKS,
  SETUP_RAIL_TITLE,
  SETUP_STATE_TONE,
  SETUP_STEPS,
  setupKicker,
  setupLands,
  setupWhy,
  type SetupState,
  type SetupStep,
} from "@/operator/surfaces/settings/setupContract";

/**
 * `settings · Setup` — v3 `setupVals` L8915–L9086, markup L2085–L2175. BUILD-ORDER Layer 3d.
 *
 * The shape is CD's: a progress bar and the two strip controls over a two-column body — the
 * current step on the left, everything else as a grouped rail on the right that collapses below
 * 720px. Sources, and the line-by-line account of what is authored versus read, live in
 * `setupContract.ts`.
 *
 * THE STEP YOU ARE ON IS LOCAL STATE AND THAT IS CORRECT. Which step the rail has selected is
 * chrome — it belongs to this session's browsing, not to the account — so it is `useState` here
 * and needs no read. Everything that describes the ACCOUNT (what is done, what is left, what she
 * could finish) is a read, and today there is none: the bar sits at zero, the figures are
 * em-dashes inside CD's authored sentences, and no step claims a state it cannot prove.
 *
 * EVERY WRITE IS DISABLED UNTIL A SEAM EXISTS. `setupVals`'s acts say "saved" and "It lands in
 * the Vault" — claims about persistence. Rendering them live over local state would say a thing
 * that did not happen (§13), so each carries CD's exact label and title and is `disabled` without
 * a handler. The inputs are the same: they render, they take a keystroke so the surface is not
 * dead under the cursor, and nothing claims that keystroke was kept.
 */
export default function SetupSurface({
  states = {},
  onSaveStep,
  onLetHerDoIt,
  onSkipStep,
  onAskAboutStep,
  onDoAllHers,
  onTour,
  onAnnounce,
}: {
  /** Step id → state. The read that fills this in is Layer 6; today it is empty. */
  readonly states?: Readonly<Record<string, SetupState>>;
  readonly onSaveStep?: (step: SetupStep) => void;
  readonly onLetHerDoIt?: (step: SetupStep) => void;
  readonly onSkipStep?: (step: SetupStep) => void;
  readonly onAskAboutStep?: (step: SetupStep) => void;
  readonly onDoAllHers?: () => void;
  readonly onTour?: () => void;
  readonly onAnnounce?: (message: string) => void;
}) {
  const [stepId, setStepId] = useState<string>(SETUP_STEPS[0].id);
  /** Field/pick drafts. Local by construction — see the docblock; nothing here is persisted. */
  const [draft, setDraft] = useState<Readonly<Record<string, string>>>({});

  const read = Object.keys(states).length > 0;
  const cur = useMemo(
    () => SETUP_STEPS.find((s) => s.id === stepId) ?? SETUP_STEPS[0],
    [stepId],
  );
  const curState: SetupState | null = states[cur.id] ?? null;

  const done = read ? SETUP_STEPS.filter((s) => states[s.id] === "done").length : null;
  const left = read ? SETUP_STEPS.filter((s) => states[s.id] === "needs").length : null;
  const waiting = read ? SETUP_STEPS.filter((s) => states[s.id] === "blocked").length : null;
  const hers = read
    ? SETUP_STEPS.filter((s) => states[s.id] === "needs" && s.who === "PAIGE").length
    : 0;
  const pct = done === null ? 0 : Math.round((done / SETUP_STEPS.length) * 100);

  const fields = SETUP_FIELDS[cur.name] ?? [];
  const picks = SETUP_PICKS[cur.name] ?? [];
  const drop = SETUP_DROPS[cur.name];

  /**
   * `acts` — L8988–L9007. Which arm shows is decided by the step's state and its owner, exactly
   * as CD writes it. With no state read the step is neither blocked nor hers-to-do, so the
   * ordinary Save arm renders — the same arm a `needs` step owned by you would get.
   */
  const acts: readonly {
    key: string;
    label: string;
    title: string;
    gold?: boolean;
    onClick?: () => void;
  }[] = [
    ...(curState === "blocked"
      ? [{ key: "unblock", label: "What unblocks it", gold: true,
          title: cur.why ?? "It waits on something we have not built.",
          onClick: onAnnounce
            ? () => onAnnounce(cur.why ?? "It waits on something we have not built.")
            : undefined }]
      : cur.who === "PAIGE"
        ? [
            { key: "hers", label: "Let her do it", gold: true,
              title: `She does it, and it lands in ${cur.lands.toLowerCase()}.`,
              onClick: onLetHerDoIt ? () => onLetHerDoIt(cur) : undefined },
            { key: "mine", label: "I will do it", title: "Fill it in above and save.",
              onClick: onAnnounce ? () => onAnnounce("Fill it in above and save.") : undefined },
          ]
        : [
            { key: "save", label: "Save", gold: true,
              title: `It lands in ${cur.lands.toLowerCase()}.`,
              onClick: onSaveStep ? () => onSaveStep(cur) : undefined },
            { key: "ask", label: "Ask her about it",
              title: "She explains what it changes.",
              onClick: onAskAboutStep ? () => onAskAboutStep(cur) : undefined },
          ]),
    { key: "skip", label: "Not needed", title: "She will stop asking.",
      onClick: onSkipStep ? () => onSkipStep(cur) : undefined },
  ];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* STRIP · L2087–L2093. Bar, figure, sentence, and the two controls. */}
      <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-[var(--pg-line)] pb-[13px]">
        <span className="block h-1 w-24 flex-none overflow-hidden rounded-[var(--pg-r-pill)] bg-[var(--pg-line)]">
          <i className="block h-full bg-[var(--pg-gold)]" style={{ width: `${pct}%` }} />
        </span>
        <b className="flex-none text-[12.5px] font-medium">
          {done === null ? SETUP_ABSENCE.pct : `${pct}% set up`}
        </b>
        <small className="min-w-0 text-[11.5px] text-[var(--pg-muted)] [text-wrap:pretty]">
          {done === null
            ? SETUP_ABSENCE.line
            : `${done} done · ${left} left · ${waiting} waiting on something we have not built`}
        </small>
        <button
          type="button"
          onClick={onTour}
          disabled={!onTour}
          className="ml-auto min-h-[30px] flex-none whitespace-nowrap rounded-[var(--pg-r-pill)] border border-[var(--pg-line)] bg-transparent px-3 text-[11.5px] font-medium text-[var(--pg-muted)] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Show me around
        </button>
        {/* `setDoAllStyle` — gold ONLY when she genuinely has something outstanding (§11). */}
        <button
          type="button"
          onClick={onDoAllHers}
          disabled={!onDoAllHers || hers === 0}
          className="min-h-[30px] flex-none whitespace-nowrap rounded-[var(--pg-r-pill)] border px-[13px] text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{
            borderColor: hers ? "var(--pg-gold)" : "var(--pg-line)",
            background: hers ? "var(--pg-gold)" : "transparent",
            color: hers ? "#17120c" : "var(--pg-faint)",
          }}
        >
          {hers ? `She can finish ${hers} now` : SETUP_ABSENCE.doAll}
        </button>
      </div>

      {/* BODY · L2095. One column below 720px — the rail is the thing that goes. */}
      <div className="grid min-h-0 min-w-0 flex-1 gap-[18px] [grid-template-columns:minmax(0,1fr)] lg:[grid-template-columns:minmax(0,1fr)_minmax(212px,262px)]">
        <div className="min-h-0 min-w-0 overflow-auto py-4 pl-0 pr-[18px]">
          <small className="block text-[11px] font-medium text-[var(--pg-gold-deep)]">
            {setupKicker(
              SETUP_GROUPS.find((g) => g.items.some((i) => i.id === cur.id))?.g ?? "",
              cur.who,
            )}
          </small>
          <h3 className="mt-[7px] max-w-[22ch] font-[var(--pg-font-editorial)] text-[24px] font-normal leading-[1.16] tracking-[-0.01em] [text-wrap:balance]">
            {cur.name}
          </h3>
          <p className="mt-2.5 max-w-[46ch] font-[var(--pg-font-editorial)] text-[14px] leading-[1.6] text-[var(--pg-ink-2)] [text-wrap:pretty]">
            {setupWhy(cur)}
          </p>

          {/* `stHasCost` — L2101, shown only for a blocked step. */}
          {curState === "blocked" && (
            <p className="mt-[11px] flex max-w-[44ch] items-start gap-2">
              <i
                aria-hidden
                className="mt-[5px] h-[5px] w-[5px] flex-none bg-[var(--pg-warning)]"
                style={{ rotate: "45deg" }}
              />
              <small className="min-w-0 text-[11.5px] leading-[1.5] text-[var(--pg-warning)] [text-wrap:pretty]">
                {cur.why ?? "It waits on substrate that does not exist yet."}
              </small>
            </p>
          )}

          {fields.length > 0 && (
            <div className="mt-4">
              {fields.map(([label, hint]) => (
                <label key={label} className="mb-2.5 block">
                  <small className="block font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--pg-faint)]">
                    {label}
                  </small>
                  <input
                    value={draft[`${cur.name}·${label}`] ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [`${cur.name}·${label}`]: e.target.value }))
                    }
                    placeholder={hint}
                    className="mt-1.5 h-9 w-full min-w-0 rounded-[var(--pg-r-chip)] border border-[var(--pg-line)] bg-[var(--pg-canvas)] px-[11px] text-[13px] text-[var(--pg-ink)] placeholder:text-[var(--pg-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              ))}
            </div>
          )}

          {picks.length > 0 && (
            <div className="mt-[15px] flex flex-wrap gap-1.5">
              {picks.map((p) => {
                const on = draft[cur.name] === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, [cur.name]: p }))}
                    aria-pressed={on}
                    className="min-h-8 flex-none whitespace-nowrap rounded-[var(--pg-r-pill)] border px-3 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{
                      borderColor: on ? "var(--pg-gold)" : "var(--pg-line)",
                      background: on ? "var(--pg-lift)" : "transparent",
                      color: on ? "var(--pg-ink)" : "var(--pg-muted)",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          )}

          {drop && (
            <button
              type="button"
              disabled
              title="Filing needs a write seam — nothing is uploaded yet."
              className="mt-4 flex w-full min-w-0 flex-col rounded-[var(--pg-r-plate)] border border-dashed border-[var(--pg-line-strong)] bg-transparent px-[15px] py-4 text-left text-[var(--pg-ink)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <b className="text-[12.5px] font-medium">Drop a file, or click to choose</b>
              <small className="mt-[3px] text-[11px] text-[var(--pg-faint)] [text-wrap:pretty]">
                {drop}
              </small>
            </button>
          )}

          <div className="mt-[18px] flex flex-wrap gap-[7px]">
            {acts.map((a) => (
              <button
                key={a.key}
                type="button"
                title={a.title}
                onClick={a.onClick}
                disabled={!a.onClick}
                className="min-h-9 flex-none whitespace-nowrap rounded-[var(--pg-r-chip)] border px-[15px] text-[12.5px] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  borderColor: a.gold ? "var(--pg-gold)" : "var(--pg-line)",
                  background: a.gold ? "var(--pg-gold)" : "transparent",
                  color: a.gold ? "#17120c" : "var(--pg-muted)",
                  fontWeight: a.gold ? 600 : 500,
                }}
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* `stLands` — L2141. Where the answer goes, which is what stops a step being a form. */}
          <div className="mt-4 flex flex-wrap gap-x-[14px] gap-y-[5px] border-t border-[var(--pg-line-soft)] pt-[13px]">
            {setupLands(cur.lands).map((l) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <i
                  aria-hidden
                  className="h-1 w-1 flex-none bg-[var(--pg-gold-deep)]"
                  style={{ rotate: "45deg" }}
                />
                <small className="whitespace-nowrap text-[10.5px] text-[var(--pg-muted)]">{l}</small>
              </span>
            ))}
          </div>
        </div>

        {/* RAIL · L2153. Every step, grouped, with its state mark. */}
        <div className="hidden min-h-0 min-w-0 flex-col border-l border-[var(--pg-line-soft)] pl-[18px] lg:flex">
          <div className="flex flex-none items-baseline gap-2 pb-[9px]">
            <b className="text-[11.5px] font-medium">{SETUP_RAIL_TITLE}</b>
            <small className="ml-auto font-mono text-[10px] text-[var(--pg-faint)]">
              {done === null ? SETUP_ABSENCE.railMeta : `${done} / ${SETUP_STEPS.length}`}
            </small>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {SETUP_GROUPS.map((g) => (
              <div key={g.g} className="pb-[9px]">
                <small className="block px-0 pb-[5px] pt-[7px] font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--pg-faint)]">
                  {g.g}
                </small>
                {g.items.map((i) => {
                  const st = states[i.id] ?? null;
                  const here = i.id === cur.id;
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => setStepId(i.id)}
                      aria-current={here}
                      className="flex min-h-7 w-full min-w-0 items-center gap-2 rounded-[var(--pg-r-chip)] border-0 py-0 pl-0.5 pr-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{
                        background: here ? "var(--pg-lift)" : "transparent",
                        color: st === "done" ? "var(--pg-faint)" : "var(--pg-ink-2)",
                      }}
                    >
                      {/* No state read → the mark is the neutral one, never a green tick. */}
                      <i
                        aria-hidden
                        className="h-[5px] w-[5px] flex-none"
                        style={{
                          rotate: "45deg",
                          background: st ? SETUP_STATE_TONE[st] : "var(--pg-line-strong)",
                        }}
                      />
                      <span
                        className="min-w-0 truncate text-[11.5px]"
                        style={{ fontWeight: here ? 600 : 400 }}
                      >
                        {i.name}
                      </span>
                      {st !== "done" && i.who === "PAIGE" && (
                        <small className="flex-none text-[9.5px] text-[var(--pg-gold-deep)]">her</small>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

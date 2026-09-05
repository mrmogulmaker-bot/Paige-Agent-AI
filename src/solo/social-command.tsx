// @ts-nocheck
/**
 * Campaigns › Social — the Social Command surface.
 *
 * WHAT THIS SURFACE IS FOR. One question, answered in the first few seconds: what is on record for
 * this business socially, and what is not. It is not a scheduler and it is not a placements report,
 * because the platform holds neither for a tenant — and the layout says which of those it is
 * missing rather than leaving a plausible-looking zero where a number would go.
 *
 * THE RULE THIS FILE IS BUILT AROUND. Every figure comes from `social-truth.ts`, where its source
 * and its state were decided in a function a test can call. Nothing is computed inline here, and
 * nothing has a fallback: a module with no source renders its absence and says which record would
 * have to exist. `src/solo/compass.tsx:8-38` is the standing account of what happens when a
 * dashboard of exactly this shape is allowed to fill its own gaps.
 *
 * WHAT SURVIVES FROM THE PANEL THIS REPLACES (§58). The five non-inferences it made out loud — no
 * accounts, followers, publishing queue, schedules or placements are inferred — are each still made,
 * now attached to the specific tile that would otherwise imply one. Its Vibe Studio redirect and its
 * "placements are recorded by a provider" precondition are both kept.
 *
 * WHAT IS NEW. An owner can RECORD the accounts their business posts from, here, and that write is
 * the first one `tenants.features->social_handles` has ever had. Systems Check #3 points at this
 * page; until this slice it pointed at a page that could not finish the job.
 */
import React from "react";
import { Ic } from "./_shared";
import { useSocialCommand } from "./useSocialCommand";
import { useSoloPendingActions } from "./data/useSoloPendingActions";
// useSoloTrust directly rather than compass.tsx's useTrustDepartments: the compass module pulls the
// whole Trust Compass surface into the Campaigns bundle for two lane labels, and this is the same
// underlying read either way.
import { useSoloTrust } from "./data/useSoloTrust";
import {
  SOCIAL_NETWORKS,
  buildBrief,
  buildChannels,
  buildKpis,
  buildPipeline,
  isGrowthDesk,
  LANE_COPY,
  toHandlePayload,
} from "./social-truth";
import "./social-command.css";

/* ─────────────────────────── shared atoms ─────────────────────────── */

function Truth({ state }) {
  const label = state || "UNAVAILABLE";
  return <span className={`social-truth social-truth--${label.toLowerCase()}`}>{label}</span>;
}

/** A figure, or the honest mark that stands in for one. Never a zero pretending to be a count. */
function Figure({ value }) {
  return value === null || value === undefined
    ? <span className="social-figure social-figure--absent" aria-label="No figure available">&mdash;</span>
    : <span className="social-figure mono">{value}</span>;
}

/**
 * The PAIGE mark, drawn as an intelligence presence rather than a decoration.
 *
 * Built from tokens only — there is no orb token in the Solo shell (the pack's `--cm-orb` family is
 * `--pg-*`-derived and resolves to nothing under `.paige-solo`). The ring rotates ONLY where motion
 * is safe; `prefers-reduced-motion` stops it in the stylesheet rather than hiding it, because the
 * mark still has to read as the mark when it is still.
 */
function PaigeOrb() {
  return (
    <div className="social-orb" aria-hidden="true">
      <span className="social-orb-halo" />
      <span className="social-orb-body" />
      <span className="social-orb-ring" />
      <svg className="social-orb-mark" viewBox="0 0 32 32" fill="none" width="34" height="34">
        <ellipse cx="16" cy="16" rx="8.4" ry="8.4" stroke="var(--gold-bright)" strokeWidth="2.1" />
        <ellipse cx="16" cy="16" rx="14.5" ry="5.4" transform="rotate(-22 16 16)" stroke="var(--gold-bright)" strokeWidth="1.7" opacity=".8" />
        <circle cx="16" cy="16" r="3.1" fill="var(--gold-bright)" />
      </svg>
    </div>
  );
}

/* ─────────────────────────── the record form ─────────────────────────── */

/**
 * The one thing a person can COMPLETE on this surface.
 *
 * It sends the COMPLETE set rather than a patch, and says so: an omitted network is cleared. A
 * partial write would make "remove the account I no longer use" inexpressible, and the Systems
 * Check counts keys — so an undeletable handle would keep a check passing for an account that no
 * longer exists.
 */
function RecordAccountsForm({ handles, canManage, onSave, onClose }) {
  const initial = React.useMemo(() => {
    const seed = {};
    for (const network of SOCIAL_NETWORKS) {
      seed[network.key] = handles.find((h) => h.network === network.key)?.handle ?? "";
    }
    return seed;
  }, [handles]);
  const [draft, setDraft] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const firstField = React.useRef(null);
  const dialog = React.useRef(null);

  React.useEffect(() => { setDraft(initial); }, [initial]);
  React.useEffect(() => {
    firstField.current?.focus({ preventScroll: true });
    const onKey = (event) => { if (event.key === "Escape" && !saving) { event.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canManage || saving) return;
    setSaving(true);
    setMessage("");
    const result = await onSave(toHandlePayload(draft));
    setSaving(false);
    if (result.ok) {
      // Reports the count the SERVER read back, not the length of what was typed.
      setMessage(
        result.recordedCount === 0
          ? "Saved. No account is on record for this workspace now."
          : `Saved. ${result.recordedCount} account${result.recordedCount === 1 ? "" : "s"} on record.`,
      );
      window.setTimeout(onClose, 900);
      return;
    }
    setMessage(result.message);
  };

  return (
    <>
      <div className="social-scrim" onClick={() => !saving && onClose()} />
      <div className="social-dialog" role="dialog" aria-modal="true" aria-labelledby="social-record-title" ref={dialog}>
        <header>
          <div>
            <span className="social-eyebrow">Campaigns · Social</span>
            <h2 id="social-record-title">The accounts this business posts from</h2>
          </div>
          <button type="button" className="btn btn-s" onClick={onClose} disabled={saving}>
            <Ic.x size={13} />Close
          </button>
        </header>
        <form onSubmit={submit}>
          <p className="social-dialog-note">
            This records what your accounts <strong>are</strong>. It does not connect them: nothing is
            authorised to publish, schedule, or read a follower or engagement figure. Leave a field
            empty to take that account off the record.
          </p>
          <div className="social-dialog-fields">
            {SOCIAL_NETWORKS.map((network, index) => (
              <label key={network.key}>
                <span>{network.label}</span>
                <input
                  ref={index === 0 ? firstField : undefined}
                  type="text"
                  value={draft[network.key] ?? ""}
                  placeholder={network.hint}
                  maxLength={120}
                  disabled={!canManage || saving}
                  onChange={(event) => setDraft({ ...draft, [network.key]: event.target.value })}
                />
              </label>
            ))}
          </div>
          {!canManage && (
            <p className="social-dialog-status" role="status">
              You have read-only access here. An owner or admin of this workspace can record these.
            </p>
          )}
          {message && <p className="social-dialog-status" role="status">{message}</p>}
          <div className="social-dialog-actions">
            <button type="button" className="btn btn-s" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-s btn-g" disabled={!canManage || saving}>
              <Ic.check size={13} />{saving ? "Saving…" : "Save to record"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ─────────────────────────── hero ─────────────────────────── */

function SocialHero({ brief, kpis, onRecord, onAskPaige, canManage, hasHandles }) {
  return (
    <header className="social-hero">
      <div className="social-hero-top">
      <div className="social-hero-brief">
        <span className="social-eyebrow">Social command</span>
        <h2 className="social-headline">{brief.headline}</h2>
        <p className="social-hero-body">{brief.body}</p>
        <p className="social-signature">
          <strong>PAIGE</strong>
          <span>Reporting only what this workspace has on record</span>
        </p>
      </div>

      <div className="social-hero-mark">
        <PaigeOrb />
        <blockquote className="social-quote">
          A record you can point to<br />beats a number nobody can source.
        </blockquote>
      </div>

      <div className="social-hero-act">
        <div className="social-hero-actions">
          <button type="button" className="btn btn-s" onClick={onAskPaige}>
            <Ic.spark size={13} />Ask PAIGE
          </button>
          <button type="button" className="btn btn-s btn-g" onClick={onRecord}>
            <Ic.check size={13} />{hasHandles ? "Update accounts" : "Record accounts"}
          </button>
        </div>
        {!canManage && (
          <p className="social-hero-permission">Read-only access — an owner or admin records these.</p>
        )}
      </div>
      </div>

      {/* The strip is a full-width row rather than a column beside the brief, because every tile
          carries the sentence that says where its figure came from or why there is none. That
          sentence is the point of the tile, and it does not fit in a quarter-width column. */}
      <div className="social-kpis">
        {kpis.map((kpi) => (
          <article key={kpi.id} className="social-kpi">
            <span className="social-kpi-glyph">{React.createElement(Ic[kpi.glyph] ?? Ic.grid, { size: 14 })}</span>
            <Figure value={kpi.figure.value} />
            <h3>{kpi.label}</h3>
            <Truth state={kpi.figure.state} />
            <p>{kpi.figure.value === null ? kpi.figure.note : kpi.detail}</p>
          </article>
        ))}
      </div>
    </header>
  );
}

/* ─────────────────────────── missions ─────────────────────────── */

/**
 * Always-on campaign missions.
 *
 * Nothing in the platform records a mission: no cadence, no target, no progress. `tenant_workflows`
 * mirrors n8n and carries a name and a last-run time but neither a cadence nor a target, so a
 * progress bar drawn from it would be a shape with no number behind it. The panel therefore states
 * what a mission would need, and points at the surface that can actually make one.
 */
function ActiveMissionsPanel({ onOpenStudio }) {
  return (
    <section className="social-panel">
      <div className="social-panel-head">
        <div>
          <h3>Active missions</h3>
          <p>Always-on campaigns with a cadence and a target, run for you.</p>
        </div>
        <Truth state="UNAVAILABLE" />
      </div>
      <div className="social-empty">
        <span className="social-empty-glyph"><Ic.trend size={18} /></span>
        <h4>No mission record exists</h4>
        <p>
          Nothing in the platform stores a social mission, its cadence, or its progress, so none is
          shown and none is inferred. Creative work is authored in Vibe Studio and appears under
          Published outputs once it exists.
        </p>
        <button type="button" className="btn btn-s" data-solo-vibe-studio-launcher onClick={onOpenStudio}>
          <Ic.spark size={13} />Vibe Studio
        </button>
      </div>
    </section>
  );
}

/* ─────────────────────────── PAIGE sees ─────────────────────────── */

/**
 * What PAIGE has actually filed and stopped on.
 *
 * This is real: `paige_actions` rows at `status='filed'` with `autonomy_lane='confirm'` are work she
 * prepared and is not permitted to run unattended — which is exactly what an intelligence panel on
 * this surface should carry. What it is NOT is a trend feed: nothing measures a trend, a posting
 * window, or a repurposing opportunity for this workspace, so none is drawn.
 */
function PaigeSeesPanel({ items, loading, error, onRetry }) {
  const growth = items.filter((item) => isGrowthDesk(item.department));
  return (
    <section className="social-panel">
      <div className="social-panel-head">
        <div>
          <h3>PAIGE sees</h3>
          <p>Work she has prepared from the growth desks and stopped on for you.</p>
        </div>
        <Truth state={growth.length ? "PARTIAL" : "UNAVAILABLE"} />
      </div>
      {loading ? (
        <div className="social-skeleton" role="status" aria-label="Loading what PAIGE has filed"><span /><span /><span /></div>
      ) : error ? (
        <div className="social-empty" role="alert">
          <h4>This could not be read</h4>
          <p>A failed read is not the same as nothing waiting, so nothing is claimed either way.</p>
          <button type="button" className="btn btn-s" onClick={onRetry}><Ic.arrow size={13} />Try again</button>
        </div>
      ) : growth.length === 0 ? (
        <div className="social-empty">
          <span className="social-empty-glyph"><Ic.pulse size={18} /></span>
          <h4>Nothing is waiting on you</h4>
          <p>
            When PAIGE prepares growth work she is not permitted to run unattended, it appears here
            with the desk that filed it. No trend, posting window, or engagement signal is measured
            for this workspace, so none is shown.
          </p>
        </div>
      ) : (
        <ul className="social-feed">
          {growth.map((item) => (
            <li key={item.id}>
              <span className="social-feed-glyph"><Ic.bell size={14} /></span>
              <div>
                <h4>{item.title}</h4>
                {item.summary && <p>{item.summary}</p>}
                <small>
                  {item.department}
                  {item.rationale ? ` · ${item.rationale}` : ""}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─────────────────────────── pipeline ─────────────────────────── */

function ContentPipelinePanel({ stages }) {
  const known = stages.filter((stage) => stage.figure.value !== null).length;
  return (
    <section className="social-panel">
      <div className="social-panel-head">
        <div>
          <h3>Content pipeline</h3>
          <p>From idea to placement — and which of those steps the platform can actually see.</p>
        </div>
        <Truth state={known ? "PARTIAL" : "UNAVAILABLE"} />
      </div>
      <ol className="social-pipeline">
        {stages.map((stage) => (
          <li key={stage.id} className={`social-stage social-stage--${stage.tone}`}>
            <Figure value={stage.figure.value} />
            <h4>{stage.label}</h4>
            <p>{stage.figure.value === null ? stage.figure.note : stage.detail}</p>
          </li>
        ))}
      </ol>
      <p className="social-panel-foot">
        Published outputs are pages, funnels and forms — eligible for placement, not posts. They
        appear as placements only once a supported provider records where they went live.
      </p>
    </section>
  );
}

/* ─────────────────────────── channels ─────────────────────────── */

function ChannelTelemetryPanel({ channels, onRecord, canManage, notPermitted }) {
  return (
    <section className="social-panel">
      <div className="social-panel-head">
        <div>
          <h3>Channels</h3>
          <p>The accounts on record, and what is known about each.</p>
        </div>
        <Truth state={channels.length ? "PARTIAL" : "UNAVAILABLE"} />
      </div>
      {notPermitted ? (
        <div className="social-empty">
          <h4>Not shown at your access level</h4>
          <p>
            This workspace's account record is internal to its owners and admins. Nothing here says
            whether accounts exist — only that this is not yours to read.
          </p>
        </div>
      ) : channels.length === 0 ? (
        <div className="social-empty">
          <span className="social-empty-glyph"><Ic.users size={18} /></span>
          <h4>No account is on record</h4>
          <p>
            Record the accounts this business posts from. PAIGE reads them when she drafts, and the
            Systems Check item for social accounts is satisfied by this record.
          </p>
          <button type="button" className="btn btn-s btn-g" onClick={onRecord} disabled={!canManage}>
            <Ic.plus size={13} />Record accounts
          </button>
        </div>
      ) : (
        <>
          <ul className="social-channels">
            {channels.map((channel) => (
              <li key={channel.network}>
                <div className="social-channel-id">
                  <span className={`social-channel-dot social-channel-dot--${channel.network}`} aria-hidden="true" />
                  <div>
                    <h4>{channel.label}</h4>
                    <small className="mono">{channel.handle}</small>
                  </div>
                </div>
                <div className="social-channel-metric">
                  <Figure value={channel.reach.value} />
                  <small>{channel.reach.note}</small>
                </div>
              </li>
            ))}
          </ul>
          <p className="social-panel-foot">
            Declared accounts. No provider is connected, so no audience, engagement or placement
            figure is read for any of them.
          </p>
        </>
      )}
    </section>
  );
}

/* ─────────────────────────── governance ─────────────────────────── */

/**
 * Trust Compass, reflected — never re-implemented.
 *
 * There is exactly one autonomy control on this platform and it is not here. This reads the lanes
 * the platform default puts the growth desks in, and labels them as what they are: a PLATFORM
 * default, identical for every workspace, because no per-workspace autonomy record exists anywhere
 * to show (`useSoloTrust.ts:38-44`). Saying "your settings" here would reintroduce the fabrication
 * that file removed, in a new place.
 */
function TrustCompassSocialStatus({ trust }) {
  const rows = (trust.departments ?? [])
    .filter((dept) => isGrowthDesk(dept.slug))
    .flatMap((dept) => (dept.acts ?? []).slice(0, 2).map((act) => ({ dept: dept.name, ...act })));

  if (trust.loading) return null;
  if (!rows.length) return null;

  return (
    <aside className="social-governance">
      <div className="social-governance-head">
        <Ic.shield size={14} />
        <h3>Trust Compass governs what PAIGE may do here</h3>
      </div>
      <ul>
        {rows.map((row, index) => (
          <li key={`${row.dept}-${row.label}-${index}`}>
            <span className={`social-lane social-lane--${row.lane}`}>{LANE_COPY[row.lane] ?? row.lane}</span>
            <span className="social-lane-label">{row.label}</span>
          </li>
        ))}
      </ul>
      <p>
        This is the platform default for these desks, the same for every workspace — not a setting
        this workspace chose. Autonomy is reviewed in Trust Compass, not here.
      </p>
    </aside>
  );
}

/* ─────────────────────────── the page ─────────────────────────── */

export function SocialCommand({ campaigns, onOpenStudio, onAskPaige }) {
  const social = useSocialCommand();
  // Owned here rather than lifted into GrowthHub: the other five Campaigns tabs would otherwise pay
  // for two reads they never render.
  const pending = useSoloPendingActions();
  const trust = useSoloTrust(social.tenantId);
  const [recording, setRecording] = React.useState(false);
  const opener = React.useRef(null);

  const openRecord = React.useCallback((event) => {
    opener.current = event?.currentTarget ?? null;
    setRecording(true);
  }, []);
  const closeRecord = React.useCallback(() => {
    setRecording(false);
    opener.current?.focus?.({ preventScroll: true });
  }, []);

  const input = React.useMemo(() => {
    // The `?? []` lives INSIDE the memo: as a statement outside it, the fallback array is a new
    // identity every render and the memo never holds.
    const artifacts = campaigns.artifacts ?? [];
    return {
      handles: social.handles,
      publishedOutputs: artifacts.length,
      approvalGatedForms: artifacts.filter((artifact) => String(artifact.routingState || "").includes("approval-gated")).length,
      formsNeedingRepair: artifacts.filter((artifact) => (artifact.recentDispatches?.failed ?? 0) > 0).length,
      capturedSubmissions: (campaigns.submissions ?? []).length,
      waitingOnYou: (pending.items ?? []).filter((item) => isGrowthDesk(item.department)).length,
    };
  }, [social.handles, campaigns.artifacts, campaigns.submissions, pending.items]);

  if (social.phase === "resolving" || campaigns.phase === "resolving") {
    return (
      <div className="social-page">
        <div className="social-state" role="status"><span className="social-spinner" />Resolving this account's Social workspace…</div>
      </div>
    );
  }
  if (social.phase === "unavailable") {
    return (
      <div className="social-page">
        <div className="social-state">
          <Truth state="UNAVAILABLE" />
          <h2>Social needs a resolved workspace</h2>
          <p>No record is read until your account context is confirmed.</p>
        </div>
      </div>
    );
  }
  if (social.phase === "error") {
    return (
      <div className="social-page">
        <div className="social-state" role="alert">
          <Truth state="UNAVAILABLE" />
          <h2>This workspace's social record could not be read</h2>
          <p>Nothing was changed. A failed read is not an empty record, so nothing is claimed either way.</p>
          <button type="button" className="btn btn-s" onClick={social.retry}><Ic.arrow size={13} />Try again</button>
        </div>
      </div>
    );
  }
  if (social.phase === "loading") {
    return (
      <div className="social-page">
        <div className="social-skeleton" role="status" aria-label="Loading Social"><span /><span /><span /></div>
      </div>
    );
  }

  const brief = buildBrief(input);
  const kpis = buildKpis(input);
  const stages = buildPipeline(input);
  const channels = buildChannels(social.handles);

  return (
    <div className="social-page">
      <SocialHero
        brief={brief}
        kpis={kpis}
        canManage={social.canManage}
        hasHandles={social.handles.length > 0}
        onRecord={openRecord}
        onAskPaige={onAskPaige}
      />

      <div className="social-grid">
        <ActiveMissionsPanel onOpenStudio={onOpenStudio} />
        <PaigeSeesPanel items={pending.items ?? []} loading={pending.loading} error={pending.error} onRetry={pending.refresh} />
        <ContentPipelinePanel stages={stages} />
        <ChannelTelemetryPanel
          channels={channels}
          onRecord={openRecord}
          canManage={social.canManage}
          notPermitted={social.notPermitted}
        />
      </div>

      <TrustCompassSocialStatus trust={trust} />

      {social.recordChangedAt && (
        <p className="social-record-stamp">
          This workspace record last changed {new Date(social.recordChangedAt).toLocaleString()}. Nothing
          records when an individual account was added, so no per-account date is shown.
        </p>
      )}

      {recording && (
        <RecordAccountsForm
          handles={social.handles}
          canManage={social.canManage}
          onSave={social.recordHandles}
          onClose={closeRecord}
        />
      )}
    </div>
  );
}

export default SocialCommand;

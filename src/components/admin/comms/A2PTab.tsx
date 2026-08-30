// Comms C-2s-B-2 — A2P registration. Extends the CommunicationsAdmin hub as its "A2P"
// tab (§18: one home per capability — the tenant comms hub already exists at
// /admin/communications; no redundant /app/settings/comms/a2p route is scaffolded,
// exactly as NumbersTab did in C-2s-B-1).
//
// THE BEAT-GHL SURFACE (§36): a coach fills a short brand form and one line about what
// they text clients — then PAIGE DRAFTS the regulatory 10DLC campaign copy (use-case
// description, sample messages, opt-in flow + STOP/HELP replies) they would otherwise
// have to write inside Twilio/TrustHub. The coach reviews, tweaks, approves, and submits
// — WITHOUT ever opening Twilio or writing a word of compliance prose.
//
// §37 (consumer): this tab consumes two backend contracts, matched exactly.
//   comms-a2p-draft  ← { legal_business_name?, website?, use_case_hint? }
//                    → { draft: { use_case, campaign_description, sample_messages[],
//                                 optin_flow, optin_message, optout_message, help_message },
//                        legal_business_name, website } | { needs_config, error }
//   comms-a2p-submit ← { legal_business_name, website?, ein?, use_case,
//                        campaign_description, sample_messages[], optin_flow?,
//                        optin_message, optout_message, help_message }
//   The three replies are sent as themselves — and sent EVEN WHEN EMPTY, because ""
//   means the owner deleted that reply and omitting the key would preserve it instead.
//                    → { saved, submitted, a2p_submit_wired, needs_config?, state,
//                        status, brand_sid, campaign_sid, message }
//   A non-2xx from either carries { error: { code, message } }, where `code` is the save
//   seam's STABLE hint — read it, never the sentence.
//
// §13 HONESTY: carrier submission does not exist. It is not "a stub that returns no SID":
// the stub calls were REMOVED, so nothing here can send anything. This surface therefore
// must never render a submitted state it cannot produce.
//   A REGRESSION THIS TAB ALMOST SHIPPED: the banner and pills keyed on "a row exists with
//   no SID" and read "Submitted for review — you'll be notified the moment it's approved."
//   That was survivable only while nothing wrote the row. Once the draft path began saving
//   durably, that shape became the NORMAL result of "Draft with Paige", and the surface
//   would have told owners their registration was filed when nothing had been sent and
//   nothing would ever notify them. `submitted_at` — which only a real submission path may
//   set — is now the discriminator: prepared says prepared.
//
// §9: draft + submit derive the tenant server-side (JWT); this client never sends a
// tenant. The status read uses (supabase as any) because tenant_a2p_registrations isn't in
// the generated types (RLS scopes it to the caller's tenant).
// §2: A2P copy is coaching-generic (produced by comms-a2p-draft); this tab adds no
// finance wording. §11: gold is spent ONLY on the one act button; rings stay indigo.
import { Link } from "react-router-dom";
import { draftFromRegistration, hasLeftPreparation } from "./a2pDraftResume";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, Sparkles, MessageSquareText, Plus, Trash2, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SectionCard, EmptyState, StatePill, type PillState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ---- Shapes the backend ships (matched exactly, §37) -------------------------
/** The wire shape from comms-a2p-draft / to comms-a2p-submit — sample_messages is a plain string[]. */
interface A2PDraft {
  use_case: string;
  campaign_description: string;
  sample_messages: string[];
  optin_flow: string;
  optin_message: string;
  optout_message: string;
  help_message: string;
}

// A stable id per editable sample row so React keys survive add/remove — an index key would re-map a
// sibling's text/focus onto the wrong row when a middle sample is deleted (the exact "review Paige's
// draft" moment). Ids are component-local; the wire shape is still string[] (see cleanSamples).
let sampleSeq = 0;
const newSampleId = (): string => `sample-${(sampleSeq += 1)}`;
interface SampleRow {
  id: string;
  text: string;
}
/** The coach-editable draft held in component state — samples carry stable ids. */
export interface EditDraft {
  use_case: string;
  campaign_description: string;
  samples: SampleRow[];
  optin_flow: string;
  optin_message: string;
  optout_message: string;
  help_message: string;
}
/** The persisted registration row (tenant_a2p_registrations) — not in generated types. */
export interface A2PRegistration {
  brand_status: string;
  campaign_status: string;
  status: string;
  brand_sid: string | null;
  campaign_sid: string | null;
  use_case: string | null;
  campaign_description: string | null;
  sample_messages: string[] | null;
  optin_flow: string | null;
  optin_message: string | null;
  optout_message: string | null;
  help_message: string | null;
  messaging_service_sid: string | null;
  approved_at: string | null;
  submitted_at: string | null;
}

// A2P status enum → StatePill. Gold is reserved for the act (Approve & submit), so status
// pills NEVER use gold: approved=success, submitted/in_review=pending, rejected=error,
// pending=off (neutral). (§11 gold-only-on-act.)
function statusPill(raw: string, submittedAt: string | null): { state: PillState; label: string } {
  switch (raw) {
    case "approved":
      return { state: "success", label: "Approved" };
    case "in_review":
      return { state: "pending", label: "In review" };
    case "submitted":
      return { state: "pending", label: "Submitted" };
    case "pending":
      // A row EXISTS but nothing has been submitted. "Being set up" implied someone
      // else was working it; nobody is. The caller passes submittedAt so this can say
      // which it actually is (§13 — a compliance surface must not imply a filing).
      return submittedAt
        ? { state: "pending", label: "Submitted" }
        : { state: "off", label: "Prepared" };
    case "suspended":
      return { state: "error", label: "Suspended" };
    case "rejected":
      return { state: "error", label: "Needs attention" };
    default:
      return { state: "off", label: "Not started" };
  }
}

/**
 * Has this registration actually been SUBMITTED to a carrier?
 *
 * This used to be `isPendingSetup` — no SID and not yet resolved — and it rendered a
 * banner reading "Submitted for review … you'll be notified the moment it's approved".
 * That was survivable only while nothing wrote the row. The durable draft save writes
 * exactly this shape (status 'pending', no SIDs), so the banner became reachable from
 * "Draft with Paige" and would have told owners their registration was filed when
 * nothing had been sent and nothing would ever notify them.
 *
 * `submitted_at` is the one field that distinguishes the two, and only the submission
 * path may set it — so it is the honest discriminator (§13).
 */
function isSubmittedToCarrier(reg: A2PRegistration): boolean {
  return !!reg.submitted_at && reg.status !== "approved" && reg.status !== "rejected";
}

/** Prepared and sitting here: a row exists, but nothing has been filed anywhere. */
function isPreparedOnly(reg: A2PRegistration): boolean {
  // The SAME predicate the editor uses, so the banner can never promise an edit the
  // editor will not offer — and neither can drift from the server's eight conditions.
  return !hasLeftPreparation(reg);
}

/**
 * The stable refusal code behind a non-2xx from either A2P function.
 *
 * supabase-js wraps the response; the structured body carries `error.code`. Reading it is
 * what separates a refusal the owner can ACT on from the generic "try again" that no
 * amount of retrying will clear.
 */
async function refusalCode(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    const body = ctx ? await ctx.clone().json() : null;
    return String((body as { error?: { code?: string } } | null)?.error?.code ?? "");
  } catch {
    return "";
  }
}

/** What to tell the owner for each refusal the save seam can return. */
const REFUSAL_COPY: Record<string, { title: string; description: string }> = {
  SAMPLES_REQUIRED: {
    title: "Add a sample message",
    description: "Carriers need at least one example of what you'll text clients. Nothing was saved.",
  },
  SAMPLES_INVALID: {
    title: "Those samples couldn't be read",
    description: "Re-enter the sample messages as plain text. Nothing was saved.",
  },
  USE_CASE_REQUIRED: {
    title: "Add a use case",
    description: "Carriers need a short description of what the texting is for. Nothing was saved.",
  },
  REGISTRATION_IMMUTABLE: {
    title: "This registration can no longer be edited",
    description:
      "It has moved past preparation, so its copy is locked. Reload to see where it stands.",
  },
  FORBIDDEN: {
    title: "You don't have access to change this",
    description: "Ask a workspace admin to prepare the registration.",
  },
};

export function A2PTab() {
  const { toast } = useToast();

  // Existing registration (status surface).
  const [reg, setReg] = useState<A2PRegistration | null>(null);
  const [regLoading, setRegLoading] = useState(true);

  // Brand form (§36 short form — the only fields a coach fills by hand).
  const [legalName, setLegalName] = useState("");
  const [website, setWebsite] = useState("");
  const [ein, setEin] = useState("");
  const [useCaseHint, setUseCaseHint] = useState("");

  // The Paige-drafted, coach-editable copy (samples carry stable ids, see EditDraft).
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftUnavailable, setDraftUnavailable] = useState(false);
  // A refusal the owner can ACT on is different from one they cannot. The draft
  // seam returns a stable code; LEGAL_PROFILE_REQUIRED names a missing business
  // record and has a real place to go and fix it.
  const [needsLegalProfile, setNeedsLegalProfile] = useState(false);
  // Who can actually FIX a missing legal business name. /admin/setup/legal is AdminOnly,
  // while the route that mounts this tab has no gate and comms-a2p-draft admits `coach` —
  // so an unconditional link handed coaches a control that denies them. Offer the link to
  // whoever can use it, and tell everyone else who to ask.
  const { isAdmin } = useUserRoles();
  const [submitting, setSubmitting] = useState(false);

  const loadReg = useCallback(async () => {
    setRegLoading(true);
    // BOTH reads below are scoped to the caller's own tenant EXPLICITLY. RLS alone is not
    // enough: its SELECT predicate admits every tenant a platform owner can see and every
    // tenant a multi-tenant member belongs to, and neither read carries an ORDER BY — so
    // `.limit(1)` returns whichever row the planner happens to produce.
    //
    // That was a knowingly-accepted display quirk until this surface started REHYDRATING.
    // Now the row becomes an editable, savable draft and the legal name is posted to a
    // carrier registration whose tenant is derived server-side — so an arbitrary row means
    // another business's reviewed copy in this editor, and a filing under another
    // business's legal identity. Same shape as the #588 nondeterministic-resolver defect,
    // in a compliance field. The repo's own precedent is
    // src/solo/data/useCalendarConnections.ts: resolve the tenant, then filter on it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any;
    const { data: resolvedTenant } = await untyped.rpc("current_user_tenant_id");
    const tenantId = typeof resolvedTenant === "string" ? resolvedTenant : null;
    if (!tenantId) {
      // No resolvable tenant is not "no registration" — say nothing rather than render a
      // confident negative about an account we could not identify.
      setReg(null);
      setRegLoading(false);
      return;
    }
    const { data } = await untyped
      .from("tenant_a2p_registrations")
      .select(
        "brand_status, campaign_status, status, brand_sid, campaign_sid, messaging_service_sid, use_case, campaign_description, sample_messages, optin_flow, optin_message, optout_message, help_message, submitted_at, approved_at",
      )
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    const row = (data as A2PRegistration) ?? null;
    setReg(row);
    // The legal business name lives on tenant_legal_profile and is a HARD precondition of
    // the save seam (LEGAL_PROFILE_REQUIRED). Without restoring it, a resumed draft opened
    // with every reviewed field populated and the save disabled — so the only live control
    // was another paid generation that overwrites the row. Reopening the copy is not
    // resuming the flow unless the owner can act on it.
    const { data: lp } = await untyped
      .from("tenant_legal_profile")
      .select("legal_business_name")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    const storedLegal = (lp as { legal_business_name?: string } | null)?.legal_business_name;
    // `prev || stored`, deliberately, and NOT `prev ?? stored`: the field initialises to ""
    // and `??` would therefore never fill it. The cost is that it also refills a field the
    // owner has deliberately emptied — acceptable here because the save refuses without it
    // anyway, so an empty legal name is never a state worth preserving.
    if (storedLegal) setLegalName((prev) => prev || storedLegal);
    // Re-open the saved copy. `prev ?? ...` so a draft the owner is CURRENTLY editing
    // is never replaced by the stored one — a reload behind an in-progress edit would
    // otherwise silently discard their unsaved work.
    setDraft((prev) => prev ?? draftFromRegistration(row));
    setRegLoading(false);
  }, []);

  useEffect(() => {
    void loadReg();
  }, [loadReg]);

  // Draft with Paige — the model call (§36). Not gold: the act is Approve & submit.
  const runDraft = async () => {
    setDrafting(true);
    setDraftUnavailable(false);
    setNeedsLegalProfile(false);
    try {
      const { data, error } = await supabase.functions.invoke("comms-a2p-draft", {
        body: {
          legal_business_name: legalName || undefined,
          website: website || undefined,
          use_case_hint: useCaseHint || undefined,
        },
      });
      if (error) {
        // supabase-js wraps a non-2xx; the structured body carries our stable code.
        const code = await refusalCode(error);
        if (code === "LEGAL_PROFILE_REQUIRED") { setNeedsLegalProfile(true); return; }
        const known = REFUSAL_COPY[code];
        if (known) { toast({ ...known, variant: "destructive" }); return; }
        throw error;
      }
      const payload = (data ?? {}) as { draft?: A2PDraft; needs_config?: boolean; legal_business_name?: string };
      // §13: an unconfigured model degrades honestly — no fabricated draft.
      if (payload.needs_config || !payload.draft) {
        setDraftUnavailable(true);
        return;
      }
      // Paige may resolve the legal name from the tenant brand — reflect it back.
      if (payload.legal_business_name && !legalName) setLegalName(payload.legal_business_name);
      const d = payload.draft;
      const texts = (d.sample_messages ?? []).length ? d.sample_messages : ["", ""];
      // The draft call PERSISTS. Without refreshing, the status panel kept rendering
      // "Not registered yet" over a registration that now exists.
      void loadReg();
      setDraft({
        use_case: d.use_case ?? "",
        campaign_description: d.campaign_description ?? "",
        samples: texts.map((t) => ({ id: newSampleId(), text: t })),
        optin_flow: d.optin_flow ?? "",
        optin_message: d.optin_message ?? "",
        optout_message: d.optout_message ?? "",
        help_message: d.help_message ?? "",
      });
    } catch {
      toast({
        title: "Couldn't draft that just now",
        description: "Give it another moment, or add a line about what you text clients.",
        variant: "destructive",
      });
    } finally {
      setDrafting(false);
    }
  };

  const patchDraft = (patch: Partial<Omit<EditDraft, "samples">>) =>
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  // Sample mutators key on the row's stable id — never its index — so deleting a middle sample can't
  // re-map a sibling's text/focus onto the wrong row (design-critic "before merge").
  const setSample = (id: string, val: string) =>
    setDraft((prev) =>
      prev ? { ...prev, samples: prev.samples.map((s) => (s.id === id ? { ...s, text: val } : s)) } : prev,
    );
  const addSample = () =>
    setDraft((prev) =>
      prev && prev.samples.length < 5 ? { ...prev, samples: [...prev.samples, { id: newSampleId(), text: "" }] } : prev,
    );
  const removeSample = (id: string) =>
    setDraft((prev) => (prev ? { ...prev, samples: prev.samples.filter((s) => s.id !== id) } : prev));

  const cleanSamples = useMemo(
    () => (draft ? draft.samples.map((s) => s.text.trim()).filter(Boolean) : []),
    [draft],
  );

  const canSubmit =
    !!draft &&
    legalName.trim().length > 0 &&
    draft.use_case.trim().length > 0 &&
    draft.campaign_description.trim().length > 0 &&
    cleanSamples.length >= 1 &&
    !submitting;

  // Approve & submit — the ONE gold act (§11).
  const submit = async () => {
    if (!draft) return;
    setSubmitting(true);
    try {
      // Each reviewed field is sent as itself. This used to concatenate the three
      // replies into optin_flow behind labels, because the table had no column for
      // them — text preserved, structure destroyed, and nothing could read them back
      // into the editor. 20261004020000 gave them a home, so the workaround is gone.

      const { data, error } = await supabase.functions.invoke("comms-a2p-submit", {
        body: {
          legal_business_name: legalName.trim(),
          website: website.trim() || undefined,
          ein: ein.trim() || undefined,
          use_case: draft.use_case.trim(),
          campaign_description: draft.campaign_description.trim(),
          sample_messages: cleanSamples,
          // Sent even when empty, same rule as the three replies below.
          optin_flow: draft.optin_flow.trim(),
          // Sent even when empty. `|| undefined` dropped the key, the seam read that as
          // "not mentioned" and preserved the old text — so a reply the owner deleted
          // came back while the surface said the copy had saved.
          optin_message: draft.optin_message.trim(),
          optout_message: draft.optout_message.trim(),
          help_message: draft.help_message.trim(),
        },
      });
      if (error) {
        // Previously a bare `throw` into a catch that said "Try again in a moment" — which
        // is wrong for every refusal here, because none of them clear by waiting, and the
        // reviewed copy the owner had just approved was lost behind it.
        const code = await refusalCode(error);
        if (code === "LEGAL_PROFILE_REQUIRED") { setNeedsLegalProfile(true); return; }
        const known = REFUSAL_COPY[code];
        if (known) { toast({ ...known, variant: "destructive" }); return; }
        throw error;
      }
      const payload = (data ?? {}) as { saved?: boolean; submitted?: boolean; a2p_submit_wired?: boolean; message?: string };
      if (!payload.saved) {
        toast({ title: "That didn't go through", description: "Try again in a moment.", variant: "destructive" });
        return;
      }
      // §13: honest — the carrier submit isn't wired, so we celebrate "saved & submitted for
      // review", never "approved". The status panel below reflects the real pending state.
      // The backend reports `submitted` explicitly and, today, always false: carrier
      // registration is not wired, so nothing is sent and nothing is queued. Titling this
      // "Submitted for review" regardless is the same fabricated-outcome class as a made-up
      // delivery receipt — it just sounds like good news. Report what came back (§13).
      toast({
        title: payload.submitted ? "Submitted to carriers" : "Saved — not submitted",
        description:
          payload.message ??
          (payload.submitted
            ? "Your registration is with the carriers now."
            : "Your reviewed copy is saved. Carrier submission isn't available yet, so nothing has been sent."),
      });
      setDraft(null);
      await loadReg();
    } catch {
      toast({ title: "That didn't go through", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const submittedToCarrier = reg ? isSubmittedToCarrier(reg) : false;
  const preparedOnly = reg ? isPreparedOnly(reg) : false;

  return (
    <div className="space-y-6">
      {/* ── Status surface — where this practice's registration stands. ── */}
      <SectionCard
        title="Business texting registration"
        description="Carriers require every business to register before it can text clients. Here's where yours stands."
      >
        {regLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-16 animate-pulse rounded-lg bg-muted/50" />
            <div className="h-16 animate-pulse rounded-lg bg-muted/50" />
          </div>
        ) : !reg ? (
          <EmptyState
            icon={ShieldCheck}
            title="Not registered yet"
            description="Fill in a few details below and Paige writes the whole carrier registration for you — the description, the sample texts, the opt-in language. You review and approve; Paige handles the paperwork."
          />
        ) : (
          <div className="space-y-4">
            {submittedToCarrier && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Submitted for review — your A2P registration is being set up. You&rsquo;ll be notified the
                moment it&rsquo;s approved and your business can text clients.
              </div>
            )}
            {preparedOnly && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Prepared, not submitted — your registration is written and saved here. Carrier
                submission isn&rsquo;t available yet, so nothing has been sent and nothing is queued.
                You can keep editing it until it can be filed.
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Brand + campaign status — neutral/success pills, never gold (§11). */}
              {([
                ["Brand", reg.brand_status, reg.brand_sid],
                ["Campaign", reg.campaign_status, reg.campaign_sid],
              ] as const).map(([label, raw, sid]) => {
                const pill = statusPill(raw, reg.submitted_at);
                return (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{label}</div>
                      {/* A real SID appears here only when carrier registration is live (§13). */}
                      {sid ? (
                        <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{sid}</div>
                      ) : (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {/* "Being set up" implied someone was working it. For a prepared
                              row nobody is, and the banner directly above says nothing has
                              been sent — the two cannot both be true (§13). */}
                          {reg.submitted_at ? "Being set up" : "Not filed yet"}
                        </div>
                      )}
                    </div>
                    <StatePill state={pill.state}>{pill.label}</StatePill>
                  </div>
                );
              })}
            </div>
            {reg.use_case && (
              <div className="text-xs text-muted-foreground">
                Registered use-case: <span className="text-foreground">{reg.use_case}</span>
                {reg.submitted_at && <> · Submitted {new Date(reg.submitted_at).toLocaleDateString()}</>}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── The registration flow — short form → Paige drafts → review → approve. ── */}
      <SectionCard
        title={reg ? "Update your registration" : "Register with Paige"}
        description="Tell Paige your business name and what you text clients about. She writes the carrier copy; you approve it — no portals, no compliance forms."
      >
        <div className="space-y-5">
          {/* Brand form — the only fields a coach fills by hand (§36). */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a2p-legal">
                Legal business name <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="a2p-legal"
                  value={legalName}
                  placeholder="Acme Coaching LLC"
                  className="pl-8"
                  onChange={(e) => setLegalName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a2p-website">Website</Label>
              <Input
                id="a2p-website"
                value={website}
                placeholder="acmecoaching.com"
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a2p-ein">Business tax ID (EIN)</Label>
              <Input
                id="a2p-ein"
                value={ein}
                inputMode="numeric"
                placeholder="Optional — speeds up carrier approval"
                onChange={(e) => setEin(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="a2p-hint">What do you text clients about?</Label>
              <Textarea
                id="a2p-hint"
                value={useCaseHint}
                rows={2}
                placeholder="Appointment reminders, session follow-ups, onboarding steps for my clients"
                onChange={(e) => setUseCaseHint(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                One line is plenty — Paige turns it into the full carrier registration.
              </p>
            </div>
          </div>

          <div>
            {/* Draft with Paige — a helper act, not the final approval, so NOT gold (§11). */}
            <Button onClick={() => void runDraft()} disabled={drafting}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              {drafting ? "Paige is writing it…" : draft ? "Re-draft with Paige" : "Draft with Paige"}
            </Button>
          </div>

          {needsLegalProfile && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <strong className="text-foreground">Add your legal business name first.</strong>{" "}
              <span className="text-muted-foreground">
                Carriers register a legal entity, so this can&rsquo;t be prepared until your business
                profile has one. Nothing was saved.
              </span>{" "}
              {isAdmin ? (
                <Link to="/admin/setup/legal?tab=templates" className="underline underline-offset-2">
                  Open business profile
                </Link>
              ) : (
                <span className="text-muted-foreground">
                  Ask a workspace admin to add it under Setup &rsaquo; Legal &rsaquo; Templates.
                </span>
              )}
            </div>
          )}

          {draftUnavailable && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Paige can't draft your registration in this workspace yet. Once it's set up, come back and she'll
              write the whole thing for you.
            </div>
          )}

          {/* ── Review — Paige's draft, fully editable before it's submitted. ── */}
          {draft && (
            <div className="space-y-5 rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageSquareText className="h-4 w-4 text-muted-foreground" />
                Paige's draft — review and tweak anything, then approve
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="a2p-usecase">Use-case</Label>
                <Input
                  id="a2p-usecase"
                  value={draft.use_case}
                  onChange={(e) => patchDraft({ use_case: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="a2p-desc">Campaign description</Label>
                <Textarea
                  id="a2p-desc"
                  value={draft.campaign_description}
                  rows={3}
                  onChange={(e) => patchDraft({ campaign_description: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  What carriers read to approve you — who you text, why, and that they opted in.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Sample messages</Label>
                <div className="space-y-2">
                  {draft.samples.map((s) => (
                    <div key={s.id} className="flex items-start gap-2">
                      <Textarea
                        value={s.text}
                        rows={2}
                        placeholder="A real text a client would receive"
                        onChange={(e) => setSample(s.id, e.target.value)}
                        className="flex-1"
                      />
                      {draft.samples.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove sample"
                          className="mt-1 shrink-0 text-muted-foreground"
                          onClick={() => removeSample(s.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {draft.samples.length < 5 && (
                  <Button variant="outline" size="sm" onClick={addSample}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Add a sample
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="a2p-optin">How clients opt in</Label>
                <Textarea
                  id="a2p-optin"
                  value={draft.optin_flow}
                  rows={2}
                  onChange={(e) => patchDraft({ optin_flow: e.target.value })}
                />
              </div>

              {/* The three auto-replies Paige drafted — editable; they travel with the
                  registration in their own columns — the fold into optin_flow is gone (§18). */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="a2p-optin-msg">Opt-in reply</Label>
                  <Textarea
                    id="a2p-optin-msg"
                    value={draft.optin_message}
                    rows={3}
                    onChange={(e) => patchDraft({ optin_message: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="a2p-stop-msg">STOP reply</Label>
                  <Textarea
                    id="a2p-stop-msg"
                    value={draft.optout_message}
                    rows={3}
                    onChange={(e) => patchDraft({ optout_message: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="a2p-help-msg">HELP reply</Label>
                  <Textarea
                    id="a2p-help-msg"
                    value={draft.help_message}
                    rows={3}
                    onChange={(e) => patchDraft({ help_message: e.target.value })}
                  />
                </div>
              </div>

              {!legalName.trim() && (
                <p className="text-xs text-destructive">Add your legal business name above before submitting.</p>
              )}

              <div className="flex items-center gap-3 pt-1">
                {/* GOLD — the one act on this surface: approve the copy and submit it (§11). */}
                <Button variant="gold" disabled={!canSubmit} onClick={() => void submit()}>
                  {submitting ? "Saving…" : "Approve & save"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Paige writes it and saves it here. Carrier submission isn&rsquo;t available yet.
                </span>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

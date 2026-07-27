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
//                        campaign_description, sample_messages[], optin_flow? }
//                    → { saved, a2p_submit_wired, needs_config?, brand_status,
//                        campaign_status, status, brand_sid, campaign_sid, message }
//
// §13 HONESTY: the carrier SUBMIT is not yet wired (twilio.ts createBrand/createCampaign
// are needs_config stubs). So on submit we NEVER show a fake "Approved" or a fabricated
// SID — we show the truthful "Submitted for review — being set up; you'll be notified
// when it's approved." The Paige-drafted COPY is real (a real model call); the SUBMIT is
// pending-not-yet-live, surfaced as such.
//
// §9: draft + submit derive the tenant server-side (JWT); this client never sends a
// tenant. The status read uses (supabase as any) because tenant_a2p_registrations isn't in
// the generated types (RLS scopes it to the caller's tenant).
// §2: A2P copy is coaching-generic (produced by comms-a2p-draft); this tab adds no
// finance wording. §11: gold is spent ONLY on "Approve & submit"; rings stay indigo.
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
interface EditDraft {
  use_case: string;
  campaign_description: string;
  samples: SampleRow[];
  optin_flow: string;
  optin_message: string;
  optout_message: string;
  help_message: string;
}
/** The persisted registration row (tenant_a2p_registrations) — not in generated types. */
interface A2PRegistration {
  brand_status: string;
  campaign_status: string;
  status: string;
  brand_sid: string | null;
  campaign_sid: string | null;
  use_case: string | null;
  campaign_description: string | null;
  sample_messages: string[] | null;
  optin_flow: string | null;
  submitted_at: string | null;
}

// A2P status enum → StatePill. Gold is reserved for the act (Approve & submit), so status
// pills NEVER use gold: approved=success, submitted/in_review=pending, rejected=error,
// pending=off (neutral). (§11 gold-only-on-act.)
function statusPill(raw: string): { state: PillState; label: string } {
  switch (raw) {
    case "approved":
      return { state: "success", label: "Approved" };
    case "in_review":
      return { state: "pending", label: "In review" };
    case "submitted":
      return { state: "pending", label: "Submitted" };
    case "pending":
      // A row EXISTS but the carrier submit hasn't run — "Being set up" matches the banner, never the
      // contradictory "Not started" the empty (no-row) case shows (§13 honesty on a compliance surface).
      return { state: "pending", label: "Being set up" };
    case "suspended":
      return { state: "error", label: "Suspended" };
    case "rejected":
      return { state: "error", label: "Needs attention" };
    default:
      return { state: "off", label: "Not started" };
  }
}

/** A registration that exists but has no real SID yet is honestly "being set up" (§13). */
function isPendingSetup(reg: A2PRegistration): boolean {
  return !reg.brand_sid && !reg.campaign_sid && reg.status !== "approved" && reg.status !== "rejected";
}

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
  const [submitting, setSubmitting] = useState(false);

  const loadReg = useCallback(async () => {
    setRegLoading(true);
    // tenant_a2p_registrations isn't in the generated types; RLS scopes the read to the
    // caller's own tenant (§9), so no tenant filter is needed here. .limit(1) guards the one
    // case where RLS returns >1 row — a platform owner, whose select policy spans all tenants —
    // so maybeSingle() degrades to the first row instead of erroring into a false "Not registered".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("tenant_a2p_registrations")
      .select(
        "brand_status, campaign_status, status, brand_sid, campaign_sid, use_case, campaign_description, sample_messages, optin_flow, submitted_at",
      )
      .limit(1)
      .maybeSingle();
    setReg((data as A2PRegistration) ?? null);
    setRegLoading(false);
  }, []);

  useEffect(() => {
    void loadReg();
  }, [loadReg]);

  // Draft with Paige — the model call (§36). Not gold: the act is Approve & submit.
  const runDraft = async () => {
    setDrafting(true);
    setDraftUnavailable(false);
    try {
      const { data, error } = await supabase.functions.invoke("comms-a2p-draft", {
        body: {
          legal_business_name: legalName || undefined,
          website: website || undefined,
          use_case_hint: useCaseHint || undefined,
        },
      });
      if (error) throw error;
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
      // The backend persists use_case, campaign_description, sample_messages, optin_flow.
      // The opt-in confirmation / STOP / HELP replies the coach reviewed are folded into
      // optin_flow so NOTHING reviewed is silently dropped (§13) — they persist as labeled
      // lines and travel with the registration once carrier submit is wired.
      const optinCombined = [
        draft.optin_flow.trim(),
        draft.optin_message.trim() && `Opt-in confirmation reply: ${draft.optin_message.trim()}`,
        draft.optout_message.trim() && `STOP reply: ${draft.optout_message.trim()}`,
        draft.help_message.trim() && `HELP reply: ${draft.help_message.trim()}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const { data, error } = await supabase.functions.invoke("comms-a2p-submit", {
        body: {
          legal_business_name: legalName.trim(),
          website: website.trim() || undefined,
          ein: ein.trim() || undefined,
          use_case: draft.use_case.trim(),
          campaign_description: draft.campaign_description.trim(),
          sample_messages: cleanSamples,
          optin_flow: optinCombined || undefined,
        },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { saved?: boolean; a2p_submit_wired?: boolean; message?: string };
      if (!payload.saved) {
        toast({ title: "That didn't go through", description: "Try again in a moment.", variant: "destructive" });
        return;
      }
      // §13: honest — the carrier submit isn't wired, so we celebrate "saved & submitted for
      // review", never "approved". The status panel below reflects the real pending state.
      toast({
        title: payload.a2p_submit_wired ? "Submitted to carriers" : "Submitted for review",
        description:
          payload.message ??
          "Your registration is being set up — you'll be notified the moment it's approved.",
      });
      setDraft(null);
      await loadReg();
    } catch {
      toast({ title: "That didn't go through", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingSetup = reg ? isPendingSetup(reg) : false;

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
            {pendingSetup && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                Submitted for review — your A2P registration is being set up. You'll be notified the moment
                it's approved and your practice can text clients.
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Brand + campaign status — neutral/success pills, never gold (§11). */}
              {([
                ["Brand", reg.brand_status, reg.brand_sid],
                ["Campaign", reg.campaign_status, reg.campaign_sid],
              ] as const).map(([label, raw, sid]) => {
                const pill = statusPill(raw);
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
                        <div className="mt-0.5 text-xs text-muted-foreground">Being set up</div>
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
                  registration (folded into the opt-in language on submit, §13 nothing dropped). */}
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
                  {submitting ? "Submitting…" : "Approve & submit"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Paige submits it for you — no carrier forms, no portals.
                </span>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

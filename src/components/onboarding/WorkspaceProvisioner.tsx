/**
 * WorkspaceProvisioner — the one place a signed-in user turns their business context
 * into a workspace. Task #66 reorder: the account TYPE is NO LONGER picked here (§18 —
 * no upfront type picker). It is FIXED from the plan the prospect already chose on
 * /pricing and shown as read-only context. There are two paths, branched on whether a
 * plan is present:
 *
 *  • PAID (a plan is present, the dominant new-customer path): collect the business
 *    context + an explicit unchecked terms clickwrap, then — the compliance fix —
 *    STAGE it in signup_intake AND write the subscriber-agreement legal_acceptances
 *    row NOW (in OUR db, before the Stripe hop), then launch platform-subscription-
 *    checkout as the LAST step. The tenant is NOT provisioned here; the stripe-webhook
 *    provisions it on payment from the staged row (real name / industry / account_type).
 *
 *  • FREE / no-plan (the legacy front door, e.g. resolveLandingRoute sending a
 *    tenant-less user here): provision a standalone workspace directly via
 *    provision_tenant, exactly as before — no checkout. (See the §-note below: without
 *    the tier picker, the free path is standalone-only; agency/enterprise come through
 *    /pricing. Flagged for owner review.)
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLegalDoc, recordAcceptances } from "@/lib/legal/useLegalDocuments";
import { normalizeBilling } from "@/lib/auth/signupPlanIntent";
import { User, Network, Building2, Loader2, FileText, ShieldCheck } from "lucide-react";

const TEAM_SIZES = ["Just me", "2–5", "6–20", "21+"] as const;

// Curated, inclusive industry list (§2: broad audience, never coaching-only).
const INDUSTRIES = [
  "Coaching",
  "Consulting",
  "Agency / Marketing",
  "Advisory / Professional services",
  "Course creator / Thought leader",
  "Real estate",
  "Fitness & wellness",
  "Creative / Design",
  "Other",
] as const;

type AccountType = "standalone" | "agency" | "enterprise";

// The owner-ruled plan→account_type map (task #66). The tier is derived from the plan
// chosen on /pricing, never picked here.
const PLAN_TO_ACCOUNT_TYPE: Record<string, AccountType> = {
  solo: "standalone",
  agency: "agency",
  enterprise: "enterprise",
};

// Each lane's subscriber agreement (§9 platform terms). Derived from the account type
// (which is derived from the plan) — no longer from a picker.
const LANE_TO_AGREEMENT: Record<AccountType, string> = {
  standalone: "saas-standalone",
  agency: "saas-agency",
  enterprise: "saas-enterprise",
};

const ACCOUNT_TYPE_META: Record<AccountType, { title: string; blurb: string; Icon: typeof User }> = {
  standalone: { title: "Solo", blurb: "Your own business — one workspace, full control.", Icon: User },
  agency: { title: "Agency", blurb: "Run many businesses — sub-accounts under your roof.", Icon: Network },
  enterprise: { title: "Enterprise", blurb: "Agency at scale — higher limits and white-label headroom.", Icon: Building2 },
};

interface Props {
  /** Called after a successful FREE provision. Defaults to a hard nav into /admin. */
  onProvisioned?: () => void;
  /** The plan chosen on /pricing (e.g. "solo" | "agency"). Present ⇒ the PAID path. */
  planSlug?: string | null;
  /** "monthly" | "annual" — carried from /pricing for the checkout. */
  billingPeriod?: string | null;
  /** Optional super-admin trial invite token, threaded through to checkout (§9). */
  inviteToken?: string | null;
}

export function WorkspaceProvisioner({ onProvisioned, planSlug, billingPeriod, inviteToken }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();

  // A plan present + recognized ⇒ PAID path. An unrecognized plan slug is ignored
  // (defensive) and falls back to the free standalone path rather than 404 at checkout.
  const paidAccountType: AccountType | null =
    planSlug && planSlug in PLAN_TO_ACCOUNT_TYPE ? PLAN_TO_ACCOUNT_TYPE[planSlug] : null;
  const isPaid = paidAccountType !== null;
  const accountType: AccountType = paidAccountType ?? "standalone";
  // Enterprise is NOT self-serve — platform-subscription-checkout 400s it
  // (plan_not_self_serve). Route it to the existing contact-sales affordance instead of
  // a failing checkout that would also leave an orphaned intake row (Fix N3, §18 reuse).
  const isEnterprise = accountType === "enterprise";
  const billing = normalizeBilling(billingPeriod);

  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryOther, setIndustryOther] = useState("");
  const [teamSize, setTeamSize] = useState<string>("");
  const [about, setAbout] = useState("");
  const [creating, setCreating] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // The agreement for this account type (derived, not picked).
  const agreementSlug = LANE_TO_AGREEMENT[accountType];
  const { doc: agreement, loading: agreementLoading } = useLegalDoc(agreementSlug);
  const meta = ACCOUNT_TYPE_META[accountType];
  const TierIcon = meta.Icon;

  // Reset the explicit terms consent if the derived account type ever changes.
  useEffect(() => { setAgreed(false); }, [accountType]);

  const resolvedIndustry = () =>
    industry === "Other" ? (industryOther.trim() || null) : (industry || null);

  // ── PAID path: stage the intake + log terms NOW (pre-checkout), then checkout ──────
  const stageAndCheckout = async (userId: string) => {
    // (1) STAGE the business context + plan + derived account_type + agreement in
    //     signup_intake — the seam the webhook reads to provision correctly on payment.
    //     `as any` mirrors the repo pattern for tables not yet in generated types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: stageErr } = await (supabase.from("signup_intake" as any) as any).upsert(
      {
        user_id: userId,
        plan_slug: planSlug,
        billing_period: billing,
        account_type: accountType,
        business_name: businessName.trim(),
        industry: resolvedIndustry(),
        team_size: teamSize || null,
        who_you_help: about.trim() || null,
        agreement_slug: agreementSlug,
        agreement_version: agreement?.version ?? null,
        terms_accepted_at: new Date().toISOString(),
        // NOTE (§13): do NOT set consumed_at here. On a RE-stage (the user returns to
        // /onboarding after a prior attempt) an explicit null would RESET a previously
        // consumed audit marker. The column defaults null on the INSERT path only;
        // omitting it from the upsert payload preserves any existing consumed_at.
      },
      { onConflict: "user_id" },
    );
    if (stageErr) throw new Error(stageErr.message);

    // (2) COMPLIANCE FIX — log the subscriber-agreement acceptance in OUR db NOW,
    //     before the Stripe hop. The webhook re-writes it idempotently (ON CONFLICT
    //     DO NOTHING) as a backstop, so this accept-time write is the source of truth.
    if (agreement) {
      const { error: legalErr } = await recordAcceptances(userId, [
        {
          slug: agreementSlug,
          version: agreement.version,
          context: { source: "onboarding_paid", lane: accountType, plan: planSlug },
        },
      ]);
      // A logging hiccup must not block checkout — the webhook backstop still records
      // it — but surface it (§13) rather than swallow silently.
      if (legalErr) console.warn("[onboarding] terms acceptance log failed:", legalErr.message);
    }

    // (3) LAST step — launch Stripe Checkout. On failure, fall back to /pricing.
    const { data, error } = await supabase.functions.invoke("platform-subscription-checkout", {
      body: {
        plan_slug: planSlug,
        billing_period: billing,
        success_path: "/welcome?checkout=success",
        ...(inviteToken ? { invite_token: inviteToken } : {}),
      },
    });
    if (error) {
      let code: string | undefined;
      try {
        const b = await (error as { context?: Response }).context?.json?.();
        code = (b as Record<string, unknown> | undefined)?.error as string | undefined;
      } catch {
        /* not JSON */
      }
      if (code === "already_subscribed" || code === "already_provisioned") {
        window.location.assign("/choose-account");
        return;
      }
      throw new Error(code || error.message || "checkout_failed");
    }
    const url = (data as { url?: string } | null)?.url;
    if (!url) throw new Error("no_checkout_url");
    window.location.href = url;
  };

  // ── FREE path: provision a standalone workspace directly (no checkout) ─────────────
  const provisionFree = async () => {
    const { data: provisioned, error } = await supabase.rpc("provision_tenant", {
      _name: businessName.trim(),
      _industry: resolvedIndustry(),
      _team_size: teamSize || null,
      _description: about.trim() || null,
      _account_type: accountType,
      _agreement_slug: agreementSlug,
      _agreement_version: agreement!.version,
    });
    if (error) throw error;

    // Owner directive (2026-08-16): NEVER default a tenant into a guessed business.
    // We no longer stamp a playbook here — a freshly provisioned tenant leaves
    // features.playbook UNSET and is routed through Setup (the marketplace chooser,
    // enforced by RequireSetupComplete) to CHOOSE their playbook/pipeline/calendar.
    toast({ title: "Workspace ready", description: "Welcome to Paige — this is yours to run." });
    if (onProvisioned) onProvisioned();
    else window.location.assign("/choose-account");
  };

  const submit = async () => {
    // Enterprise: not self-serve — open the same contact-sales mailto used on
    // /pricing and the homepage (§18), no form/terms gating for a sales inquiry.
    if (isEnterprise) {
      window.location.href = "mailto:sales@paigeagent.ai?subject=Enterprise%20Inquiry";
      return;
    }
    if (businessName.trim().length < 2) {
      toast({ title: "Name your business", description: "This becomes your workspace.", variant: "destructive" });
      return;
    }
    if (!agreement || !agreed) {
      toast({
        title: "Review the agreement",
        description: "Please read and accept the subscriber agreement to continue.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const userId = sess.session?.user?.id;
      if (!userId) {
        toast({ title: "Session expired", description: "Sign back in to finish.", variant: "destructive" });
        return;
      }
      if (isPaid) {
        await stageAndCheckout(userId);
        // On success the browser is navigating to Stripe; leave `creating` on.
      } else {
        await provisionFree();
      }
    } catch (e) {
      if (isPaid) {
        toast({
          title: "Couldn't open checkout",
          description: "Your business is saved — pick your plan to finish subscribing.",
          variant: "destructive",
        });
        navigate("/pricing", { replace: true });
      } else {
        toast({ title: "Couldn't create your workspace", description: (e as Error).message, variant: "destructive" });
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Fixed tier context (replaces the removed picker, §18). Read-only — the tier
          was chosen on /pricing; here it's shown, not selected. */}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <TierIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Setting up your {meta.title} workspace
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{meta.blurb}</p>
          {isPaid && !isEnterprise && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              14-day free trial · card on file · cancel anytime
            </p>
          )}
          {isEnterprise && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Enterprise is set up with our team — no self-serve checkout.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-5 rounded-xl border border-border bg-card p-6 md:p-8">
        <div className="space-y-1.5">
          <Label>Business / practice name *</Label>
          <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Acme Advisory" autoFocus />
          <p className="text-xs text-muted-foreground">This names your workspace and your clients' portal.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>What do you do?</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger><SelectValue placeholder="Choose your field" /></SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
              </SelectContent>
            </Select>
            {industry === "Other" && (
              <Input
                className="mt-2"
                value={industryOther}
                onChange={(e) => setIndustryOther(e.target.value)}
                placeholder="Tell us what you do"
                autoFocus
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Team size</Label>
            <Select value={teamSize} onValueChange={setTeamSize}>
              <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
              <SelectContent>
                {TEAM_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>In a sentence, who do you help? (optional)</Label>
          <Textarea rows={2} value={about} onChange={(e) => setAbout(e.target.value)}
            placeholder="I help early-stage founders build repeatable sales systems." />
          <p className="text-xs text-muted-foreground">Paige uses this to tailor your workspace. You can refine it later.</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2.5">
          <div className="flex items-start gap-3">
            <Checkbox
              id="agree-terms"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
              disabled={agreementLoading || !agreement}
              className="mt-0.5"
            />
            <Label htmlFor="agree-terms" className="text-sm font-normal leading-snug cursor-pointer">
              I have read and agree to the{" "}
              {agreement ? (
                <Link
                  to={`/legal/${agreementSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 hover:opacity-80"
                >
                  <FileText className="h-3.5 w-3.5" />{agreement.title}
                </Link>
              ) : (
                <span className="text-muted-foreground">
                  {agreementLoading ? "loading agreement…" : "subscriber agreement"}
                </span>
              )}
              {" "}for a {meta.title} account.
            </Label>
          </div>
          <p className="text-xs text-muted-foreground pl-7">
            {isPaid
              ? "Interim terms while our full legal review is completed. You won't be charged today — your 14-day free trial starts at checkout."
              : "Interim terms while our full legal review is completed. Your workspace isn't created until you accept."}
          </p>
        </div>
        <Button
          onClick={submit}
          disabled={creating || (!isEnterprise && (businessName.trim().length < 2 || !agreed || !agreement))}
          className="w-full h-11"
        >
          {creating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {isPaid ? "Taking you to checkout…" : "Creating your workspace…"}</>
          ) : (
            isEnterprise ? "Contact Sales" : isPaid ? "Continue to checkout" : "Create my workspace"
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * WorkspaceProvisioner — the one place a signed-in user turns into a tenant OWNER.
 *
 * Shared by the front-door signup (/signup, after the account step) and the
 * onboarding gate (/onboarding, for anyone already signed in but tenant-less).
 * The signer picks an account TYPE — the GoHighLevel differentiator: a
 * Standalone workspace (their own practice) OR an Agency/Enterprise that can
 * spin up sub-accounts — then names the business. `provision_tenant` makes them
 * the owner; we hard-navigate into /admin so the role + tenant context reload
 * fresh (a client-side navigate could read a login-time role cache).
 *
 * account_type is a pure capability flag and is upgradeable anytime, so the
 * copy says so — no one is boxed in at the door.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
import { useLegalDoc } from "@/lib/legal/useLegalDocuments";
import { User, Network, Building2, Check, Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const TEAM_SIZES = ["Just me", "2–5", "6–20", "21+"] as const;

// Curated, inclusive industry list (§2: broad audience, never coaching-only).
// "Other" reveals a write-in so no one is boxed out. The chosen value is stored
// on the tenant (brand.industry) so it's segmentable and Paige can tailor per
// vertical — while the free-text "who do you help" line captures the nuance.
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

// Seed each new tenant's Paige with the closest starter Playbook preset
// (src/lib/playbook/presets.ts) from the industry they pick — so Paige is native
// to their practice on day one. They can fully re-author it later in the editor.
const INDUSTRY_TO_PLAYBOOK: Record<string, string> = {
  "Coaching": "coaching-default",
  "Fitness & wellness": "fitness",
  "Consulting": "consultant",
  "Advisory / Professional services": "consultant",
  "Real estate": "consultant",
  "Agency / Marketing": "agency",
  "Creative / Design": "agency",
  // Creators / thought leaders and anything unlisted get the vertical-NEUTRAL
  // baseline, not a coaching-voiced one (§2).
  "Course creator / Thought leader": "general",
  "Other": "general",
};

type AccountType = "standalone" | "agency" | "enterprise";

// Each lane signs its OWN platform subscriber agreement before the account is
// created (§9 platform terms; interim, counsel-review pending). The hard stop is
// enforced server-side in provision_tenant, which validates the current
// agreement and records the acceptance in legal_acceptances atomically with the
// tenant — this checkbox is the human-facing half of that gate.
const LANE_TO_AGREEMENT: Record<AccountType, string> = {
  standalone: "saas-standalone",
  agency: "saas-agency",
  enterprise: "saas-enterprise",
};

const ACCOUNT_TYPES: {
  value: AccountType;
  title: string;
  tagline: string;
  detail: string;
  Icon: typeof User;
}[] = [
  {
    value: "standalone",
    title: "Standalone",
    tagline: "Your own practice.",
    detail: "One workspace, full control — run your own clients. No sub-accounts.",
    Icon: User,
  },
  {
    value: "agency",
    title: "Agency",
    tagline: "Run many businesses.",
    detail: "Create sub-accounts under your roof, each with its own clients, brand, and pipeline.",
    Icon: Network,
  },
  {
    value: "enterprise",
    title: "Enterprise",
    tagline: "Agency, at scale.",
    detail: "Everything in Agency plus room to grow — higher limits and white-label headroom.",
    Icon: Building2,
  },
];

interface Props {
  /** Called after a successful provision. Defaults to a hard nav into /admin. */
  onProvisioned?: () => void;
}

export function WorkspaceProvisioner({ onProvisioned }: Props) {
  const { toast } = useToast();
  const [accountType, setAccountType] = useState<AccountType>("standalone");
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryOther, setIndustryOther] = useState("");
  const [teamSize, setTeamSize] = useState<string>("");
  const [about, setAbout] = useState("");
  const [creating, setCreating] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // The agreement for the currently-selected lane. Re-consent whenever the lane
  // changes — standalone, agency, and enterprise are three different contracts.
  const agreementSlug = LANE_TO_AGREEMENT[accountType];
  const { doc: agreement, loading: agreementLoading } = useLegalDoc(agreementSlug);
  useEffect(() => { setAgreed(false); }, [accountType]);

  const createWorkspace = async () => {
    if (businessName.trim().length < 2) {
      toast({ title: "Name your business", description: "This becomes your workspace.", variant: "destructive" });
      return;
    }
    if (!agreement || !agreed) {
      toast({
        title: "Review the agreement",
        description: "Please read and accept the subscriber agreement for your account type to continue.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        toast({ title: "Session expired", description: "Sign back in to finish.", variant: "destructive" });
        return;
      }
      // Structured category, with the free-text write-in when they pick "Other".
      const resolvedIndustry =
        industry === "Other" ? (industryOther.trim() || null) : (industry || null);
      const { data: provisioned, error } = await supabase.rpc("provision_tenant", {
        _name: businessName.trim(),
        _industry: resolvedIndustry,
        _team_size: teamSize || null,
        _description: about.trim() || null,
        _account_type: accountType,
        // Server-side hard stop: provision_tenant refuses to create the account
        // unless a current lane agreement is passed, and records the acceptance.
        _agreement_slug: agreementSlug,
        _agreement_version: agreement.version,
      });
      if (error) throw error;

      // Seed Paige's Playbook from the chosen industry (non-blocking — the admin
      // editor can re-author it, and resolveActivePlaybook falls back to a neutral
      // default if this doesn't land).
      const tenantId = (provisioned as { id?: string } | null)?.id;
      const slug = INDUSTRY_TO_PLAYBOOK[industry] ?? "general";
      if (tenantId) {
        // _only_if_unset: never clobber an already-authored playbook if
        // provision_tenant returned a pre-existing tenant (idempotent).
        await supabase.rpc("set_tenant_playbook", { _tenant_id: tenantId, _slug: slug, _only_if_unset: true });
      }

      toast({ title: "Workspace ready", description: "Welcome to Paige — this is yours to run." });
      if (onProvisioned) onProvisioned();
      else window.location.assign("/admin");
    } catch (e) {
      toast({ title: "Couldn't create your workspace", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium">How do you want to run it?</Label>
          <p className="text-xs text-muted-foreground">You can change this anytime as you grow — nothing here locks you in.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {ACCOUNT_TYPES.map(({ value, title, tagline, detail, Icon }) => {
            const selected = accountType === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setAccountType(value)}
                aria-pressed={selected}
                className={cn(
                  "relative text-left rounded-xl border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-primary/50 hover:bg-muted/40",
                )}
              >
                {selected && (
                  <span className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <Icon className={cn("h-5 w-5 mb-2", selected ? "text-primary" : "text-muted-foreground")} />
                <div className="font-semibold text-sm">{title}</div>
                <div className="text-xs font-medium text-foreground/80">{tagline}</div>
                <p className="mt-1 text-xs text-muted-foreground leading-snug">{detail}</p>
              </button>
            );
          })}
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
              {" "}for a {ACCOUNT_TYPES.find((a) => a.value === accountType)?.title} account.
            </Label>
          </div>
          <p className="text-xs text-muted-foreground pl-7">
            Interim terms while our full legal review is completed. Your account isn't created until you accept.
          </p>
        </div>
        <Button
          onClick={createWorkspace}
          disabled={creating || businessName.trim().length < 2 || !agreed || !agreement}
          className="w-full h-11"
        >
          {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating your workspace…</> : "Create my workspace"}
        </Button>
      </div>
    </div>
  );
}

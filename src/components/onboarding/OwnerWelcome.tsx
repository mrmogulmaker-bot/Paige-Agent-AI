/**
 * OwnerWelcome — the first-run welcome + checklist a brand-new tenant OWNER sees on
 * /admin, before they've done anything (§9/§10/§11). Replaces "provision → dropped on
 * a cold dashboard with zero orientation" with a warm, guided first move.
 *
 * §9/§51 — branches by tenant.account_type through an EXPLICIT journey descriptor map
 * (JOURNEY_BY_ACCOUNT_TYPE), never a binary standalone-else-agency fall-through: an
 * own-book owner (standalone, sub-account) is pointed at their own book ("Add your first
 * client"); an agency-book owner (agency, enterprise) is pointed at their book of
 * businesses ("Create your first sub-account" + "Invite your agency team"). Any account
 * type not in the map resolves to the own-book journey (DEFAULT_JOURNEY) — a new tier
 * lands on the safe own-clients first move, never silently inheriting the agency journey.
 * The two audiences are never conflated.
 *
 * §10 — completion lives in a TABLE, not React state or localStorage: every step
 * check and the dismiss both persist through get/set_owner_onboarding_state, the same
 * Paige-callable seam Paige uses. The UI is one caller; Paige is another.
 *
 * §11 — built on the primitive layer. Gold is spent ONLY on the single pending first
 * move (the primary CTA); once that step is done, no gold remains. Every other step is
 * a neutral link. Focus rings are indigo (--ring), inherited from the primitives.
 *
 * §2/§3 — coaching-generic, broad audience (coaches · consultants · agencies ·
 * advisors · thought leaders); no finance/credit vocab; mogul-founder voice.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { UserPlus, Users, Sparkles, Building2, ArrowRight, Check, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SectionCard, GlyphPlate, StatePill } from "@/components/ui/page";
import { PaigeMark } from "@/components/brand/PaigeMark";

export interface OnboardingState {
  dismissed?: boolean;
  completed_at?: string | null;
  steps?: Record<string, boolean>;
}

interface Step {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Label for the row's action button. */
  cta: string;
  /** The single first move — rendered gold while still pending (§11). */
  primary?: boolean;
}

// §9 — two distinct audiences, two distinct first moves. The own-book journey serves
// standalone owners AND sub-accounts (both run their own book of clients); the
// agency-book journey serves agency + enterprise (both run a book of sub-accounts).
// The account_type→journey mapping lives in JOURNEY_BY_ACCOUNT_TYPE below.
const STANDALONE_STEPS: Step[] = [
  {
    key: "activate_email",
    primary: true,
    label: "Activate your Paige email",
    description:
      "Confirm your included sending address, then email a client from Conversations in minutes. Your own domain stays optional.",
    href: "/admin/integrations/email",
    icon: Mail,
    cta: "Activate email",
  },
  {
    key: "add_client",
    label: "Add and message your first client",
    description:
      "Create the client inside Conversations, write the first email, and keep every reply in the same thread.",
    href: "/admin/clients-hub/conversations?compose=1",
    icon: UserPlus,
    cta: "Start a conversation",
  },
  {
    key: "meet_paige",
    label: "Meet Paige & shape your Playbook",
    description:
      "Say hello, then teach her your voice, the questions you ask, and how you run your practice — she's native to your work, not a generic bot.",
    href: "/admin/playbook",
    icon: Sparkles,
    cta: "Open Your Paige",
  },
  {
    key: "invite_team",
    label: "Invite your team",
    description:
      "Bring your people in so the work is shared — Paige surfaces what each person needs and drafts the next move.",
    href: "/admin/members",
    icon: Users,
    cta: "Invite your team",
  },
];

const AGENCY_STEPS: Step[] = [
  {
    key: "activate_email",
    primary: true,
    label: "Activate your Paige email",
    description:
      "Confirm your included sending address, then email a client from Conversations in minutes. Your own domain stays optional.",
    href: "/admin/integrations/email",
    icon: Mail,
    cta: "Activate email",
  },
  {
    key: "create_subaccount",
    label: "Create your first sub-account",
    description:
      "Spin up a child workspace under your agency — its own clients, brand, and pipeline, with your brand on top.",
    href: "/agency",
    icon: Building2,
    cta: "Create your first sub-account",
  },
  {
    key: "invite_agency_team",
    label: "Invite your agency team",
    description:
      "Bring your operators in to help you run the book across every account you manage.",
    href: "/agency/team",
    icon: Users,
    cta: "Invite your team",
  },
  {
    key: "meet_paige",
    label: "Meet Paige & shape your Playbook",
    description:
      "Say hello, then set the Playbook your whole book inherits — every sub-account starts native to how you work.",
    href: "/admin/playbook",
    icon: Sparkles,
    cta: "Open Your Paige",
  },
];

/**
 * The two authored first-run journeys. `own_book` = the owner runs their own book of
 * clients (standalone, sub-account); `agency_book` = the owner runs a book of
 * sub-accounts (agency, enterprise). Keyed off an explicit descriptor so a new
 * account_type maps to the RIGHT journey rather than falling through to agency (§213.e).
 */
type OnboardingJourney = "own_book" | "agency_book";

const JOURNEY_STEPS: Record<OnboardingJourney, Step[]> = {
  own_book: STANDALONE_STEPS,
  agency_book: AGENCY_STEPS,
};

// §9/§51 — every known account_type resolves to an EXPLICIT journey. Standalone and
// sub-account owners each run their OWN book; agency + enterprise run a book of
// sub-accounts. This is the source of truth, extended by adding a row — never by
// widening a binary ternary.
const JOURNEY_BY_ACCOUNT_TYPE: Record<string, OnboardingJourney> = {
  standalone: "own_book",
  sub_account: "own_book",
  agency: "agency_book",
  enterprise: "agency_book",
};

// The explicit default for any account_type NOT in the map (a future/unknown tier):
// the own-book journey — the safe, own-clients first move — never a silent agency
// fall-through that would wrongly tell them to spin up sub-accounts.
const DEFAULT_JOURNEY: OnboardingJourney = "own_book";

function resolveJourneySteps(accountType: string): Step[] {
  return JOURNEY_STEPS[JOURNEY_BY_ACCOUNT_TYPE[accountType] ?? DEFAULT_JOURNEY];
}

interface Props {
  tenantId: string;
  /**
   * The tenant's account_type ('standalone' | 'agency' | 'enterprise' | 'sub_account').
   * Mapped to a journey via JOURNEY_BY_ACCOUNT_TYPE; own-book (standalone, sub-account)
   * and agency-book (agency, enterprise) are the two authored journeys.
   */
  accountType: string;
  ownerName?: string | null;
  initialState: OnboardingState;
  /** Called after dismiss OR after the last step completes, so the parent hides us. */
  onClose: () => void;
}

export function OwnerWelcome({ tenantId, accountType, ownerName, initialState, onClose }: Props) {
  const steps = resolveJourneySteps(accountType);

  const [done, setDone] = useState<Record<string, boolean>>(initialState.steps ?? {});
  const [dismissing, setDismissing] = useState(false);

  const allDone = useMemo(() => steps.every((s) => done[s.key]), [steps, done]);

  // Persist a patch through the Paige-callable seam (§10). Types lag the migration,
  // so cast the RPC name like the other new-RPC callers (AgencyBoard pattern).
  const persist = useCallback(
    (patch: Record<string, unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase.rpc("set_owner_onboarding_state" as any, { p_tenant_id: tenantId, p_patch: patch }),
    [tenantId],
  );

  // Mark a step done on click. The `||` merge is shallow, so we send the FULL merged
  // steps object. Fire-and-forget: the Link navigates away immediately; the state is
  // authoritative on the next /admin load via get_owner_onboarding_state.
  const markStep = useCallback(
    (key: string) => {
      // Email activation is completed by the live connector state below—not by
      // clicking into setup. A reserved address alone is not a completed channel.
      if (key === "activate_email") return;
      const next = { ...done, [key]: true };
      setDone(next);
      void persist({ steps: next });
    },
    [done, persist],
  );

  // Keep the onboarding checklist grounded in the same active connector rail
  // Conversations uses. When the tenant returns from Email setup, this step
  // completes automatically; clicking the task never fakes completion.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("channel_connectors")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("channel_type", "email")
        .eq("active", true)
        .eq("status", "active")
        .limit(1);
      if (cancelled || error || !data?.length) return;
      setDone((current) => {
        if (current.activate_email) return current;
        const next = { ...current, activate_email: true };
        void persist({ steps: next });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [tenantId, persist]);

  // When the last step is checked, stamp completed_at once so the welcome doesn't
  // reappear, then hand control back to the parent overview.
  useEffect(() => {
    if (allDone && !initialState.completed_at) {
      void persist({ completed_at: new Date().toISOString(), steps: done }).then(() => onClose());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  const dismiss = useCallback(async () => {
    setDismissing(true);
    try {
      await persist({ dismissed: true });
    } finally {
      onClose();
    }
  }, [persist, onClose]);

  const greetingName = ownerName?.trim() ? `, ${ownerName.trim().split(/\s+/)[0]}` : "";

  return (
    <SectionCard className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-3">
        <PaigeMark className="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-semibold text-foreground">
            Put Paige to work{greetingName}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Complete these working connections in any order. Every action opens the exact surface that owns it.
          </p>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {steps.map((step) => {
          const isDone = Boolean(done[step.key]);
          return (
            <div key={step.key} className="flex items-center gap-4 px-5 py-4">
              <GlyphPlate icon={isDone ? Check : step.icon} size="sm" armed={step.primary && !isDone} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{step.label}</span>
                  {isDone && <StatePill state="success">Done</StatePill>}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
              </div>
              <div className="shrink-0">
                {isDone ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link to={step.href}>
                      Open <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                ) : (
                  <Button
                    asChild
                    variant={step.primary ? "gold" : "outline"}
                    size="sm"
                    onClick={() => markStep(step.key)}
                  >
                    <Link to={step.href}>{step.cta}</Link>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
        <p className="text-xs text-muted-foreground">
          These stay here until you finish them — nothing is locked in.
        </p>
        <Button variant="ghost" size="sm" onClick={dismiss} disabled={dismissing}>
          {dismissing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          I'll explore on my own
        </Button>
      </div>
    </SectionCard>
  );
}

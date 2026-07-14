/**
 * OwnerWelcome — the first-run welcome + checklist a brand-new tenant OWNER sees on
 * /admin, before they've done anything (§9/§10/§11). Replaces "provision → dropped on
 * a cold dashboard with zero orientation" with a warm, guided first move.
 *
 * §9 — branches by tenant.account_type: a Standalone owner is pointed at their own
 * book ("Add your first client"); an Agency/Enterprise owner is pointed at their book
 * of businesses ("Create your first sub-account" + "Invite your agency team"). The two
 * audiences are never conflated.
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
import { UserPlus, Users, Sparkles, Building2, ArrowRight, Check, Loader2 } from "lucide-react";
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

// §9 — two distinct audiences, two distinct first moves. Agency + Enterprise share
// the agency-operator journey (both run a book of sub-accounts).
const STANDALONE_STEPS: Step[] = [
  {
    key: "add_client",
    primary: true,
    label: "Add your first client",
    description:
      "Bring someone in and Paige starts working both sides — onboarding them and surfacing your next move here.",
    href: "/admin/clients",
    icon: UserPlus,
    cta: "Add your first client",
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
    key: "create_subaccount",
    primary: true,
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

interface Props {
  tenantId: string;
  /** 'standalone' | 'agency' | 'enterprise'. Agency + Enterprise share the journey. */
  accountType: string;
  ownerName?: string | null;
  initialState: OnboardingState;
  /** Called after dismiss OR after the last step completes, so the parent hides us. */
  onClose: () => void;
}

export function OwnerWelcome({ tenantId, accountType, ownerName, initialState, onClose }: Props) {
  const steps = accountType === "standalone" ? STANDALONE_STEPS : AGENCY_STEPS;

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
      const next = { ...done, [key]: true };
      setDone(next);
      void persist({ steps: next });
    },
    [done, persist],
  );

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
      {/* Warm masthead in Paige's voice — the first thing a new owner reads. */}
      <div className="flex items-start gap-4 border-b border-border/60 bg-primary/[0.04] px-5 py-5">
        <PaigeMark className="h-11 w-11 shrink-0" />
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Welcome to Paige
          </div>
          <h2 className="mt-0.5 font-display text-xl font-semibold leading-tight text-foreground">
            Your workspace is ready{greetingName}.
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            I'm Paige — I run the front and back of your practice: onboarding the people you serve,
            surfacing who needs you, and drafting your next move. Here's the shortest path to putting
            me to work. Do them in any order.
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

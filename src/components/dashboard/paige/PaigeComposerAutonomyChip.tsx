/**
 * PaigeComposerAutonomyChip — the REAL Paige-permissions control in the dedicated Solo chat composer.
 *
 * WHAT IS REAL HERE (§13/§18 — no parallel chat-only permissions system, no faked write):
 *   • It READS the tenant's true effective autonomy posture from `useSoloToolGovernance`, the one
 *     tenant-writable governance seam (`list_/resolve_tool_autonomy`). The chip label reflects that
 *     real state — it never asserts a posture the server does not hold.
 *   • "Ask first" is a REAL, persisted safety brake: it writes every capability to `confirm` through
 *     the canonical `set_tool_autonomy` seam (`setDomainMode(..., "confirm")`). This forces escalation
 *     and survives reload. It is honestly scoped — the copy says it sets your capabilities and does NOT
 *     silently touch standing automation grants (those live in Trust Compass). Admin-gated exactly as
 *     the server predicate is (`canWrite`); a non-admin gets a read-only, honestly-explained control.
 *   • "Act within my policy" and "Custom permissions" ROUTE to the real Trust Compass controls, where
 *     bounded per-capability grants are set/inspected/paused/revoked/audited. Granting autonomy stays
 *     deliberate and bounded (§67/§68) — the chip never blanket-enables `auto`, which would be both
 *     unsafe and untrue to "standing delegated authority."
 *
 * WHY THE ASYMMETRY IS CORRECT, NOT A GAP: there is no single global persisted "posture" seam today
 * (authority is ceiling + per-process grant + per-tool floor). A brake DOWN to ask-first is one safe
 * click; opening UP to autonomy must be a deliberate, bounded grant. So "Ask first" writes, and the
 * two autonomy modes route to the real controls. A true non-destructive global override layer is the
 * pending Trust Compass reconciliation slice's job — this chip reuses the existing seam and does not
 * fork it.
 *
 * §00: this control makes no visual judgement of its own; it ports the owner-specified chip using the
 * established Radix DropdownMenu + design tokens, gold reserved for the primary Send action.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, LockKeyhole, ShieldCheck, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useToast } from "@/hooks/use-toast";
import { useSoloToolGovernance, type SoloToolGovernance } from "@/solo/data/useSoloToolGovernance";
import { CAPABILITY_DOMAINS } from "@/solo/data/capabilityTools";
import { cn } from "@/lib/utils";

interface Props {
  /** The active tenant UUID (the workspace epoch). Null while the account resolves. */
  accountEpoch: string | null;
}

/** The subset of governance state the chip's honest label derives from. */
export type ChipGovView = Pick<SoloToolGovernance, "loading" | "configured" | "error" | "domains">;

export interface ChipView {
  label: string;
  summary: string | null;
  /** A real standing grant exists (some domain at `auto`). */
  hasStandingGrant: boolean;
  /** Configured AND nothing on standing auto — the workspace is in ask-first. */
  isAskFirst: boolean;
}

/**
 * Pure derivation of the chip's HONEST label from real governance state (§13). Exported so it is
 * unit-tested directly against real row-derived shapes, without a Radix render. The label never
 * asserts a posture the server does not hold: loading says "Checking…", an unconfigured/errored read
 * says so, and the posture is read from the domains' real effective postures.
 */
export function deriveChipView(gov: ChipGovView): ChipView {
  const hasStandingGrant = gov.configured && gov.domains.some((d) => d.posture === "guardrails");
  const isAskFirst = gov.configured && !hasStandingGrant;
  if (gov.loading) return { label: "Checking…", summary: null, hasStandingGrant, isAskFirst };
  if (!gov.configured) {
    return {
      label: "Permissions",
      summary: gov.error ? "Couldn't load your permissions." : "Not set up in this workspace yet.",
      hasStandingGrant,
      isAskFirst,
    };
  }
  return hasStandingGrant
    ? { label: "Within policy", summary: "Paige acts on her own only within the limits you've set.", hasStandingGrant, isAskFirst }
    : { label: "Ask first", summary: "Paige asks you before it acts.", hasStandingGrant, isAskFirst };
}

export function PaigeComposerAutonomyChip({ accountEpoch }: Props) {
  const gov = useSoloToolGovernance(accountEpoch);
  const { activeTenant } = useTenantContext();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const account = activeTenant?.account_number ?? null;
  const trustCompassPath = account ? `/solo/${account}/command-center/trust-compass` : null;

  const { label, summary, hasStandingGrant, isAskFirst } = useMemo(
    () => deriveChipView(gov),
    [gov],
  );

  const openTrustCompass = () => {
    if (trustCompassPath) navigate(trustCompassPath);
  };

  const applyAskFirst = async () => {
    if (!gov.canWrite || busy) return;
    setBusy(true);
    // A real, canonical write per domain — NOT atomic (the hook says so), so we report honestly.
    const results = await Promise.all(CAPABILITY_DOMAINS.map((d) => gov.setDomainMode(d.key, "confirm")));
    setBusy(false);
    const failed = results.filter((r) => !r.ok).length;
    if (failed) {
      toast({
        title: "Some capabilities couldn't be set to ask-first",
        description: "Nothing was faked as saved. Try again, or open Trust Compass to set them.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Paige will ask first",
        description:
          "Every capability now asks before it acts. Standing automations aren't changed here — manage those in Trust Compass.",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-solo-autonomy-chip="true"
          aria-label={`Paige permissions, currently ${label}`}
          className={cn(
            // Compact, calm neutral/violet control — never gold (gold is the Send act only).
            "inline-flex flex-none items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors",
            "hover:border-border-strong hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
          )}
        >
          <LockKeyhole size={13} aria-hidden />
          <span className="hidden sm:inline">Paige permissions</span>
          <span aria-hidden className="hidden sm:inline text-border-strong">·</span>
          <span className="font-medium text-foreground">{label}</span>
          <ChevronDown size={12} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-72">
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          How much Paige may do on its own
        </DropdownMenuLabel>
        {summary && <p className="px-2 pb-1 text-xs text-muted-foreground">{summary}</p>}
        <DropdownMenuSeparator />

        {/* Ask first — the real, persisted safety brake through the canonical seam. */}
        <DropdownMenuItem
          disabled={!gov.canWrite || busy}
          onSelect={() => void applyAskFirst()}
          className="flex flex-col items-start gap-0.5"
        >
          <span className="flex w-full items-center gap-2">
            <LockKeyhole size={13} aria-hidden />
            <span className="font-medium">Ask first</span>
            {isAskFirst && <Check size={13} aria-hidden className="ml-auto text-primary" />}
          </span>
          <span className="text-xs text-muted-foreground">
            Paige asks before every capability acts. Standing automations are managed in Trust Compass.
          </span>
          {!gov.canWrite && (
            <span className="text-xs text-muted-foreground">
              {gov.authorityUnconfirmed
                ? "Couldn't confirm your access — open Trust Compass to view."
                : "Only a workspace admin can change this."}
            </span>
          )}
        </DropdownMenuItem>

        {/* Act within my policy — routes to the real bounded-grant controls (never a blanket enable). */}
        <DropdownMenuItem
          disabled={!trustCompassPath}
          onSelect={() => openTrustCompass()}
          className="flex flex-col items-start gap-0.5"
        >
          <span className="flex w-full items-center gap-2">
            <ShieldCheck size={13} aria-hidden />
            <span className="font-medium">Act within my policy</span>
            {hasStandingGrant && <Check size={13} aria-hidden className="ml-auto text-primary" />}
          </span>
          <span className="text-xs text-muted-foreground">
            Paige acts on her own only inside the bounded grants you set per capability. Set them in Trust Compass.
          </span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Custom permissions — the full real controls. */}
        <DropdownMenuItem
          disabled={!trustCompassPath}
          onSelect={() => openTrustCompass()}
          className="flex flex-col items-start gap-0.5"
        >
          <span className="flex w-full items-center gap-2">
            <SlidersHorizontal size={13} aria-hidden />
            <span className="font-medium">Custom permissions</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Open the full controls to set, inspect, pause, revoke, and audit what Paige can do.
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default PaigeComposerAutonomyChip;

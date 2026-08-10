// ConversationsCallButton — the ONE click-to-call act for the open-thread header, shared by
// BOTH conversation scopes (§18 one home). It sits in the tenant Client-Hub inbox header AND
// the operator Fleet Communications header, driven ENTIRELY by an adapter-shaped call model —
// so the button never knows tenant vs operator (§9/§51): the scope hands it a `placeCall`
// callback + the dialable `destination` + a `hasVoiceCalling` capability flag, and this button
// decides only how to PRESENT the act.
//
// It is distinct from the per-number inline `components/admin/voice/CallButton` (a neutral tap
// beside any rendered phone number, deliberately gold-free because a gold icon on every row
// would over-spend the accent). THIS button is the thread's single primary CALL act — like the
// composer's Send — so gold is EARNED on it (§11: gold only on the act). Gold is spent only when
// the act is available; a live/connecting call switches to a neutral indigo "on call" indicator
// (the act is over — hang-up lives in the one top-nav dialer), and an unavailable state is a
// plain disabled control with an HONEST tooltip (§13 — never a fake dial).
//
// Live call state is read from the ONE shared VoiceDeviceProvider (`useVoiceDevice`) — the single
// Device that serves both scopes (§18). That is not a scope branch: the context is identical for
// tenant and operator; the operator simply mints an operator-identity token on the same Device
// (Phase 3). When no provider is mounted (a surface outside the admin shell) the button degrades
// to its prop-only state instead of crashing.
//
// §11: gold ONLY on the available act; token-only; AA both themes; motion-safe (the in-call pulse
// is gated by useReducedMotion). §13: honest disabled tooltips; no fabricated call state.
import { Phone, PhoneCall, Loader2 } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from "@/components/ui/tooltip";
import { useVoiceDevice, normalizeDialNumber } from "@/lib/voice/VoiceDeviceProvider";

export interface ConversationsCallButtonProps {
  /** Scope capability — does this line support browser calling at all (voice caller-id
   *  provisioned)? False → a disabled control with the honest `unavailableReason` tooltip. */
  hasVoiceCalling: boolean;
  /** The number to dial for the OPEN thread (tenant: contact phone; operator: counterparty_phone).
   *  Null/empty → disabled with a "no number on file" tooltip (§13 — never a blind dial). */
  destination?: string | null;
  /** The scope's placement seam (tenant + operator both drive the one shared Device via
   *  `voice.callFrom`). Kept as a callback so the shell stays scope-agnostic (§9). */
  onPlaceCall: (destination: string) => void;
  /** Honest reason shown in the tooltip when `hasVoiceCalling` is false (e.g. operator voice
   *  caller-id not configured). Defaults to a generic not-set-up line. */
  unavailableReason?: string | null;
  /** Compact icon-only vs the labelled "Call" pill (header default: labelled). */
  iconOnly?: boolean;
  className?: string;
}

export function ConversationsCallButton({
  hasVoiceCalling,
  destination,
  onPlaceCall,
  unavailableReason,
  iconOnly = false,
  className,
}: ConversationsCallButtonProps) {
  const reduce = useReducedMotion();
  const voice = useVoiceDevice();

  const normalizedDest = destination ? normalizeDialNumber(destination) : "";
  const status = voice?.status ?? "idle";
  const needsConfig = status === "needs_config";

  // Is the live/connecting call THIS thread's number? (call() sets activeCall.number at dial time,
  // so "connecting" already carries the number.) Match on normalized digits so formatting differs
  // (+1 470… vs (470)…) never desyncs the indicator.
  const activeNumber = voice?.activeCall ? normalizeDialNumber(voice.activeCall.number) : "";
  const thisCallLive =
    (status === "connecting" || status === "in_call") &&
    !!normalizedDest && activeNumber === normalizedDest;
  const anotherCallLive =
    (status === "connecting" || status === "in_call" || status === "ringing") && !thisCallLive;

  const callable =
    hasVoiceCalling && !!voice && !!normalizedDest && !needsConfig && !anotherCallLive && !thisCallLive;

  // ── honest tooltip copy (§13) — most-specific reason first ──────────────────────────────────
  const tooltip = thisCallLive
    ? status === "in_call"
      ? "On this call — use the dialer to hang up."
      : "Connecting this call…"
    : !hasVoiceCalling
      ? unavailableReason ?? "Calling isn’t set up for this line yet."
      : needsConfig
        ? voice?.reason ?? "Calling isn’t set up yet."
        : !voice
          ? "Calling is unavailable on this surface."
          : !normalizedDest
            ? "No phone number on file to call."
            : anotherCallLive
              ? "Another call is in progress."
              : `Call ${destination}`;

  const label = thisCallLive ? (status === "in_call" ? "On call" : "Calling…") : "Call";

  // Icon: a spinner while connecting THIS call, an active handset while it's live, else a dial handset.
  const Glyph =
    thisCallLive && status === "connecting" ? Loader2 : thisCallLive ? PhoneCall : Phone;

  const onClick = () => {
    if (!callable) return;
    onPlaceCall(destination!);
  };

  // §11 gold discipline: gold is reserved for the composer Send (THE primary act in a thread), so
  // the header Call is a neutral indigo action (secondary) — never a second co-visible gold that
  // dilutes which act is primary. Live call → same neutral indicator (label/icon change signal it);
  // unavailable → plain outline disabled control.
  const variant = callable || thisCallLive ? "secondary" : "outline";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* span wrapper so the tooltip still surfaces when the button is disabled */}
          <span className={cn("inline-flex", className)}>
            <Button
              type="button"
              variant={variant}
              size={iconOnly ? "icon" : "sm"}
              onClick={onClick}
              disabled={!callable}
              aria-disabled={!callable}
              aria-label={callable ? `Call ${destination}` : `${label}${tooltip ? ` — ${tooltip}` : ""}`}
              className={cn(
                iconOnly ? "h-8 w-8" : "h-8 gap-1.5 px-3",
                // Live-call indicator: a soft indigo pulse (motion-safe) so it reads as "active"
                // without spending gold. The spinner already conveys the connecting beat.
                thisCallLive &&
                  status === "in_call" &&
                  !reduce &&
                  "animate-pulse",
              )}
            >
              <Glyph
                className={cn(
                  iconOnly ? "h-4 w-4" : "h-3.5 w-3.5",
                  thisCallLive && status === "connecting" && "animate-spin",
                )}
                aria-hidden
              />
              {!iconOnly && <span>{label}</span>}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Paige agent-presence chrome — the shared right-rail + ⌘K launcher primitive
 * (Wave 4 Slice 4a.1, agent-ui-placement spec §4/§5/§5a).
 *
 * This is PLACEMENT chrome, not the chat's internal design (spec §11 non-goal). It
 * gives the platform a single home (§18) for "where Paige lives on a surface": a
 * docked, collapsible, account-type-aware presence rail plus a universal ⌘K
 * launcher, with the VP persona left as a clean prop/seam (persona.ts) until the
 * VP_ROSTER-vs-roster authority is ruled.
 *
 * Host usage (once per auth-gated, non-Studio shell):
 *   <AgentPresenceProvider>
 *     … shell (reserve the AGENT_RAIL_COLLAPSED_REM gutter on md+) …
 *     <AgentPresence />
 *   </AgentPresenceProvider>
 *
 * NAMING SEAM (§12 findability): this directory `components/ui/paige/` holds the
 * shared UI-PRIMITIVE chrome for where Paige LIVES on a surface (the placement rail +
 * ⌘K launcher). It is distinct from the pre-existing `components/paige/` (e.g.
 * `PaigeSidebar`), which is FEATURE surface — Paige's actual conversation/feature UI.
 * ui-primitive (placement) here; feature-rail there. Keep new placement chrome here.
 */
export { AgentPresenceProvider, useAgentPresence } from "./AgentPresenceContext";
export {
  AgentRail,
  AGENT_RAIL_COLLAPSED_REM,
  AGENT_RAIL_EXPANDED_REM,
  type AgentRailProps,
} from "./AgentRail";
export { CommandLauncher, type CommandLauncherProps } from "./CommandLauncher";
export { AgentPresence, type AgentPresenceProps } from "./AgentPresence";
export {
  resolveAgentPersona,
  type AgentAccountType,
  type AgentPersona,
} from "./persona";

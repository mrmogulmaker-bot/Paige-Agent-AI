import type { SpineCapability } from "../contracts.ts";
import { classifyAction } from "../../action-risk.ts";
import { CRM_ACTION_CAPABILITY, type CrmAction } from "../../crm-command/catalog.ts";

/**
 * Contact domain — the governed capability declarations for the contact (public.clients) domain
 * that Chat consumes through the Capability Gateway rather than hand-wiring inline.
 *
 * First entry: contact.event_status — the READ verb behind "did my new-contact alert fire?". It
 * projects the delivery state of the contact.created native event (paige_native_events +
 * paige_event_dispatches) through public.get_contact_event_status, a SECURITY INVOKER read whose
 * tenant scope is RLS (never a caller-supplied tenant). It is `PARTIAL`, honestly: the substrate's
 * migration (20270119000000) is applied on prod only after the external #1147 Social migration
 * lands, so the read degrades to "not available yet" until then. It writes nothing and needs no
 * approval — a read_only, approvalAuthority:none action.
 */
export const CONTACT_EVENT_STATUS = {
  key: "contact.event_status",
  domain: "contact",
  owner: "contact",
  humanSurface: "/solo/:account/clients",
  action: {
    classification: "read",
    executor: "public.get_contact_event_status",
    idempotency: "read-only projection of paige_native_events / paige_event_dispatches; no rows written",
    riskPolicyKey: "read_only",
    approvalAuthority: "none",
    chatTool: "contact_event_status",
  },
  chatBinding: "PARTIAL",
  mindBinding: "UNAVAILABLE",
  sharedPrimitiveChange: "NONE",
  maturity: "PARTIAL",
} as const satisfies SpineCapability;

const CONTACT_ACTIONS = (Object.keys(CRM_ACTION_CAPABILITY) as CrmAction[]).filter((action) => !action.startsWith("deal."));
const contactRisk = (tool: string): "ordinary" | "high" => {
  const risk = classifyAction(tool);
  if (risk !== "ordinary" && risk !== "high") throw new Error(`CRM Spine action ${tool} is not classified`);
  return risk;
};

/** Canonical CRM commands owned by Contact/Company/Task/Activity domains and consumed by Chat. */
export const CONTACT_CRM_ACTIONS = CONTACT_ACTIONS.map((action) => {
  const tool = CRM_ACTION_CAPABILITY[action];
  const domain = action.split(".")[0];
  return {
    key: `${domain}.${tool}`,
    domain,
    owner: domain === "task" ? "command-center" : "contact",
    humanSurface: domain === "task" ? "/solo/:account/command-center" : "/solo/:account/clients",
    action: {
      classification: "mutate",
      executor: "public.execute_crm_command",
      idempotency: "tenant + actor + caller-settled request key; changed-payload reuse is refused and identical replay returns durable readback",
      riskPolicyKey: contactRisk(tool),
      approvalAuthority: "chat-canonical",
      chatTool: tool,
    },
    outcome: { kinds: ["observed"], projector: "public.record_capability_run", railVisibility: "owner_internal" },
    chatBinding: "LIVE",
    mindBinding: "UNAVAILABLE",
    sharedPrimitiveChange: "NONE",
    maturity: "PARTIAL",
  } as const satisfies SpineCapability;
});

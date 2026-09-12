import type { SpineCapability } from "../contracts.ts";

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

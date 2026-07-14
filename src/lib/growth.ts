// Shared types & helpers for the Growth OS / Vibe Coding Studio (pages, forms, funnels).
//
// This is the ONE type contract every studio surface keys off (WS-A ownership, per the
// build blueprint): the block union, form/questionnaire schema incl. branching logic,
// funnel model, and the data-driven on-submit automation registry. The public renderers,
// the studio preview, the server-side validators, and Paige's tools all conform to these
// shapes — so a block or field type is added here first, in lockstep with the validator
// and the renderer, never in only one place.
import { supabase } from "@/integrations/supabase/client";

// ────────────────────────────────────────────────────────────────────────────
// Forms & questionnaires
// ────────────────────────────────────────────────────────────────────────────

export type GrowthFieldType =
  | "text" | "email" | "tel" | "number" | "date"
  | "textarea" | "select" | "radio" | "checkbox" | "ssn4" | "currency";

/** A choice for select/radio/checkbox fields. A bare string is shorthand for {label,value}. */
export type GrowthFieldOption = string | { label: string; value: string };

/** Normalize a choice to its submitted value / its displayed label. */
export const growthOptionValue = (o: GrowthFieldOption): string => (typeof o === "string" ? o : o.value);
export const growthOptionLabel = (o: GrowthFieldOption): string => (typeof o === "string" ? o : o.label);

export type GrowthConditionOp =
  | "eq" | "neq" | "in" | "not_in" | "gt" | "lt" | "gte" | "lte"
  | "contains" | "answered" | "empty";

/** A single branching condition: "field <op> value". `answered`/`empty` ignore `value`. */
export interface GrowthCondition {
  field: string;               // an EARLIER field key (no forward/dangling references)
  op: GrowthConditionOp;
  value?: string | number | string[];
}

/** Show the field/section only when these conditions hold. `all` = AND, `any` = OR. */
export interface GrowthVisibleWhen {
  all?: GrowthCondition[];
  any?: GrowthCondition[];
}

export interface GrowthFieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;            // JS-safe regex source
}

export interface GrowthField {
  key: string;
  label: string;
  type: GrowthFieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: GrowthFieldOption[];
  default?: string;
  validation?: GrowthFieldValidation;
  /** Conditional visibility — hidden fields are not required and are stripped from the payload. */
  visible_when?: GrowthVisibleWhen;
  /** Optional path a submission writes into when processed.
   *  e.g. "clients.email", "businesses.legal_name", "clients.company". */
  maps_to?: string;
}

export interface GrowthFormSection {
  title: string;
  description?: string;
  fields: GrowthField[];
  /** Conditional visibility for the whole step/section. */
  visible_when?: GrowthVisibleWhen;
}

export interface GrowthFormSchema {
  sections: GrowthFormSection[];
  submit_label?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Landing-page blocks (the 17-type union — kept in lockstep with the server-side
// validator in growth_page_upsert and the shared GrowthBlocks renderer)
// ────────────────────────────────────────────────────────────────────────────

export interface GrowthCtaRef { cta_label?: string; cta_href?: string }

export type GrowthBlock =
  // — original six —
  | { type: "hero"; eyebrow?: string; title: string; subtitle?: string;
      cta_label?: string; cta_href?: string; image_url?: string;
      image_position?: "full" | "split"; quote?: string }
  | { type: "phase_cards"; title?: string;
      cards: { phase: string; title: string; body: string; outcome?: string }[] }
  | { type: "feature_grid"; title?: string; items: { title: string; body: string; icon?: string }[] }
  | { type: "cta"; title: string; body?: string; cta_label: string; cta_href: string }
  | { type: "rich_text"; html: string }
  | { type: "embedded_form"; form_slug: string; title?: string }
  // — expansion (Framer/Webflow-class landing surfaces) —
  | { type: "social_proof"; title?: string; logos: { name: string; image_url?: string }[] }
  | { type: "testimonial";
      items: { quote: string; author?: string; role?: string; avatar_url?: string; rating?: number }[] }
  | { type: "pricing"; title?: string;
      tiers: { name: string; price: string; period?: string; features: string[];
               cta_label?: string; cta_href?: string; featured?: boolean }[] }
  | { type: "faq"; title?: string; items: { question: string; answer: string }[] }
  | { type: "media"; provider: "youtube" | "vimeo" | "loom" | "mp4"; url: string;
      title?: string; caption?: string }
  | { type: "stats"; title?: string; items: { value: string; label: string }[] }
  | { type: "countdown"; title?: string; ends_at: string; subtitle?: string; expired_text?: string }
  | { type: "two_column"; heading?: string; body?: string; image_url?: string;
      image_side?: "left" | "right"; cta_label?: string; cta_href?: string }
  | { type: "image"; url: string; alt?: string; caption?: string }
  | { type: "gallery"; title?: string; images: { url: string; alt?: string; caption?: string }[] }
  | { type: "steps"; title?: string; items: { number?: string; title: string; body: string }[] };

export type GrowthBlockType = GrowthBlock["type"];

/** Blocks that carry an outbound/media URL — the generator omits these entirely when it
 *  has no real https URL (never emitted with placeholder tokens), and the server validates
 *  the URL. Kept here so the UI, generator, and validator agree on the set. */
export const URL_BEARING_BLOCKS: readonly GrowthBlockType[] = [
  "media", "image", "gallery",
] as const;

export interface GrowthPageTheme {
  primary?: string;     // hex
  accent?: string;      // hex
  background?: string;  // hex
  text?: string;        // hex
  font?: string;
  logo_url?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Funnels (page → form → booking/payment → thankyou)
// ────────────────────────────────────────────────────────────────────────────

export type GrowthFunnelStepType = "page" | "form" | "payment" | "booking" | "thankyou";

/** Per-step-type extras. The page/form links are real FK columns, not config. */
export type GrowthFunnelStepConfig =
  | { cta_label?: string; advance?: "cta" | "auto" }              // page
  | { prefill_from_session?: boolean }                            // form
  | { provider: "cal" | "calendly" | "internal"; embed_url?: string }  // booking (roadmap)
  | { provider: "stripe"; mode?: "payment" | "subscription"; price_ref?: string } // payment (roadmap)
  | { headline?: string; message?: string; redirect_url?: string }; // thankyou

export interface GrowthFunnelStep {
  id?: string;
  order_index: number;
  step_type: GrowthFunnelStepType;
  page_id?: string | null;
  form_id?: string | null;
  /** Authoring-time slug refs the upsert RPC resolves to page_id/form_id server-side. */
  page_slug?: string;
  form_slug?: string;
  config_json?: GrowthFunnelStepConfig;
}

// ────────────────────────────────────────────────────────────────────────────
// On-submit automation registry (config-as-data: a new target is a new row, not code)
// ────────────────────────────────────────────────────────────────────────────

export type GrowthAutomationExecutor =
  | "contact_upsert"      // create/update the contact from the submission
  | "pipeline_attach"     // drop them on a pipeline stage (opt. create a deal)
  | "paige_action"        // file a Paige follow-up on the action bus
  | "surface_to_client"   // surface a next-step card in the client portal
  | "client_rail_event"   // emit onto the client events rail
  | "n8n_workflow"         // fire a connected workflow
  | "outbound_webhook"    // POST to a connected endpoint
  | "notify_team";        // notify tenant members

export type GrowthAutonomyLane = "auto" | "confirm" | "off";

/** Platform catalog row (no tenant_id, §9) — one per executor branch the processor knows. */
export interface GrowthAutomationTarget {
  slug: string;
  label: string;
  description: string;
  executor: GrowthAutomationExecutor;
  config_schema?: Record<string, unknown>;
  enabled: boolean;
  display_order: number;
}

/** Tenant config row — which targets a form fires, ordered, with per-row config.
 *  config_json holds references only (ids/slugs) — never URLs or secrets. */
export interface GrowthFormAutomation {
  id: string;
  tenant_id: string;
  form_id: string;
  target_slug: string;
  order_index: number;
  enabled: boolean;
  /** Optional OVERRIDE of the action kind's default lane; null = use the kind default. */
  autonomy_lane?: GrowthAutonomyLane | null;
  config_json: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

export async function submitGrowthForm(opts: {
  form_id: string;
  tenant_id: string;
  payload: Record<string, unknown>;
  utm?: Record<string, string>;
  consent?: Record<string, unknown>;
  funnel_session_id?: string;
}) {
  const { error } = await supabase.from("growth_form_submissions").insert({
    form_id: opts.form_id,
    tenant_id: opts.tenant_id,
    payload_json: opts.payload as never,
    utm_json: (opts.utm ?? {}) as never,
    consent_json: (opts.consent ?? {}) as never,
    funnel_session_id: opts.funnel_session_id ?? null,
    source: "paige_form",
    referrer: typeof document !== "undefined" ? document.referrer : null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  });
  return { error };
}

export function readUtm(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","ref","gclid","fbclid"].forEach((k) => {
    const v = p.get(k);
    if (v) out[k] = v;
  });
  return out;
}

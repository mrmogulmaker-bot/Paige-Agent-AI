// Shared types & helpers for the Growth OS (pages, forms, funnels).
import { supabase } from "@/integrations/supabase/client";

export type GrowthFieldType =
  | "text" | "email" | "tel" | "number" | "date"
  | "textarea" | "select" | "radio" | "checkbox" | "ssn4" | "currency";

export interface GrowthField {
  key: string;
  label: string;
  type: GrowthFieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: string[];
  /** Optional path to write into when a submission is processed.
   *  e.g. "contacts.email", "businesses.legal_name", "clients.fico_score" */
  maps_to?: string;
}

export interface GrowthFormSection {
  title: string;
  description?: string;
  fields: GrowthField[];
}

export interface GrowthFormSchema {
  sections: GrowthFormSection[];
  submit_label?: string;
}

export type GrowthBlock =
  | { type: "hero"; eyebrow?: string; title: string; subtitle?: string;
      cta_label?: string; cta_href?: string; image_url?: string; quote?: string }
  | { type: "phase_cards"; cards: { phase: string; title: string; body: string; outcome?: string }[] }
  | { type: "feature_grid"; title?: string; items: { title: string; body: string }[] }
  | { type: "cta"; title: string; body?: string; cta_label: string; cta_href: string }
  | { type: "rich_text"; html: string }
  | { type: "embedded_form"; form_slug: string };

export interface GrowthPageTheme {
  primary?: string;     // hex
  accent?: string;      // hex
  background?: string;  // hex
  text?: string;        // hex
  font?: string;
  logo_url?: string;
}

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

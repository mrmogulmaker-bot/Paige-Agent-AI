// src/lib/legal/recordCommsConsent.ts
// Thin helper that calls the public.record_communications_consent RPC.
// Safe to call before or after auth; the RPC pulls auth.uid() server-side.
import { supabase } from "@/integrations/supabase/client";
import type { CommsConsentState } from "@/components/legal/CommunicationsConsent";

export type RecordCommsConsentArgs = {
  email: string;
  phone?: string | null;
  tenantId?: string | null;
  contactId?: string | null;
  source: string; // 'public_signup' | 'affiliate_apply' | 'intake' | 'workspace_settings' | ...
  consent: CommsConsentState;
};

export async function recordCommsConsent(args: RecordCommsConsentArgs) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
  try {
    const { data, error } = await supabase.rpc("record_communications_consent", {
      p_email: args.email,
      p_phone: args.phone ?? null,
      p_tenant_id: args.tenantId ?? null,
      p_contact_id: args.contactId ?? null,
      p_email_marketing: args.consent.emailMarketing,
      p_sms_marketing: args.consent.smsMarketing,
      p_sms_transactional: args.consent.smsTransactional,
      p_voice_marketing: false,
      p_source: args.source,
      p_ip_address: null, // resolved server-side via edge if needed
      p_user_agent: ua,
    });
    if (error) {
      // Never block the user's signup flow on consent logging.
      console.warn("[comms-consent] record failed:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data as string };
  } catch (e) {
    console.warn("[comms-consent] record threw:", e);
    return { ok: false, error: (e as Error).message };
  }
}

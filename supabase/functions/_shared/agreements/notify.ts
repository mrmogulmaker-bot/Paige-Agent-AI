// _shared/agreements/notify.ts — telling people what happened (INT-163).
//
// THE RULE THIS FILE EXISTS TO HOLD: a failed notification NEVER changes the record. Sealing is the
// legal act; an email announces it. If the announcement fails, the agreement is still completed, the
// signature still stands, and what we do is log loudly and let the owner see the truth in their
// workspace. Rolling back a sealed legal document because a mail provider had a bad minute would be
// destroying evidence to fix a delivery problem.
//
// Everything here therefore returns an outcome and throws nothing at its callers.

export type NotifyOutcome = { sent: boolean; reason?: string };

interface NotifyInput {
  supabaseUrl: string;
  serviceKey: string;
  templateName: string;
  recipientEmail: string;
  tenantId: string;
  idempotencyKey: string;
  templateData: Record<string, unknown>;
}

export async function notify(input: NotifyInput): Promise<NotifyOutcome> {
  // Absent provider is an honest outcome, not an error to bury. The send path refuses BEFORE
  // freezing an agreement for exactly this reason; by the time we are notifying, the act has
  // already happened and there is nothing to undo.
  if (!Deno.env.get("RESEND_API_KEY")) {
    console.warn("[agreements] no email provider configured — notification not sent", {
      template: input.templateName,
    });
    return { sent: false, reason: "needs_config" };
  }
  try {
    const res = await fetch(`${input.supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.serviceKey}`,
        apikey: input.serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateName: input.templateName,
        recipientEmail: input.recipientEmail,
        tenantId: input.tenantId,
        idempotencyKey: input.idempotencyKey,
        templateData: input.templateData,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error("[agreements] notification rejected by the sender", {
        template: input.templateName, status: res.status, detail,
      });
      return { sent: false, reason: `sender_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error("[agreements] notification could not be delivered", {
      template: input.templateName, error: String(e),
    });
    return { sent: false, reason: "unreachable" };
  }
}

/**
 * Who to tell when something happens on an agreement.
 *
 * Resolved rather than assumed: `tenants` carries no contact column (its `brand` jsonb holds a
 * `support_email`, which is a PUBLIC-facing address and the wrong place to send "somebody signed
 * your contract"). So this walks the workspace's own OWNER membership to that person's account
 * address, preferring an explicit brand support address only if no owner can be resolved.
 *
 * Returns null rather than a guess. A notification sent to the wrong address is worse than one that
 * did not go: the caller logs the gap and the owner still sees the truth in their workspace.
 */
export async function ownerNotificationEmail(
  db: { from: (t: string) => any; auth: { admin: { getUserById: (id: string) => Promise<any> } } },
  tenantId: string,
): Promise<string | null> {
  const { data: owner } = await db.from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenantId).eq("role", "owner").eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1).maybeSingle();

  if (owner?.user_id) {
    try {
      const { data } = await db.auth.admin.getUserById(String(owner.user_id));
      const email = data?.user?.email as string | undefined;
      if (email && email.includes("@")) return email;
    } catch (e) {
      console.error("[agreements] owner address could not be resolved", { tenantId, error: String(e) });
    }
  }

  const { data: tenant } = await db.from("tenants").select("brand").eq("id", tenantId).maybeSingle();
  const support = (tenant?.brand as { support_email?: string } | null)?.support_email;
  return support && support.includes("@") ? support : null;
}

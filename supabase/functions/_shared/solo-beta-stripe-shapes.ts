/**
 * Stripe Basil moved subscription periods to subscription items and moved an
 * invoice's subscription reference under invoice.parent. Keep those provider
 * shape decisions in one pure, testable boundary.
 */
export function readSubscriptionItemPeriod(item: {
  current_period_start?: number | null;
  current_period_end?: number | null;
} | null | undefined): { start: string; end: string } | null {
  const start = item?.current_period_start;
  const end = item?.current_period_end;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start! <= 0 || end! <= start!) {
    return null;
  }
  return {
    start: new Date(start! * 1000).toISOString(),
    end: new Date(end! * 1000).toISOString(),
  };
}

export function readInvoiceSubscriptionId(invoice: {
  parent?: {
    type?: string | null;
    subscription_details?: {
      subscription?: string | { id?: string | null } | null;
    } | null;
  } | null;
}): string | null {
  if (invoice.parent?.type !== "subscription_details") return null;
  const subscription = invoice.parent.subscription_details?.subscription;
  if (typeof subscription === "string") return subscription || null;
  return subscription?.id || null;
}

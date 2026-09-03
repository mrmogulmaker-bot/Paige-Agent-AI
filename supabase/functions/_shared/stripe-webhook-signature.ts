// Signature verification stays before every route and uses the async Web Crypto
// seam required by Supabase's Deno runtime. Fail closed without raw provider errors.
// deno-lint-ignore-file no-explicit-any
export async function verifyStripeWebhook(
  body: string, signature: string,
  legacy: any, v2: any, legacySecret: string, v2Secret: string, cryptoProvider: any,
): Promise<{ event: any; account: 'legacy' | 'v2' } | null> {
  if (!signature) return null;
  if (v2Secret) {
    try {
      const event = await v2.webhooks.constructEventAsync(body, signature, v2Secret, undefined, cryptoProvider);
      return { event, account: 'v2' };
    } catch { /* An independently configured legacy account may have signed it. */ }
  }
  if (legacySecret) {
    try {
      const event = await legacy.webhooks.constructEventAsync(body, signature, legacySecret, undefined, cryptoProvider);
      return { event, account: 'legacy' };
    } catch { /* Never expose verification details or signature material. */ }
  }
  return null;
}

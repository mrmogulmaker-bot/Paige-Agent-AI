/** Persistence boundary called only AFTER the existing entry point verifies the raw signature. */
export type Receipt = { receiptId: string; messageId: string; status: string; eventAt: string | null };
type Dependencies = { ingest: (receipt: Receipt) => Promise<{ data: unknown; error: unknown }>; log: (category: string) => void };
const identifier = /^[A-Za-z0-9_-]{1,200}$/;
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const refusal = (status: number) => json({ ok: false, error: 'Receipt could not be accepted.' }, status);
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export async function readReceiptBody(req: Request): Promise<string> {
  const reader = req.body?.getReader(); if (!reader) return '';
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 262144) { await reader.cancel(); throw new Error('body_limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
}
export async function persistVerifiedReceipt(body: string, id: string, statuses: Record<string, string>, deps: Dependencies): Promise<Response> {
    if (!identifier.test(id)) return refusal(400);
    let event: unknown; try { event = JSON.parse(body); } catch { return refusal(400); }
    if (!object(event) || typeof event.type !== 'string') return refusal(400);
    const status = Object.prototype.hasOwnProperty.call(statuses, event.type) ? statuses[event.type] : null;
    if (!status) return json({ ok: true });
    if (!object(event.data) || typeof event.data.email_id !== 'string' || !identifier.test(event.data.email_id)) return refusal(400);
    let eventAt: string | null = null;
    if (event.created_at != null) {
      if (typeof event.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(event.created_at) || !Number.isFinite(Date.parse(event.created_at))) return refusal(400);
      eventAt = new Date(event.created_at).toISOString();
    }
    try {
      // First privileged access; only verified, allowlisted fields cross this boundary.
      const result = await deps.ingest({ receiptId: id, messageId: event.data.email_id, status, eventAt });
      if (result.error) { deps.log('receipt_store_unavailable'); return refusal(503); }
      if (result.data === 'conflict' || result.data === 'invalid') { deps.log('receipt_refused'); return refusal(409); }
      if (!['pending', 'processed', 'duplicate', 'unresolved'].includes(String(result.data))) { deps.log('receipt_store_unavailable'); return refusal(503); }
      // Pending is durably retained, not delivered. Unresolved is not a failed send.
      deps.log(`receipt_${String(result.data)}`); return json({ ok: true });
    } catch { deps.log('receipt_store_unavailable'); return refusal(503); }
}
